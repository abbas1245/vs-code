/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { RenderLineNumbersType, TextEditorCursorStyle, cursorStyleToString } from 'vs/editor/common/config/editorOptions';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ISelection, Selection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IIdentifiedSingleEditOperation, ISingleEditOperation, ITextModel, ITextModelUpdateOptions } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { SnippetController2 } from 'vs/editor/contrib/snippet/snippetController2';
import { IApplyEditsOptions, IEditorPropertiesChangeData, IResolvedTextEditorConfiguration, ITextEditorConfigurationUpdate, IUndoStopOptions, TextEditorRevealType } from 'vs/workbench/api/common/extHost.protocol';
import { IEditor } from 'vs/workbench/common/editor';
import { withNullAsUndefined } from 'vs/base/common/types';

export interface IFocusTracker {
	onGainedFocus(): void;
	onLostFocus(): void;
}

export class MainThreadTextEditorProperties {

	public static readFromEditor(previousProperties: MainThreadTextEditorProperties | null, model: ITextModel, codeEditor: ICodeEditor | null): MainThreadTextEditorProperties {
		const selections = MainThreadTextEditorProperties._readSelectionsFromCodeEditor(previousProperties, codeEditor);
		const options = MainThreadTextEditorProperties._readOptionsFromCodeEditor(previousProperties, model, codeEditor);
		const visibleRanges = MainThreadTextEditorProperties._readVisibleRangesFromCodeEditor(previousProperties, codeEditor);
		return new MainThreadTextEditorProperties(selections, options, visibleRanges);
	}

	private static _readSelectionsFromCodeEditor(previousProperties: MainThreadTextEditorProperties | null, codeEditor: ICodeEditor | null): Selection[] {
		let result: Selection[] | null = null;
		if (codeEditor) {
			result = codeEditor.getSelections();
		}
		if (!result && previousProperties) {
			result = previousProperties.selections;
		}
		if (!result) {
			result = [new Selection(1, 1, 1, 1)];
		}
		return result;
	}

	private static _readOptionsFromCodeEditor(previousProperties: MainThreadTextEditorProperties | null, model: ITextModel, codeEditor: ICodeEditor | null): IResolvedTextEditorConfiguration {
		if (model.isDisposed()) {
			if (previousProperties) {
				// shutdown time
				return previousProperties.options;
			} else {
				throw new Error('No valid properties');
			}
		}

		let cursorStyle: TextEditorCursorStyle;
		let lineNumbers: RenderLineNumbersType;
		if (codeEditor) {
			const codeEditorOpts = codeEditor.getConfiguration();
			cursorStyle = codeEditorOpts.viewInfo.cursorStyle;
			lineNumbers = codeEditorOpts.viewInfo.renderLineNumbers;
		} else if (previousProperties) {
			cursorStyle = previousProperties.options.cursorStyle;
			lineNumbers = previousProperties.options.lineNumbers;
		} else {
			cursorStyle = TextEditorCursorStyle.Line;
			lineNumbers = RenderLineNumbersType.On;
		}

		const modelOptions = model.getOptions();
		return {
			insertSpaces: modelOptions.insertSpaces,
			tabSize: modelOptions.tabSize,
			indentSize: modelOptions.indentSize,
			cursorStyle: cursorStyle,
			lineNumbers: lineNumbers
		};
	}

	private static _readVisibleRangesFromCodeEditor(previousProperties: MainThreadTextEditorProperties | null, codeEditor: ICodeEditor | null): Range[] {
		if (codeEditor) {
			return codeEditor.getVisibleRanges();
		}
		return [];
	}

	constructor(
		public readonly selections: Selection[],
		public readonly options: IResolvedTextEditorConfiguration,
		public readonly visibleRanges: Range[]
	) {
	}

	public generateDelta(oldProps: MainThreadTextEditorProperties | null, selectionChangeSource: string | null): IEditorPropertiesChangeData | null {
		const delta: IEditorPropertiesChangeData = {
			options: null,
			selections: null,
			visibleRanges: null
		};

		if (!oldProps || !MainThreadTextEditorProperties._selectionsEqual(oldProps.selections, this.selections)) {
			delta.selections = {
				selections: this.selections,
				source: withNullAsUndefined(selectionChangeSource)
			};
		}

		if (!oldProps || !MainThreadTextEditorProperties._optionsEqual(oldProps.options, this.options)) {
			delta.options = this.options;
		}

		if (!oldProps || !MainThreadTextEditorProperties._rangesEqual(oldProps.visibleRanges, this.visibleRanges)) {
			delta.visibleRanges = this.visibleRanges;
		}

		if (delta.selections || delta.options || delta.visibleRanges) {
			// something changed
			return delta;
		}
		// nothing changed
		return null;
	}

	private static _selectionsEqual(a: Selection[], b: Selection[]): boolean {
		if (a.length !== b.length) {
			return false;
		}
		for (let i = 0; i < a.length; i++) {
			if (!a[i].equalsSelection(b[i])) {
				return false;
			}
		}
		return true;
	}

	private static _rangesEqual(a: Range[], b: Range[]): boolean {
		if (a.length !== b.length) {
			return false;
		}
		for (let i = 0; i < a.length; i++) {
			if (!a[i].equalsRange(b[i])) {
				return false;
			}
		}
		return true;
	}

	private static _optionsEqual(a: IResolvedTextEditorConfiguration, b: IResolvedTextEditorConfiguration): boolean {
		if (a && !b || !a && b) {
			return false;
		}
		if (!a && !b) {
			return true;
		}
		return (
			a.tabSize === b.tabSize
			&& a.indentSize === b.indentSize
			&& a.insertSpaces === b.insertSpaces
			&& a.cursorStyle === b.cursorStyle
			&& a.lineNumbers === b.lineNumbers
		);
	}
}

/**
 * Text Editor that is permanently bound to the same model.
 * It can be bound or not to a CodeEditor.
 */
export class MainThreadTextEditor {

	private readonly _id: string;
	private _model: ITextModel;
	private readonly _modelService: IModelService;
	private _modelListeners: IDisposable[];
	private _codeEditor: ICodeEditor | null;
	private readonly _focusTracker: IFocusTracker;
	private _codeEditorListeners: IDisposable[];

	private _properties: MainThreadTextEditorProperties;
	private readonly _onPropertiesChanged: Emitter<IEditorPropertiesChangeData>;

	constructor(
		id: string,
		model: ITextModel,
		codeEditor: ICodeEditor,
		focusTracker: IFocusTracker,
		modelService: IModelService
	) {
		this._id = id;
		this._model = model;
		this._codeEditor = null;
		this._focusTracker = focusTracker;
		this._modelService = modelService;
		this._codeEditorListeners = [];

		this._onPropertiesChanged = new Emitter<IEditorPropertiesChangeData>();

		this._modelListeners = [];
		this._modelListeners.push(this._model.onDidChangeOptions((e) => {
			this._updatePropertiesNow(null);
		}));

		this.setCodeEditor(codeEditor);
		this._updatePropertiesNow(null);
	}

	public dispose(): void {
		this._model = null!;
		this._modelListeners = dispose(this._modelListeners);
		this._codeEditor = null;
		this._codeEditorListeners = dispose(this._codeEditorListeners);
	}

	private _updatePropertiesNow(selectionChangeSource: string | null): void {
		this._setProperties(
			MainThreadTextEditorProperties.readFromEditor(this._properties, this._model, this._codeEditor),
			selectionChangeSource
		);
	}

	private _setProperties(newProperties: MainThreadTextEditorProperties, selectionChangeSource: string | null): void {
		const delta = newProperties.generateDelta(this._properties, selectionChangeSource);
		this._properties = newProperties;
		if (delta) {
			this._onPropertiesChanged.fire(delta);
		}
	}

	public getId(): string {
		return this._id;
	}

	public getModel(): ITextModel {
		return this._model;
	}

	public getCodeEditor(): ICodeEditor | null {
		return this._codeEditor;
	}

	public hasCodeEditor(codeEditor: ICodeEditor | null): boolean {
		return (this._codeEditor === codeEditor);
	}

	public setCodeEditor(codeEditor: ICodeEditor | null): void {
		if (this.hasCodeEditor(codeEditor)) {
			// Nothing to do...
			return;
		}
		this._codeEditorListeners = dispose(this._codeEditorListeners);

		this._codeEditor = codeEditor;
		if (this._codeEditor) {

			// Catch early the case that this code editor gets a different model set and disassociate from this model
			this._codeEditorListeners.push(this._codeEditor.onDidChangeModel(() => {
				this.setCodeEditor(null);
			}));

			this._codeEditorListeners.push(this._codeEditor.onDidFocusEditorWidget(() => {
				this._focusTracker.onGainedFocus();
			}));
			this._codeEditorListeners.push(this._codeEditor.onDidBlurEditorWidget(() => {
				this._focusTracker.onLostFocus();
			}));

			this._codeEditorListeners.push(this._codeEditor.onDidChangeCursorSelection((e) => {
				// selection
				this._updatePropertiesNow(e.source);
			}));
			this._codeEditorListeners.push(this._codeEditor.onDidChangeConfiguration(() => {
				// options
				this._updatePropertiesNow(null);
			}));
			this._codeEditorListeners.push(this._codeEditor.onDidLayoutChange(() => {
				// visibleRanges
				this._updatePropertiesNow(null);
			}));
			this._codeEditorListeners.push(this._codeEditor.onDidScrollChange(() => {
				// visibleRanges
				this._updatePropertiesNow(null);
			}));
			this._updatePropertiesNow(null);
		}
	}

	public isVisible(): boolean {
		return !!this._codeEditor;
	}

	public getProperties(): MainThreadTextEditorProperties {
		return this._properties;
	}

	public get onPropertiesChanged(): Event<IEditorPropertiesChangeData> {
		return this._onPropertiesChanged.event;
	}

	public setSelections(selections: ISelection[]): void {
		if (this._codeEditor) {
			this._codeEditor.setSelections(selections);
			return;
		}

		const newSelections = selections.map(Selection.liftSelection);
		this._setProperties(
			new MainThreadTextEditorProperties(newSelections, this._properties.options, this._properties.visibleRanges),
			null
		);
	}

	private _setIndentConfiguration(newConfiguration: ITextEditorConfigurationUpdate): void {
		const creationOpts = this._modelService.getCreationOptions(this._model.getLanguageIdentifier().language, this._model.uri, this._model.isForSimpleWidget);

		if (newConfiguration.tabSize === 'auto' || newConfiguration.insertSpaces === 'auto') {
			// one of the options was set to 'auto' => detect indentation
			let insertSpaces = creationOpts.insertSpaces;
			let tabSize = creationOpts.tabSize;

			if (newConfiguration.insertSpaces !== 'auto' && typeof newConfiguration.insertSpaces !== 'undefined') {
				insertSpaces = newConfiguration.insertSpaces;
			}

			if (newConfiguration.tabSize !== 'auto' && typeof newConfiguration.tabSize !== 'undefined') {
				tabSize = newConfiguration.tabSize;
			}

			this._model.detectIndentation(insertSpaces, tabSize);
			return;
		}

		const newOpts: ITextModelUpdateOptions = {};
		if (typeof newConfiguration.insertSpaces !== 'undefined') {
			newOpts.insertSpaces = newConfiguration.insertSpaces;
		}
		if (typeof newConfiguration.tabSize !== 'undefined') {
			newOpts.tabSize = newConfiguration.tabSize;
		}
		if (typeof newConfiguration.indentSize !== 'undefined') {
			if (newConfiguration.indentSize === 'tabSize') {
				newOpts.indentSize = newOpts.tabSize || creationOpts.tabSize;
			} else {
				newOpts.indentSize = newConfiguration.indentSize;
			}
		}
		this._model.updateOptions(newOpts);
	}

	public setConfiguration(newConfiguration: ITextEditorConfigurationUpdate): void {
		this._setIndentConfiguration(newConfiguration);

		if (!this._codeEditor) {
			return;
		}

		if (newConfiguration.cursorStyle) {
			const newCursorStyle = cursorStyleToString(newConfiguration.cursorStyle);
			this._codeEditor.updateOptions({
				cursorStyle: newCursorStyle
			});
		}

		if (typeof newConfiguration.lineNumbers !== 'undefined') {
			let lineNumbers: 'on' | 'off' | 'relative';
			switch (newConfiguration.lineNumbers) {
				case RenderLineNumbersType.On:
					lineNumbers = 'on';
					break;
				case RenderLineNumbersType.Relative:
					lineNumbers = 'relative';
					break;
				default:
					lineNumbers = 'off';
			}
			this._codeEditor.updateOptions({
				lineNumbers: lineNumbers
			});
		}
	}

	public setDecorations(key: string, ranges: editorCommon.IDecorationOptions[]): void {
		if (!this._codeEditor) {
			return;
		}
		this._codeEditor.setDecorations(key, ranges);
	}

	public setDecorationsFast(key: string, _ranges: number[]): void {
		if (!this._codeEditor) {
			return;
		}
		const ranges: Range[] = [];
		for (let i = 0, len = Math.floor(_ranges.length / 4); i < len; i++) {
			ranges[i] = new Range(_ranges[4 * i], _ranges[4 * i + 1], _ranges[4 * i + 2], _ranges[4 * i + 3]);
		}
		this._codeEditor.setDecorationsFast(key, ranges);
	}

	public revealRange(range: IRange, revealType: TextEditorRevealType): void {
		if (!this._codeEditor) {
			return;
		}
		switch (revealType) {
			case TextEditorRevealType.Default:
				this._codeEditor.revealRange(range, editorCommon.ScrollType.Smooth);
				break;
			case TextEditorRevealType.InCenter:
				this._codeEditor.revealRangeInCenter(range, editorCommon.ScrollType.Smooth);
				break;
			case TextEditorRevealType.InCenterIfOutsideViewport:
				this._codeEditor.revealRangeInCenterIfOutsideViewport(range, editorCommon.ScrollType.Smooth);
				break;
			case TextEditorRevealType.AtTop:
				this._codeEditor.revealRangeAtTop(range, editorCommon.ScrollType.Smooth);
				break;
			default:
				console.warn(`Unknown revealType: ${revealType}`);
				break;
		}
	}

	public isFocused(): boolean {
		if (this._codeEditor) {
			return this._codeEditor.hasTextFocus();
		}
		return false;
	}

	public matches(editor: IEditor): boolean {
		if (!editor) {
			return false;
		}
		return editor.getControl() === this._codeEditor;
	}

	public applyEdits(versionIdCheck: number, edits: ISingleEditOperation[], opts: IApplyEditsOptions): boolean {
		if (this._model.getVersionId() !== versionIdCheck) {
			// throw new Error('Model has changed in the meantime!');
			// model changed in the meantime
			return false;
		}

		if (!this._codeEditor) {
			// console.warn('applyEdits on invisible editor');
			return false;
		}

		if (typeof opts.setEndOfLine !== 'undefined') {
			this._model.pushEOL(opts.setEndOfLine);
		}

		const transformedEdits = edits.map((edit): IIdentifiedSingleEditOperation => {
			return {
				range: Range.lift(edit.range),
				text: edit.text,
				forceMoveMarkers: edit.forceMoveMarkers
			};
		});

		if (opts.undoStopBefore) {
			this._codeEditor.pushUndoStop();
		}
		this._codeEditor.executeEdits('MainThreadTextEditor', transformedEdits);
		if (opts.undoStopAfter) {
			this._codeEditor.pushUndoStop();
		}
		return true;
	}

	async insertSnippet(template: string, ranges: readonly IRange[], opts: IUndoStopOptions) {

		if (!this._codeEditor) {
			return false;
		}

		const snippetController = SnippetController2.get(this._codeEditor);

		// // cancel previous snippet mode
		// snippetController.leaveSnippet();

		// set selection, focus editor
		const selections = ranges.map(r => new Selection(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn));
		this._codeEditor.setSelections(selections);
		this._codeEditor.focus();

		// make modifications
		await snippetController.insert(template, 0, 0, opts.undoStopBefore, opts.undoStopAfter);

		return true;
	}
}

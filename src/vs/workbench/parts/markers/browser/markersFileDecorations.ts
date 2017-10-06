/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions } from 'vs/workbench/common/contributions';
import { IMarkerService, IMarker } from 'vs/platform/markers/common/markers';
import { IResourceDecorationsService, DecorationType, IResourceDecorationData } from 'vs/workbench/services/decorations/browser/decorations';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { Registry } from 'vs/platform/registry/common/platform';
import Severity from 'vs/base/common/severity';
import { editorErrorForeground, editorWarningForeground } from 'vs/editor/common/view/editorColorRegistry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

class MarkersFileDecorations implements IWorkbenchContribution {

	private readonly _disposables: IDisposable[];
	private readonly _type: DecorationType;
	private _markerListener: IDisposable;

	constructor(
		@IMarkerService private _markerService: IMarkerService,
		@IResourceDecorationsService private _decorationsService: IResourceDecorationsService,
		@IConfigurationService private _configurationService: IConfigurationService
	) {
		//
		this._disposables = [
			this._configurationService.onDidUpdateConfiguration(this._updateEnablement, this),
			this._type = this._decorationsService.registerDecorationType(localize('errorAndWarnings', "Errors & Warnings"))
		];

		this._updateEnablement();
	}

	dispose(): void {
		dispose(this._markerListener);
		dispose(this._disposables);
	}

	getId(): string {
		return 'markers.MarkersFileDecorations';
	}

	private _updateEnablement(): void {
		let value = this._configurationService.getConfiguration<{ showOnFiles: boolean }>('problems');
		if (value) {
			this._markerListener = this._markerService.onMarkerChanged(this._onDidChangeMarker, this);
			this._onDidChangeMarker(this._markerService.read().map(marker => marker.resource));
		} else if (this._markerListener) {
			this._markerListener.dispose();
		}
	}

	private _onDidChangeMarker(resources: URI[]): void {
		for (const resource of resources) {
			const markers = this._markerService.read({ resource })
				.sort((a, b) => Severity.compare(a.severity, b.severity));

			const data = !isFalsyOrEmpty(markers) ? this._toFileDecorationData(markers[0]) : undefined;
			this._decorationsService.setDecoration(this._type, resource, data);
		}
	}

	private _toFileDecorationData(marker: IMarker): IResourceDecorationData {
		const { severity } = marker;
		const color = severity === Severity.Error ? editorErrorForeground : editorWarningForeground;
		return { severity, color };
	}
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(MarkersFileDecorations);

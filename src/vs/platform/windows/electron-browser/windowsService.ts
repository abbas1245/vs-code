/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { IWindowsService, INativeOpenDialogOptions, IEnterWorkspaceResult, CrashReporterStartOptions, IMessageBoxResult, MessageBoxOptions, SaveDialogOptions, OpenDialogOptions, IDevToolsOptions, INewWindowOptions, IURIToOpen } from 'vs/platform/windows/common/windows';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, reviveWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IRecentlyOpened } from 'vs/platform/history/common/history';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import { URI } from 'vs/base/common/uri';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { IMainProcessService } from 'vs/platform/mainProcess/electron-browser/mainProcessService';

export class WindowsService implements IWindowsService {

	_serviceBrand: any;

	private channel: IChannel;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		this.channel = mainProcessService.getChannel('windows');
	}

	get onWindowOpen(): Event<number> { return this.channel.listen('onWindowOpen'); }
	get onWindowFocus(): Event<number> { return this.channel.listen('onWindowFocus'); }
	get onWindowBlur(): Event<number> { return this.channel.listen('onWindowBlur'); }
	get onWindowMaximize(): Event<number> { return this.channel.listen('onWindowMaximize'); }
	get onWindowUnmaximize(): Event<number> { return this.channel.listen('onWindowUnmaximize'); }
	get onRecentlyOpenedChange(): Event<void> { return this.channel.listen('onRecentlyOpenedChange'); }

	pickFileFolderAndOpen(options: INativeOpenDialogOptions): Promise<void> {
		return this.channel.call('pickFileFolderAndOpen', options);
	}

	pickFileAndOpen(options: INativeOpenDialogOptions): Promise<void> {
		return this.channel.call('pickFileAndOpen', options);
	}

	pickFolderAndOpen(options: INativeOpenDialogOptions): Promise<void> {
		return this.channel.call('pickFolderAndOpen', options);
	}

	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): Promise<void> {
		return this.channel.call('pickWorkspaceAndOpen', options);
	}

	showMessageBox(windowId: number, options: MessageBoxOptions): Promise<IMessageBoxResult> {
		return this.channel.call('showMessageBox', [windowId, options]);
	}

	showSaveDialog(windowId: number, options: SaveDialogOptions): Promise<string> {
		return this.channel.call('showSaveDialog', [windowId, options]);
	}

	showOpenDialog(windowId: number, options: OpenDialogOptions): Promise<string[]> {
		return this.channel.call('showOpenDialog', [windowId, options]);
	}

	reloadWindow(windowId: number, args?: ParsedArgs): Promise<void> {
		return this.channel.call('reloadWindow', [windowId, args]);
	}

	openDevTools(windowId: number, options?: IDevToolsOptions): Promise<void> {
		return this.channel.call('openDevTools', [windowId, options]);
	}

	toggleDevTools(windowId: number): Promise<void> {
		return this.channel.call('toggleDevTools', windowId);
	}

	closeWorkspace(windowId: number): Promise<void> {
		return this.channel.call('closeWorkspace', windowId);
	}

	enterWorkspace(windowId: number, path: URI): Promise<IEnterWorkspaceResult> {
		return this.channel.call('enterWorkspace', [windowId, path]).then((result: IEnterWorkspaceResult) => {
			return { backupPath: result.backupPath, workspace: reviveWorkspaceIdentifier(result.workspace) };
		});
	}

	toggleFullScreen(windowId: number): Promise<void> {
		return this.channel.call('toggleFullScreen', windowId);
	}

	setRepresentedFilename(windowId: number, fileName: string): Promise<void> {
		return this.channel.call('setRepresentedFilename', [windowId, fileName]);
	}

	addRecentlyOpened(workspaces: URI[], folders: URI[], files: URI[]): Promise<void> {
		return this.channel.call('addRecentlyOpened', [workspaces, folders, files]);
	}

	removeFromRecentlyOpened(paths: Array<IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI>): Promise<void> {
		return this.channel.call('removeFromRecentlyOpened', paths);
	}

	clearRecentlyOpened(): Promise<void> {
		return this.channel.call('clearRecentlyOpened');
	}

	getRecentlyOpened(windowId: number): Promise<IRecentlyOpened> {
		return this.channel.call('getRecentlyOpened', windowId)
			.then((recentlyOpened: IRecentlyOpened) => {
				recentlyOpened.workspaces = recentlyOpened.workspaces.map(workspace => isChanneledWorkspaceIdentifier(workspace) ? reviveWorkspaceIdentifier(workspace) : URI.revive(workspace));
				recentlyOpened.files = recentlyOpened.files.map(URI.revive);
				return recentlyOpened;
			});
	}

	newWindowTab(): Promise<void> {
		return this.channel.call('newWindowTab');
	}

	showPreviousWindowTab(): Promise<void> {
		return this.channel.call('showPreviousWindowTab');
	}

	showNextWindowTab(): Promise<void> {
		return this.channel.call('showNextWindowTab');
	}

	moveWindowTabToNewWindow(): Promise<void> {
		return this.channel.call('moveWindowTabToNewWindow');
	}

	mergeAllWindowTabs(): Promise<void> {
		return this.channel.call('mergeAllWindowTabs');
	}

	toggleWindowTabsBar(): Promise<void> {
		return this.channel.call('toggleWindowTabsBar');
	}

	focusWindow(windowId: number): Promise<void> {
		return this.channel.call('focusWindow', windowId);
	}

	closeWindow(windowId: number): Promise<void> {
		return this.channel.call('closeWindow', windowId);
	}

	isFocused(windowId: number): Promise<boolean> {
		return this.channel.call('isFocused', windowId);
	}

	isMaximized(windowId: number): Promise<boolean> {
		return this.channel.call('isMaximized', windowId);
	}

	maximizeWindow(windowId: number): Promise<void> {
		return this.channel.call('maximizeWindow', windowId);
	}

	unmaximizeWindow(windowId: number): Promise<void> {
		return this.channel.call('unmaximizeWindow', windowId);
	}

	minimizeWindow(windowId: number): Promise<void> {
		return this.channel.call('minimizeWindow', windowId);
	}

	onWindowTitleDoubleClick(windowId: number): Promise<void> {
		return this.channel.call('onWindowTitleDoubleClick', windowId);
	}

	setDocumentEdited(windowId: number, flag: boolean): Promise<void> {
		return this.channel.call('setDocumentEdited', [windowId, flag]);
	}

	quit(): Promise<void> {
		return this.channel.call('quit');
	}

	relaunch(options: { addArgs?: string[], removeArgs?: string[] }): Promise<void> {
		return this.channel.call('relaunch', [options]);
	}

	whenSharedProcessReady(): Promise<void> {
		return this.channel.call('whenSharedProcessReady');
	}

	toggleSharedProcess(): Promise<void> {
		return this.channel.call('toggleSharedProcess');
	}

	openWindow(windowId: number, uris: IURIToOpen[], options?: { forceNewWindow?: boolean, forceReuseWindow?: boolean, forceOpenWorkspaceAsFile?: boolean, args?: ParsedArgs }): Promise<void> {
		return this.channel.call('openWindow', [windowId, uris, options]);
	}

	openNewWindow(options?: INewWindowOptions): Promise<void> {
		return this.channel.call('openNewWindow', options);
	}

	showWindow(windowId: number): Promise<void> {
		return this.channel.call('showWindow', windowId);
	}

	getWindows(): Promise<{ id: number; workspace?: IWorkspaceIdentifier; folderUri?: ISingleFolderWorkspaceIdentifier; title: string; filename?: string; }[]> {
		return this.channel.call<{ id: number; workspace?: IWorkspaceIdentifier; folderUri?: ISingleFolderWorkspaceIdentifier; title: string; filename?: string; }[]>('getWindows').then(result => {
			for (const win of result) {
				if (win.folderUri) {
					win.folderUri = URI.revive(win.folderUri);
				}
				if (win.workspace) {
					win.workspace = reviveWorkspaceIdentifier(win.workspace);
				}
			}
			return result;
		});
	}

	getWindowCount(): Promise<number> {
		return this.channel.call('getWindowCount');
	}

	log(severity: string, ...messages: string[]): Promise<void> {
		return this.channel.call('log', [severity, messages]);
	}

	showItemInFolder(path: URI): Promise<void> {
		return this.channel.call('showItemInFolder', path);
	}

	getActiveWindowId(): Promise<number | undefined> {
		return this.channel.call('getActiveWindowId');
	}

	openExternal(url: string): Promise<boolean> {
		return this.channel.call('openExternal', url);
	}

	startCrashReporter(config: CrashReporterStartOptions): Promise<void> {
		return this.channel.call('startCrashReporter', config);
	}

	updateTouchBar(windowId: number, items: ISerializableCommandAction[][]): Promise<void> {
		return this.channel.call('updateTouchBar', [windowId, items]);
	}

	openAboutDialog(): Promise<void> {
		return this.channel.call('openAboutDialog');
	}

	resolveProxy(windowId: number, url: string): Promise<string | undefined> {
		return Promise.resolve(this.channel.call('resolveProxy', [windowId, url]));
	}
}

function isChanneledWorkspaceIdentifier(obj: any): obj is IWorkspaceIdentifier {
	return obj && obj['configPath'];
}
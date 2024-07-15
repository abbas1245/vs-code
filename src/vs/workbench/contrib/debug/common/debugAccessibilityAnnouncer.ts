/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDebugService } from 'vs/workbench/contrib/debug/common/debug';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ILogService } from 'vs/platform/log/common/log';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';

export class DebugAccessibilityAnnouncer extends Disposable implements IWorkbenchContribution {
	static ID = 'workbench.contrib.debugAccessibilityAnnouncer';
	constructor(
		@IDebugService _debugService: IDebugService,
		@ILogService _logService: ILogService,
		@IAccessibilityService _accessibilityService: IAccessibilityService
	) {
		super();
		this._register(_debugService.getModel().onDidChangeWatchExpressionValue((e) => {
			if (!e) {
				return;
			}
			// TODO: settings to configure verbosity, whether value, name, neither, or both are announced
			_accessibilityService.alert(`${e.name} changed to ${e.value}`);
			console.log(e.name + e.value);
			_logService.trace(`debugAccessibilityAnnouncerValueChanged ${e.name} ${e.value}`);
		}));
	}
}

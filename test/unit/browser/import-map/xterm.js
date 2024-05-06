/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { importAmdModule } from './amdx.js'

const module = await importAmdModule(
	"node_modules/sinon/pkg/sinon.js",
)

export default module

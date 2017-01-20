/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as path from 'path';

export default class MarkdownRenderer {
	private md: any;

	private currentDocument: vscode.Uri;

	constructor() {
		const hljs = require('highlight.js');
		const mdnh = require('markdown-it-named-headers');
		this.md = require('markdown-it')({
			html: true,
			highlight: (str: string, lang: string) => {
				if (lang && hljs.getLanguage(lang)) {
					try {
						return `<pre class="hljs"><code><div>${hljs.highlight(lang, str, true).value}</div></code></pre>`;
					} catch (error) { }
				}
				return `<pre class="hljs"><code><div>${this.md.utils.escapeHtml(str)}</div></code></pre>`;
			}
		}).use(mdnh, {});

		this.addLineNumberRenderer(this.md, 'paragraph_open');
		this.addLineNumberRenderer(this.md, 'heading_open');
		this.addLineNumberRenderer(this.md, 'image');
		this.addLineNumberRenderer(this.md, 'code_block');

		this.addLinkNormalizer(this.md);
		this.addLinkValidator(this.md);
	}

	public render(document: vscode.Uri, text: string): string {
		this.currentDocument = document;
		return this.md.render(text);
	}

	private addLineNumberRenderer(md: any, ruleName: string): void {
		const original = md.renderer.rules[ruleName];
		md.renderer.rules[ruleName] = (tokens: any, idx: number, options: any, env: any, self: any) => {
			const token = tokens[idx];
			if (token.level === 0 && token.map && token.map.length) {
				token.attrSet('data-line', token.map[0]);
				token.attrJoin('class', 'code-line');
			}
			if (original) {
				return original(tokens, idx, options, env, self);
			} else {
				return self.renderToken(tokens, idx, options, env, self);
			}
		};
	}

	private addLinkNormalizer(md: any): void {
		const normalizeLink = md.normalizeLink;
		md.normalizeLink = (link: string) => {
			try {
				let uri = vscode.Uri.parse(link);
				if (!uri.scheme) {
					// Assume it must be a file
					if (uri.path[0] === '/') {
						uri = vscode.Uri.file(path.join(vscode.workspace.rootPath, uri.path));
					} else {
						uri = vscode.Uri.file(path.join(path.dirname(this.currentDocument.path), uri.path));
					}
					return normalizeLink(uri.toString(true));
				}
			} catch (e) {
				// noop
			}
			return normalizeLink(link);
		};
	}

	private addLinkValidator(md: any): void {
		const validateLink = md.validateLink;
		md.validateLink = (link: string) => {
			if (validateLink(link)) {
				return true;
			}
			// support file:// links
			return link.indexOf('file:') === 0;
		};
	}
}
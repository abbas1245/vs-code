/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Event } from 'vscode';

export interface IDisposable {
	dispose(): void;
}

export function dispose<T extends IDisposable>(disposables: T[]): T[] {
	disposables.forEach(d => d.dispose());
	return [];
}

export function toDisposable(dispose: () => void): IDisposable {
	return { dispose };
}

export function combinedDisposable(disposables: IDisposable[]): IDisposable {
	return toDisposable(() => dispose(disposables));
}

export function mapEvent<I, O>(event: Event<I>, map: (i: I) => O): Event<O> {
	return (listener, thisArgs = null, disposables?) => event(i => listener.call(thisArgs, map(i)), null, disposables);
}

export function filterEvent<T>(event: Event<T>, filter: (e: T) => boolean): Event<T> {
	return (listener, thisArgs = null, disposables?) => event(e => filter(e) && listener.call(thisArgs, e), null, disposables);
}

export function anyEvent<T>(...events: Event<T>[]): Event<T> {
	return (listener, thisArgs = null, disposables?) => combinedDisposable(events.map(event => event(i => listener.call(thisArgs, i), disposables)));
}

export function done<T>(promise: Promise<T>): Promise<void> {
	return promise.then(() => null, () => null);
}

export function throttle<T>(fn: () => Promise<T>): () => Promise<T> {
	let current: Promise<T> | undefined;
	let next: Promise<T> | undefined;

	const trigger = () => {
		if (next) {
			return next;
		}

		if (current) {
			next = done(current).then(() => {
				next = undefined;
				return trigger();
			});

			return next;
		}

		current = fn.call(this) as Promise<T>;

		done(current).then(() => {
			current = undefined;
		});

		return current;
	};

	return trigger;
}
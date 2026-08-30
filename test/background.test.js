const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

function loadBackground({ sendMessage, console = { log() {} }, getTab = () => {} } = {}) {
	const onBeforeRequestListeners = [];
	const onHeadersReceivedListeners = [];
	const onConnectListeners = [];
	const sandbox = {
		URL,
		TextDecoder,
		console,
		attachTabSource: (event) => event,
		selectEvents: (events, tabId, showAllTabs) => showAllTabs ? events : events.filter((event) => event.tabId === tabId),
		chrome: {
			storage: {
				local: { get: (_keys, callback) => callback({}) },
				onChanged: { addListener() {} }
			},
			tabs: {
				query() {},
				get: getTab
			},
			runtime: {
				sendMessage,
				lastError: undefined,
				onConnect: { addListener: (listener) => onConnectListeners.push(listener) }
			},
			webRequest: {
				onBeforeRequest: { addListener: (listener) => onBeforeRequestListeners.push(listener) },
				onHeadersReceived: { addListener: (listener) => onHeadersReceivedListeners.push(listener) }
			}
		}
	};

	vm.runInNewContext(backgroundSource, sandbox, { filename: 'background.js' });
	sandbox.onBeforeRequest = onBeforeRequestListeners[0];
	sandbox.onHeadersReceived = onHeadersReceivedListeners[0];
	sandbox.onConnect = onConnectListeners[0];
	return sandbox;
}

test('ignores the expected no-receiver runtime message rejection but rethrows other errors', () => {
	let rejectionHandler;
	const background = loadBackground({
		sendMessage: () => ({
			catch(handler) {
				rejectionHandler = handler;
			}
		})
	});
	const noReceiver = new Error('Could not establish connection. Receiving end does not exist.');
	const unexpected = new Error('runtime unavailable');

	background.addEvent({ eventName: 'recorded' });

	assert.equal(typeof rejectionHandler, 'function');
	assert.doesNotThrow(() => rejectionHandler(noReceiver));
	assert.throws(() => rejectionHandler(unexpected), unexpected);
});

test('treats missing or invalid tab URLs as a nonmatching own-server response without logging', () => {
	const logs = [];
	const background = loadBackground({
		console: { log: (...args) => logs.push(args) }
	});
	let callbackCalls = 0;

	for (const tabUrl of [undefined, 'not a URL']) {
		background.onOwnServerResponse('https://events.example.com/v1/track', { url: tabUrl }, () => {
			callbackCalls += 1;
		});
	}

	assert.equal(callbackCalls, 0);
	assert.deepEqual(logs, []);
});

test('formats timestamps in 24-hour time without an AM or PM suffix', () => {
	const background = loadBackground();
	assert.equal(background.formatDateToTime(new Date('2026-08-30T13:29:28')), '13:29:28');
});

test('keeps events newest-first by capture sequence when originating-tab lookups resolve out of order', () => {
	const tabLookups = new Map();
	const background = loadBackground({
		sendMessage: () => ({ catch() {} }),
		getTab: (tabId, callback) => tabLookups.set(tabId, callback)
	});
	const requestBody = (event) => ({ raw: [{ bytes: new TextEncoder().encode(JSON.stringify({ event })).buffer }] });

	background.onBeforeRequest({ tabId: 1, url: 'https://api.segment.io/v1/t', requestBody: requestBody('first') });
	background.onBeforeRequest({ tabId: 2, url: 'https://api.segment.io/v1/t', requestBody: requestBody('second') });
	// The newer request resolves first; the original capture order must still win.
	tabLookups.get(2)({ id: 2, title: 'Second', url: 'https://second.example' });
	tabLookups.get(1)({ id: 1, title: 'First', url: 'https://first.example' });

	assert.deepEqual(
		Array.from(background.trackedEvents, (event) => event.eventName),
		['second', 'first']
	);
});

test('keeps server-header events newest-first when originating-tab lookups resolve out of order', () => {
	const tabLookups = new Map();
	const background = loadBackground({
		sendMessage: () => ({ catch() {} }),
		getTab: (tabId, callback) => tabLookups.set(tabId, callback)
	});
	const responseHeaders = (event) => [{
		name: 'x-tracked-events',
		value: JSON.stringify([{ type: 'track', event, timestamp: '2026-08-30T10:00:00.000Z' }])
	}];

	background.onHeadersReceived({ tabId: 3, url: 'https://first.example/events', responseHeaders: responseHeaders('first') });
	background.onHeadersReceived({ tabId: 4, url: 'https://second.example/events', responseHeaders: responseHeaders('second') });
	tabLookups.get(4)({ id: 4, title: 'Second', url: 'https://second.example/page' });
	tabLookups.get(3)({ id: 3, title: 'First', url: 'https://first.example/page' });

	assert.deepEqual(
		Array.from(background.trackedEvents, (event) => event.eventName),
		['second', 'first']
	);
});

test('clears all tracked events only for the explicit clear-all port request', () => {
	const background = loadBackground({ sendMessage: () => ({ catch() {} }) });
	const portMessages = [];
	let portMessageListener;
	background.onConnect({
		postMessage: (message) => portMessages.push(message),
		onMessage: { addListener: (listener) => { portMessageListener = listener; } }
	});
	background.addEvent({ eventName: 'first', tabId: 1 });
	background.addEvent({ eventName: 'second', tabId: 2 });

	portMessageListener({ type: 'clear', tabId: 1, showAllTabs: true });
	assert.deepEqual(Array.from(background.trackedEvents, (event) => event.eventName), ['second']);
	portMessageListener({ type: 'clear-all', showAllTabs: true });

	assert.deepEqual(Array.from(background.trackedEvents), []);
	assert.equal(portMessages.at(-1).type, 'update');
	assert.deepEqual(Array.from(portMessages.at(-1).events), []);
});

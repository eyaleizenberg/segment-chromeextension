const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

function loadBackground({ sendMessage, console = { log() {} } } = {}) {
	const sandbox = {
		URL,
		console,
		attachTabSource: (event) => event,
		chrome: {
			storage: {
				local: { get: (_keys, callback) => callback({}) },
				onChanged: { addListener() {} }
			},
			tabs: {
				query() {},
				get() {}
			},
			runtime: {
				sendMessage,
				onConnect: { addListener() {} }
			},
			webRequest: {
				onBeforeRequest: { addListener() {} },
				onHeadersReceived: { addListener() {} }
			}
		}
	};

	vm.runInNewContext(backgroundSource, sandbox, { filename: 'background.js' });
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

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function createElement() {
	return {
		checked: false,
		hidden: false,
		innerHTML: '',
		style: {},
		value: '',
		focus() {},
		getElementsByClassName: () => [],
		classList: { add() {}, remove() {} }
	};
}

function loadSidePanel(storageValues = {}) {
	const elements = Object.fromEntries([
		'clearButton', 'filterInput', 'configureButton', 'contentDiv', 'configurationDiv',
		'snakeCaseEventNames', 'showAllTabs', 'apiDomain', 'trackMessages'
	].map((id) => [id, createElement()]));
	const domListeners = {};
	const portMessages = [];
	const storageSets = [];
	const portListeners = [];
	const tabActivationListeners = [];
	const runtimeListeners = [];
	const chrome = {
		runtime: {
			connect: () => ({
				postMessage: (message) => portMessages.push(message),
				onMessage: { addListener: (listener) => portListeners.push(listener) }
			}),
			onMessage: { addListener: (listener) => runtimeListeners.push(listener) }
		},
		tabs: {
			query: (_query, callback) => callback([{ id: 42 }]),
			onActivated: { addListener: (listener) => tabActivationListeners.push(listener) }
		},
		storage: {
			local: {
				get: (keys, callback) => {
					const result = {};
					for (const key of keys) {
						if (Object.hasOwn(storageValues, key)) result[key] = storageValues[key];
					}
					callback(result);
				},
				set: (value, callback) => {
					storageSets.push(value);
					if (callback) callback();
				}
			}
		}
	};
	const context = {
		chrome,
		document: {
			addEventListener: (type, listener) => { domListeners[type] = listener; },
			getElementById: (id) => elements[id] || (elements[id] = createElement())
		},
		window: { getSelection: () => ({ toString: () => '' }) },
		navigator: { clipboard: { writeText() {} } },
		formatEventSource: (event) => `${event.tabTitle} · source.example`,
		toSnakeCase: (eventName) => eventName.toLowerCase(),
		shouldToggleEventDetails: () => true,
		JSON,
		RegExp,
		console
	};
	vm.runInNewContext(fs.readFileSync(path.join(root, 'sidepanel.js'), 'utf8'), context);
	domListeners.DOMContentLoaded();
	return { elements, portMessages, portListeners, runtimeListeners, storageSets, tabActivationListeners };
}

test('loads the side-panel document with shared utilities before its controller', () => {
	const document = fs.readFileSync(path.join(root, 'sidepanel.html'), 'utf8');
	assert.match(document, /<button[^>]*id="configureButton"[^>]*aria-label="Toggle configuration"/);
	assert.match(document, /<input[^>]*type="checkbox"[^>]*id="showAllTabs"/);
	assert.ok(document.indexOf('event-store.js') < document.indexOf('event-name-formatter.js'));
	assert.ok(document.indexOf('event-name-formatter.js') < document.indexOf('event-click-handler.js'));
	assert.ok(document.indexOf('event-click-handler.js') < document.indexOf('sidepanel.js'));
});

test('queries and clears the selected scope and labels only all-tabs events', () => {
	const panel = loadSidePanel({ show_all_tabs: true });
	assert.deepEqual({ ...panel.portMessages.at(-1) }, { type: 'update', tabId: 42, showAllTabs: true });

	panel.portListeners[0]({
		type: 'update',
		events: [{ type: 'track', eventName: 'Viewed Home', trackedTime: '10:00', hostName: 'example.com', tabTitle: 'Dashboard', raw: '{"value":1}' }]
	});
	assert.match(panel.elements.trackMessages.innerHTML, /class="eventSource">Dashboard · source\.example/);

	panel.elements.clearButton.onclick();
	assert.deepEqual({ ...panel.portMessages.at(-1) }, { type: 'clear', tabId: 42, showAllTabs: true });

	panel.elements.showAllTabs.checked = false;
	panel.elements.showAllTabs.onchange();
	assert.deepEqual({ ...panel.storageSets.at(-1) }, { show_all_tabs: false });
	assert.deepEqual({ ...panel.portMessages.at(-1) }, { type: 'update', tabId: 42, showAllTabs: false });

	panel.portListeners[0]({
		type: 'update',
		events: [{ type: 'track', eventName: 'Viewed Home', trackedTime: '10:00', hostName: 'example.com', tabTitle: 'Dashboard', raw: '{"value":1}' }]
	});
	assert.doesNotMatch(panel.elements.trackMessages.innerHTML, /eventSource/);
});

test('uses the false default and refreshes when the active tab changes', () => {
	const panel = loadSidePanel();
	assert.equal(panel.elements.showAllTabs.checked, false);
	assert.deepEqual({ ...panel.portMessages.at(-1) }, { type: 'update', tabId: 42, showAllTabs: false });
	assert.equal(panel.tabActivationListeners.length, 1);
	panel.tabActivationListeners[0]();
	assert.deepEqual({ ...panel.portMessages.at(-1) }, { type: 'update', tabId: 42, showAllTabs: false });
});

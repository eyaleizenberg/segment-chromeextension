const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function createElement(tagName = 'div') {
	const classes = new Set();
	const element = {
		tagName: tagName.toUpperCase(),
		checked: false,
		hidden: false,
		innerHTML: '',
		style: {},
		value: '',
		children: [],
		_textContent: '',
		focus() {},
		append(...nodes) {
			for (const node of nodes) {
				this.children.push(node);
			}
		},
		replaceChildren(...nodes) {
			this.children = [];
			this._textContent = '';
			this.append(...nodes);
		},
		getElementsByClassName(className) {
			const matches = [];
			const visit = (node) => {
				if (node.classList && node.classList.contains(className)) matches.push(node);
				if (node.children) node.children.forEach(visit);
			};
			this.children.forEach(visit);
			return matches;
		},
		classList: {
			add: (...names) => names.forEach((name) => {
				if (/\s/.test(name)) throw new Error('Invalid class token');
				classes.add(name);
			}),
			remove: (...names) => names.forEach((name) => classes.delete(name)),
			contains: (name) => classes.has(name),
			toggle: (name, enabled) => {
				if (enabled) classes.add(name);
				else classes.delete(name);
			}
		}
	};
	Object.defineProperty(element, 'textContent', {
		get: () => element._textContent + element.children.map((child) => child.textContent).join(''),
		set: (value) => {
			element._textContent = String(value);
			element.children = [];
		}
	});
	return element;
}

function loadSidePanel(storageValues = {}, options = {}) {
	const elements = Object.fromEntries([
		'clearButton', 'filterInput', 'configureButton', 'contentDiv', 'configurationDiv',
		'clearAllButton', 'snakeCaseEventNames', 'showAllTabs', 'darkMode', 'apiDomain', 'trackMessages', 'copyToast'
	].map((id) => [id, createElement()]));
	const domListeners = {};
	const portMessages = [];
	const storageSets = [];
	const portListeners = [];
	const ports = [];
	const pendingStorageGets = [];
	const tabActivationListeners = [];
	const runtimeListeners = [];
	const chrome = {
		runtime: {
			connect: () => {
				const port = {
					messages: [],
					disconnectListeners: [],
					postMessage: (message) => {
						port.messages.push(message);
						portMessages.push(message);
					},
					onMessage: { addListener: (listener) => portListeners.push(listener) },
					onDisconnect: { addListener: (listener) => port.disconnectListeners.push(listener) }
				};
				ports.push(port);
				return port;
			},
			onMessage: { addListener: (listener) => runtimeListeners.push(listener) }
		},
		tabs: {
			query: (_query, callback) => callback(options.tabs || [{ id: 42 }]),
			onActivated: { addListener: (listener) => tabActivationListeners.push(listener) }
		},
		storage: {
			local: {
				get: (keys, callback) => {
					const result = {};
					for (const key of keys) {
						if (Object.hasOwn(storageValues, key)) result[key] = storageValues[key];
					}
					const resolve = () => callback(result);
					if (options.deferStorage) pendingStorageGets.push({ keys, resolve });
					else resolve();
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
			getElementById: (id) => elements[id] || (elements[id] = createElement()),
			createElement,
			createTextNode: (text) => ({ textContent: String(text) }),
			body: createElement('body')
		},
		window: { getSelection: () => ({ toString: () => '' }) },
		navigator: { clipboard: { writeText() {} } },
		formatEventSource: (event) => `${event.tabTitle} · source.example`,
		toSnakeCase: (eventName) => eventName.toLowerCase(),
		shouldToggleEventDetails: () => true,
		JSON,
		RegExp,
		console,
		clearTimeout() {},
		setTimeout() { return 1; }
	};
	vm.runInNewContext(fs.readFileSync(path.join(root, 'sidepanel.js'), 'utf8'), context);
	domListeners.DOMContentLoaded();
	return { elements, body: context.document.body, portMessages, portListeners, ports, runtimeListeners, storageSets, tabActivationListeners, pendingStorageGets };
}

test('loads the side-panel document with shared utilities before its controller', () => {
	const document = fs.readFileSync(path.join(root, 'sidepanel.html'), 'utf8');
	assert.match(document, /<button[^>]*id="configureButton"[^>]*aria-label="Toggle configuration"/);
	assert.match(document, /<input[^>]*type="checkbox"[^>]*id="showAllTabs"/);
	assert.match(document, /<input[^>]*type="checkbox"[^>]*id="darkMode"/);
	assert.match(document, /<input[^>]*id="clearAllButton"[^>]*value="Clear log from all tabs"/);
	assert.match(document, /<div[^>]*id="copyToast"[^>]*role="status"/);
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
	assert.equal(panel.elements.trackMessages.getElementsByClassName('eventSource')[0].textContent, 'Dashboard · source.example');

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
	assert.equal(panel.elements.trackMessages.getElementsByClassName('eventSource').length, 0);
});

test('uses the false default and refreshes when the active tab changes', () => {
	const panel = loadSidePanel();
	assert.equal(panel.elements.showAllTabs.checked, false);
	assert.deepEqual({ ...panel.portMessages.at(-1) }, { type: 'update', tabId: 42, showAllTabs: false });
	assert.equal(panel.tabActivationListeners.length, 1);
	panel.tabActivationListeners[0]();
	assert.deepEqual({ ...panel.portMessages.at(-1) }, { type: 'update', tabId: 42, showAllTabs: false });
});

test('applies a persisted snake-case preference before the first event render', () => {
	const panel = loadSidePanel({ display_event_names_in_snake_case: true }, { deferStorage: true });
	const snakeCaseSetting = panel.pendingStorageGets.find(({ keys }) => keys[0] == 'display_event_names_in_snake_case');
	const allTabsSetting = panel.pendingStorageGets.find(({ keys }) => keys[0] == 'show_all_tabs');

	allTabsSetting.resolve();
	assert.equal(panel.portMessages.length, 0);
	snakeCaseSetting.resolve();
	assert.deepEqual({ ...panel.portMessages.at(-1) }, { type: 'update', tabId: 42, showAllTabs: false });

	panel.portListeners[0]({
		type: 'update',
		events: [{ type: 'track', eventName: 'Viewed Home', trackedTime: '10:00', hostName: 'example.com', raw: '{"value":1}' }]
	});
	assert.match(panel.elements.trackMessages.textContent, /viewed home/);
});

test('uses a flex viewport layout that keeps the clear control below the scrollable event list', () => {
	const styles = fs.readFileSync(path.join(root, 'sidepanel.css'), 'utf8');
	assert.match(styles, /body\s*\{[^}]*display:\s*flex;/s);
	assert.match(styles, /body\s*\{[^}]*flex-direction:\s*column;/s);
	assert.match(styles, /body\s*\{[^}]*height:\s*100vh;/s);
	assert.match(styles, /#contentDiv\s*\{[^}]*flex:\s*1 1 auto;[^}]*flex-direction:\s*column;[^}]*min-height:\s*0;/s);
	assert.match(styles, /#trackMessages\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow:\s*auto;/s);
	assert.match(styles, /\.buttonDiv\s*\{[^}]*flex:\s*0 0 auto;/s);
});

test('truncates long event names while preserving the event time and copy control', () => {
	const styles = fs.readFileSync(path.join(root, 'sidepanel.css'), 'utf8');
	assert.match(styles, /\.eventSummary\s*\{[^}]*display:\s*flex;[^}]*min-width:\s*0;/s);
	assert.match(styles, /\.eventName\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s);
	assert.match(styles, /\.eventTime\s*\{[^}]*flex:\s*0 0 auto;[^}]*white-space:\s*nowrap;/s);
});

test('renders the event host as metadata in the signal feed', () => {
	const panel = loadSidePanel();
	panel.portListeners[0]({
		type: 'update',
		events: [{ type: 'track', eventName: 'Viewed Home', trackedTime: '10:00', hostName: 'example.com', raw: '{}' }]
	});
	assert.equal(panel.elements.trackMessages.getElementsByClassName('eventHost')[0].textContent, 'example.com');
});

test('shows timestamps without a separator before the time', () => {
	const panel = loadSidePanel();
	panel.portListeners[0]({
		type: 'update',
		events: [{ type: 'track', eventName: 'Viewed Home', trackedTime: '13:29:28', hostName: 'example.com', raw: '{}' }]
	});
	assert.equal(panel.elements.trackMessages.getElementsByClassName('eventTime')[0].textContent, '13:29:28');
});

test('shows a copied toast after the clipboard write succeeds', async () => {
	const panel = loadSidePanel();
	panel.portListeners[0]({
		type: 'update',
		events: [{ type: 'track', eventName: 'Viewed Home', trackedTime: '13:29:28', hostName: 'example.com', raw: '{}' }]
	});
	panel.elements.trackMessages.getElementsByClassName('copyEvent')[0].onclick({ stopPropagation() {} });
	await Promise.resolve();
	assert.equal(panel.elements.copyToast.hidden, false);
});

test('reconnects the side-panel port and re-queries after a service-worker disconnect', () => {
	const panel = loadSidePanel();

	assert.equal(panel.ports.length, 1);
	panel.ports[0].disconnectListeners[0]();

	assert.equal(panel.ports.length, 2);
	assert.deepEqual({ ...panel.ports[1].messages[0] }, { type: 'update', tabId: 42, showAllTabs: false });
});

test('renders event fields, payload, and source labels as text instead of injecting untrusted HTML', () => {
	const panel = loadSidePanel({ show_all_tabs: true });
	const untrusted = '<img src=x onerror=alert(1)>';

	panel.portListeners[0]({
		type: 'update',
		events: [{
			type: 'track',
			eventName: untrusted,
			trackedTime: untrusted,
			hostName: untrusted,
			tabTitle: untrusted,
			raw: JSON.stringify({ [untrusted]: untrusted })
		}]
	});

	assert.equal(panel.elements.trackMessages.innerHTML, '');
	assert.match(panel.elements.trackMessages.textContent, /<img src=x onerror=alert\(1\)>/);
	assert.equal(panel.elements.trackMessages.getElementsByClassName('eventTracked').length, 1);
});

test('renders the existing empty state without posting query or clear messages when no active tab exists', () => {
	const panel = loadSidePanel({}, { tabs: [] });

	assert.equal(panel.portMessages.length, 0);
	assert.equal(panel.elements.trackMessages.textContent, 'No events tracked in this tab yet.');
	panel.elements.clearButton.onclick();
	assert.equal(panel.portMessages.length, 0);
});

test('does not use an untrusted event type as a CSS class token', () => {
	const panel = loadSidePanel();

	assert.doesNotThrow(() => panel.portListeners[0]({
		type: 'update',
		events: [{ type: 'track invalid', eventName: 'Viewed Home', trackedTime: '10:00', hostName: 'example.com', raw: '{}' }]
	}));
	const eventCard = panel.elements.trackMessages.getElementsByClassName('eventTracked')[0];
	assert.equal(eventCard.classList.contains('eventType_track'), false);
});

test('sends an explicit clear-all request without changing active-tab clear behavior', () => {
	const panel = loadSidePanel();

	panel.elements.clearButton.onclick();
	assert.deepEqual({ ...panel.portMessages.at(-1) }, { type: 'clear', tabId: 42, showAllTabs: false });
	panel.elements.clearAllButton.onclick();
	assert.deepEqual({ ...panel.portMessages.at(-1) }, { type: 'clear-all', showAllTabs: false });
});

test('initializes and persists panel-only dark-mode preference', () => {
	const defaultPanel = loadSidePanel();
	assert.equal(defaultPanel.elements.darkMode.checked, false);
	assert.equal(defaultPanel.body.classList.contains('darkMode'), false);

	const panel = loadSidePanel({ dark_mode: true });

	assert.equal(panel.elements.darkMode.checked, true);
	assert.equal(panel.body.classList.contains('darkMode'), true);
	panel.elements.darkMode.checked = false;
	panel.elements.darkMode.onchange();
	assert.deepEqual({ ...panel.storageSets.at(-1) }, { dark_mode: false });
	assert.equal(panel.body.classList.contains('darkMode'), false);
});

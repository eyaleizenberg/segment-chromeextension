let apiDomainDefault = 'api.segment.io,cdn.dreamdata.cloud,track.attributionapp.com';
let displayEventNamesInSnakeCase = false;
let showAllTabs = false;
let darkMode = false;
let snakeCasePreferenceLoaded = false;
let showAllTabsPreferenceLoaded = false;
let copyToastTimeout;
const eventTypesWithStyles = new Set(['identify', 'pageLoad', 'track', 'batch']);
// Obtained from: https://uxwing.com/copy-icon/
const copyJsonSVG = '<svg width="32" height="32" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 115.77 122.88" style="enable-background:new 0 0 115.77 122.88" xml:space="preserve"><style type="text/css">.st0{fill-rule:evenodd;clip-rule:evenodd;}</style><g><path class="st0" d="M89.62,13.96v7.73h12.19h0.01v0.02c3.85,0.01,7.34,1.57,9.86,4.1c2.5,2.51,4.06,5.98,4.07,9.82h0.02v0.02 v73.27v0.01h-0.02c-0.01,3.84-1.57,7.33-4.1,9.86c-2.51,2.5-5.98,4.06-9.82,4.07v0.02h-0.02h-61.7H40.1v-0.02 c-3.84-0.01-7.34-1.57-9.86-4.1c-2.5-2.51-4.06-5.98-4.07-9.82h-0.02v-0.02V92.51H13.96h-0.01v-0.02c-3.84-0.01-7.34-1.57-9.86-4.1 c-2.5-2.51-4.06-5.98-4.07-9.82H0v-0.02V13.96v-0.01h0.02c0.01-3.85,1.58-7.34,4.1-9.86c2.51-2.5,5.98-4.06,9.82-4.07V0h0.02h61.7 h0.01v0.02c3.85,0.01,7.34,1.57,9.86,4.1c2.5,2.51,4.06,5.98,4.07,9.82h0.02V13.96L89.62,13.96z M79.04,21.69v-7.73v-0.02h0.02 c0-0.91-0.39-1.75-1.01-2.37c-0.61-0.61-1.46-1-2.37-1v0.02h-0.01h-61.7h-0.02v-0.02c-0.91,0-1.75,0.39-2.37,1.01 c-0.61,0.61-1,1.46-1,2.37h0.02v0.01v64.59v0.02h-0.02c0,0.91,0.39,1.75,1.01,2.37c0.61,0.61,1.46,1,2.37,1v-0.02h0.01h12.19V35.65 v-0.01h0.02c0.01-3.85,1.58-7.34,4.1-9.86c2.51-2.5,5.98-4.06,9.82-4.07v-0.02h0.02H79.04L79.04,21.69z M105.18,108.92V35.65v-0.02 h0.02c0-0.91-0.39-1.75-1.01-2.37c-0.61-0.61-1-2.37-1v0.02h-0.01h-61.7h-0.02v-0.02c-0.91,0-1.75,0.39-2.37,1.01 c-0.61,0.61-1,1.46-1,2.37h0.02v0.01v73.27v0.02h-0.02c0,0.91,0.39,1.75,1.01,2.37c0.61,0.61,1.46,1,2.37,1v-0.02h0.01h61.7h0.02 v0.02c0.91,0,1.75-0.39,2.37-1.01c0.61-0.61,1-2.37h-0.02V108.92L105.18,108.92z" stroke="gray" fill="white" fill-opacity="0.5"/></g></svg>';

let connection;

function connectToBackground() {
	connection = chrome.runtime.connect();
	connection.onMessage.addListener(handlePortMessage);
	connection.onDisconnect.addListener(() => {
		connectToBackground();
		queryForUpdate();
	});
}

connectToBackground();

function displayEventName(eventName) {
	return displayEventNamesInSnakeCase ? toSnakeCase(eventName) : eventName;
}

function showCopyToast(copyToast) {
	copyToast.hidden = false;
	clearTimeout(copyToastTimeout);
	copyToastTimeout = setTimeout(() => {
		copyToast.hidden = true;
	}, 1500);
}

function appendVariable(container, jsonObject, level) {
	for (var key in jsonObject) {
		if (jsonObject.hasOwnProperty(key)) {
			var row = document.createElement('div');
			row.style.paddingLeft = (level * 10) + 'px';
			var keyElement = document.createElement('span');
			keyElement.classList.add('key');
			keyElement.textContent = key;
			row.append(keyElement);

			if (jsonObject[key] !== null && typeof jsonObject[key] == 'object') {
				row.append(document.createTextNode(' {'));
				appendVariable(row, jsonObject[key], level + 1);
				row.append(document.createTextNode('}'));
			}
			else {
				var valueElement = document.createElement('span');
				var type = jsonObject[key] === null ? 'null' : typeof jsonObject[key];
				valueElement.classList.add(type);
				valueElement.textContent = ': ' + String(jsonObject[key]);
				row.append(valueElement);
			}
			container.append(row);
		}
	}
}

function renderEmptyState() {
	var trackMessages = document.getElementById('trackMessages');
	trackMessages.replaceChildren();
	var emptyState = document.createElement('span');
	emptyState.textContent = 'No events tracked in this tab yet.';
	trackMessages.append(emptyState);
}

function renderEvents(events) {
	var trackMessages = document.getElementById('trackMessages');
	trackMessages.replaceChildren();
	if (events.length == 0) {
		renderEmptyState();
		return;
	}

	for (var i = 0; i < events.length; i++) {
		const event = events[i];
		var eventTracked = document.createElement('div');
		eventTracked.classList.add('eventTracked');
		if (eventTypesWithStyles.has(event.type)) {
			eventTracked.classList.add('eventType_' + event.type);
		}
		var eventInfo = document.createElement('div');
		eventInfo.classList.add('eventInfo');
		var eventSummary = document.createElement('div');
		eventSummary.classList.add('eventSummary');
		var eventName = document.createElement('span');
		eventName.classList.add('eventName');
		eventName.textContent = displayEventName(event.eventName);
		var eventTime = document.createElement('span');
		eventTime.classList.add('eventTime');
		eventTime.textContent = event.trackedTime;
		var eventTimeGroup = document.createElement('div');
		eventTimeGroup.classList.add('eventTimeGroup');
		var copyToast = document.createElement('div');
		copyToast.classList.add('copyToast');
		copyToast.setAttribute('role', 'status');
		copyToast.setAttribute('aria-live', 'polite');
		copyToast.textContent = 'Copied';
		copyToast.hidden = true;
		eventTimeGroup.append(eventTime, copyToast);
		var copyEvent = document.createElement('div');
		copyEvent.classList.add('copyEvent');
		var copyLink = document.createElement('a');
		copyLink.title = 'Copy json to clipboard';
		copyLink.innerHTML = copyJsonSVG;
		copyEvent.append(copyLink);
		eventSummary.append(eventName, eventTimeGroup, copyEvent);
		eventInfo.append(eventSummary);
		if (showAllTabs) {
			var eventSource = document.createElement('div');
			eventSource.classList.add('eventSource');
			eventSource.textContent = formatEventSource(event);
			eventInfo.append(eventSource);
		}
		var eventHost = document.createElement('div');
		eventHost.classList.add('eventHost');
		eventHost.textContent = event.hostName;
		eventInfo.append(eventHost);
		const eventContent = document.createElement('div');
		eventContent.classList.add('eventContent');
		try {
			appendVariable(eventContent, JSON.parse(event.raw), 0);
		}
		catch (exception) {
			eventContent.textContent = event.raw;
		}
		eventInfo.append(eventContent);
		eventTracked.append(eventInfo);
		trackMessages.append(eventTracked);

		eventInfo.onclick = function() {
			if (!shouldToggleEventDetails(window.getSelection().toString())) return;
			eventContent.style.display = eventContent.style.display == 'block' ? 'none' : 'block';
		};
		copyEvent.onclick = (clickEvent) => {
			Promise.resolve(navigator.clipboard.writeText(event.raw)).then(() => showCopyToast(copyToast)).catch(() => {});
			clickEvent.stopPropagation();
		};
	}
}

function queryForUpdate() {
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		var currentTab = tabs[0];
		if (!currentTab) {
			renderEmptyState();
			return;
		}
		connection.postMessage({ type: 'update', tabId: currentTab.id, showAllTabs });
	});
}

function clearTabLog() {
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		var currentTab = tabs[0];
		if (!currentTab) {
			renderEmptyState();
			return;
		}
		connection.postMessage({ type: 'clear', tabId: currentTab.id, showAllTabs });
	});
}

function clearAllLogs() {
	connection.postMessage({ type: 'clear-all', showAllTabs });
}

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
	if (message.type == 'new_event') queryForUpdate();
});

chrome.tabs.onActivated.addListener(() => queryForUpdate());

function handlePortMessage(msg) {
	if (msg.type != 'update') return;
	renderEvents(msg.events);
}

function filterEvents(keyPressedEvent) {
	var filter = new RegExp(keyPressedEvent.target.value, 'gi');
	var eventElements = document.getElementById('trackMessages').getElementsByClassName('eventTracked');
	for (eventElement of eventElements) {
		var eventName = eventElement.getElementsByClassName('eventName')[0].textContent;
		if (eventName.match(filter)) eventElement.classList.remove('hidden');
		else eventElement.classList.add('hidden');
	}
}

function toggleConfiguration() {
	var configurationDiv = document.getElementById('configurationDiv');
	configurationDiv.hidden = !configurationDiv.hidden;
	document.getElementById('contentDiv').hidden = !configurationDiv.hidden;
}

function updateApiDomain(apiDomain) {
	chrome.storage.local.set({ segment_api_domain: apiDomain || apiDomainDefault });
}

function handleApiDomainUpdates() {
	var apiDomainInput = document.getElementById('apiDomain');
	chrome.storage.local.get(['segment_api_domain'], function(result) {
		apiDomainInput.value = result.segment_api_domain || apiDomainDefault;
		apiDomainInput.onchange = () => updateApiDomain(apiDomainInput.value);
	});
}

function updateSnakeCaseEventNameDisplay(enabled) {
	displayEventNamesInSnakeCase = enabled;
	chrome.storage.local.set({ display_event_names_in_snake_case: enabled }, queryForUpdate);
}

function handleSnakeCaseEventNameDisplayUpdates() {
	var snakeCaseEventNamesInput = document.getElementById('snakeCaseEventNames');
	chrome.storage.local.get(['display_event_names_in_snake_case'], function(result) {
		displayEventNamesInSnakeCase = Boolean(result.display_event_names_in_snake_case);
		snakeCaseEventNamesInput.checked = displayEventNamesInSnakeCase;
		snakeCaseEventNamesInput.onchange = () => updateSnakeCaseEventNameDisplay(snakeCaseEventNamesInput.checked);
		snakeCasePreferenceLoaded = true;
		queryWhenEventDisplayPreferencesAreLoaded();
	});
}

function updateShowAllTabs(enabled) {
	showAllTabs = enabled;
	chrome.storage.local.set({ show_all_tabs: enabled });
	queryForUpdate();
}

function queryWhenEventDisplayPreferencesAreLoaded() {
	if (snakeCasePreferenceLoaded && showAllTabsPreferenceLoaded) queryForUpdate();
}

function handleShowAllTabsUpdates() {
	var showAllTabsInput = document.getElementById('showAllTabs');
	chrome.storage.local.get(['show_all_tabs'], function(result) {
		showAllTabs = result.show_all_tabs === true;
		showAllTabsInput.checked = showAllTabs;
		showAllTabsInput.onchange = () => updateShowAllTabs(showAllTabsInput.checked);
		showAllTabsPreferenceLoaded = true;
		queryWhenEventDisplayPreferencesAreLoaded();
	});
}

function applyDarkMode(enabled) {
	darkMode = enabled;
	document.body.classList.toggle('darkMode', darkMode);
}

function updateDarkMode(enabled) {
	applyDarkMode(enabled);
	chrome.storage.local.set({ dark_mode: enabled });
}

function handleDarkModeUpdates() {
	var darkModeInput = document.getElementById('darkMode');
	chrome.storage.local.get(['dark_mode'], function(result) {
		applyDarkMode(result.dark_mode === true);
		darkModeInput.checked = darkMode;
		darkModeInput.onchange = () => updateDarkMode(darkModeInput.checked);
	});
}

document.addEventListener('DOMContentLoaded', function() {
	document.getElementById('clearButton').onclick = clearTabLog;
	document.getElementById('clearAllButton').onclick = clearAllLogs;
	var filterInput = document.getElementById('filterInput');
	filterInput.onkeyup = filterEvents;
	filterInput.focus();
	document.getElementById('configureButton').onclick = toggleConfiguration;
	handleApiDomainUpdates();
	handleSnakeCaseEventNameDisplayUpdates();
	handleShowAllTabsUpdates();
	handleDarkModeUpdates();
});

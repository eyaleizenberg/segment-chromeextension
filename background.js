var trackedEvents = new Array();
var captureSequence = 0;
var apiDomainDefault = 'api.segment.io,cdn.dreamdata.cloud,track.attributionapp.com,eu1.segmentapis.com,eu2.segmentapis.com,in.eu1.segmentapis.com,in.eu2.segmentapis.com,events.eu1.segmentapis.com,events.eu2.segmentapis.com';
var apiDomain = apiDomainDefault;

chrome.storage.local.get(['segment_api_domain'],(result) => {
	apiDomain = result.segment_api_domain || apiDomainDefault;
})

chrome.storage.onChanged.addListener((changes, namespace) => {
	if(namespace === 'local' && changes && changes.segment_api_domain) {
		apiDomain = changes.segment_api_domain.newValue || apiDomainDefault;
	}
});

function zeroPad(i) {
	if (i < 10) {
		i = "0" + i
	}
	return i;
}

function formatDateToTime(date) {
	return date.toLocaleTimeString()
}

function withOpenTab(callback) {
	chrome.tabs.query({
		active: true,
		currentWindow: true
	}, (tabs) => {
		var tab = tabs[0];

		if (tab) {
			callback(tab);
		}
	});
}

function addEvent(event) {
	if (typeof event.captureSequence !== 'number') {
		event.captureSequence = ++captureSequence;
	}
	trackedEvents.push(event);
	trackedEvents.sort((first, second) => second.captureSequence - first.captureSequence);
	chrome.runtime.sendMessage({ type: "new_event" }).catch((error) => {
		if (error && error.message === 'Could not establish connection. Receiving end does not exist.') {
			return;
		}
		throw error;
	});
}

function updateTrackedEventsForTab(tabId,showAllTabs,connection) {
	var sendEvents = selectEvents(trackedEvents, tabId, showAllTabs);

	connection.postMessage({
		type: 'update',
		events: sendEvents
	});
}

function clearTrackedEventsForTab(tabId,port) {
	var newTrackedEvents = [];
	for(var i=0;i<trackedEvents.length;i++) {
		if (trackedEvents[i].tabId != tabId) {
			newTrackedEvents.push(trackedEvents[i]);
		}
	}
	trackedEvents = newTrackedEvents;
}

chrome.runtime.onConnect.addListener((connection) => {
	var connectionHandler = (msg) => {
		var tabId = msg.tabId;
		if (msg.type == 'update') {
			updateTrackedEventsForTab(tabId, Boolean(msg.showAllTabs), connection);
		}
		else if (msg.type == 'clear') {
			clearTrackedEventsForTab(tabId, connection);
			updateTrackedEventsForTab(tabId, Boolean(msg.showAllTabs), connection);
		}
	};
	connection.onMessage.addListener(connectionHandler);
});

function isSegmentApiCall(url) {
	var apiDomainParts = apiDomain.split(',');
	return apiDomainParts.findIndex(d => url.startsWith(`https://${d.trim()}`)) != -1;
}

function withRequestTab(details, callback) {
	if (details.tabId < 0) {
		callback(undefined);
		return;
	}

	chrome.tabs.get(details.tabId, (tab) => {
		if (chrome.runtime.lastError) {
			callback(undefined);
			return;
		}
		callback(tab);
	});
}

function onOwnServerResponse(url, tab, callback) {
	if (!tab || !tab.url) return;

	var tabUrl;
	try {
		tabUrl = new URL(tab.url);
	}
	catch(exception) {
		return;
	}

	if (tabUrl.host === (new URL(url)).host) {
		callback();
	}
}

function eventTypeToName(eventType) {
	switch(eventType) {
		case 'identify':
			return 'Identify'
		case 'pageLoad':
			return 'Page Loaded'
		case 'batch':
			return 'Batch'
	}
}

const onBeforeRequestHandler = (details) => {
	if (isSegmentApiCall(details.url)) {
		var bytes = new Uint8Array(details.requestBody.raw[0].bytes);
		var decoder = new TextDecoder('utf-8');
		var postedString = decoder.decode(bytes);

		var rawEvent = JSON.parse(postedString);

		var event = {
			raw: postedString,
			trackedTime: formatDateToTime(new Date()),
			hostName: details.url,
		};

		if (
			details.url.endsWith('/v1/t') ||
			details.url.endsWith('/v2/t') ||
			details.url.endsWith('/v1/track')
		) {
			event.type = 'track';
		}
		else if (
			details.url.endsWith('/v1/i') ||
			details.url.endsWith('/v2/i') ||
			details.url.endsWith('/v1/identify')
		) {
			event.type = 'identify';
		}
		else if (
			details.url.endsWith('/v1/p') ||
			details.url.endsWith('/v2/p') ||
			details.url.endsWith('/v1/page')
		) {
			event.type = 'pageLoad';
		}
		else if (
			details.url.endsWith('/v1/batch') ||
			details.url.endsWith('/v2/batch') ||
			details.url.endsWith('/v1/b') ||
			details.url.endsWith('/v2/b')
		) {
			event.type = 'batch';
		}

		if (event.type) {
			event.eventName = eventTypeToName(event.type) || rawEvent.event
			event.captureSequence = ++captureSequence;
			withRequestTab(details, (tab) => {
				addEvent(attachTabSource(event, tab));
			});
		}
	}
};

chrome.webRequest.onBeforeRequest.addListener(
	(details) => {
		onBeforeRequestHandler(details);
	},
	{
		urls: ['<all_urls>'],
	},
	["requestBody"]
);


const onHeadersReceivedHandler = (details) => {
	var responseCaptureSequence = ++captureSequence;
	withRequestTab(details, (tab) => onOwnServerResponse(details.url, tab, () => {
		const eventsHeader = details.responseHeaders.find(({ name }) => !!name && name.toLowerCase() === 'x-tracked-events');
		if (!eventsHeader) return

		const serverTrackedEvents = JSON.parse(eventsHeader.value);
		serverTrackedEvents.forEach((serverEvent) => {
			const event = {
				type: serverEvent.type,
				eventName: serverEvent.event || eventTypeToName(serverEvent.type),
				raw: JSON.stringify(serverEvent),
				trackedTime: formatDateToTime(new Date(serverEvent.timestamp)),
				hostName: details.url,
				captureSequence: responseCaptureSequence
			};
			addEvent(attachTabSource(event, tab));
		})
	}));
};

chrome.webRequest.onHeadersReceived.addListener(
	(details) => {
		onHeadersReceivedHandler(details);
	},
	{
		urls: ['<all_urls>'],
	},
	['responseHeaders']
);

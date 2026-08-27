(function(root, factory) {
	if (typeof module === 'object' && module.exports) {
		module.exports = factory();
	}
	else {
		var api = factory();
		root.selectEvents = api.selectEvents;
		root.formatEventSource = api.formatEventSource;
		root.attachTabSource = api.attachTabSource;
	}
}(typeof globalThis !== 'undefined' ? globalThis : this, function() {
	function selectEvents(events, tabId, showAllTabs) {
		return showAllTabs ? events : events.filter((event) => event.tabId === tabId);
	}

	function formatEventSource({ tabTitle, hostName, tabId }) {
		var host = '';
		if (hostName) {
			try {
				host = new URL(hostName).host;
			}
			catch (exception) {
				host = '';
			}
		}
		if (tabTitle && host) return `${tabTitle} · ${host}`;
		if (host) return host;
		if (Number.isInteger(tabId) && tabId >= 0) return `Tab ${tabId}`;
		return 'Unknown tab';
	}

	function attachTabSource(event, tab) {
		return {
			...event,
			tabId: tab?.id,
			tabTitle: tab?.title || '',
			hostName: tab?.url || event.hostName || ''
		};
	}

	return { selectEvents, formatEventSource, attachTabSource };
}));

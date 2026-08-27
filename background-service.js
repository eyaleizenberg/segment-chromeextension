try {
	importScripts('event-store.js', 'background.js');
}
catch (error) {
	console.log(error);
}

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

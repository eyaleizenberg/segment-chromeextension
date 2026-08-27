(function(root, factory) {
	if (typeof module === 'object' && module.exports) {
		module.exports = factory();
	}
	else {
		root.shouldToggleEventDetails = factory().shouldToggleEventDetails;
	}
}(typeof globalThis !== 'undefined' ? globalThis : this, function() {
	function shouldToggleEventDetails(selectedText) {
		return selectedText.length === 0;
	}

	return { shouldToggleEventDetails };
}));

(function(root, factory) {
	if (typeof module === 'object' && module.exports) {
		module.exports = factory();
	}
	else {
		root.toSnakeCase = factory().toSnakeCase;
	}
}(typeof globalThis !== 'undefined' ? globalThis : this, function() {
	function toSnakeCase(eventName) {
		return String(eventName)
			.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
			.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
			.replace(/[\s-]+/g, '_')
			.toLowerCase();
	}

	return { toSnakeCase };
}));

const assert = require('node:assert/strict');
const test = require('node:test');

const { shouldToggleEventDetails } = require('../event-click-handler');

test('does not toggle event details when the user has selected text', () => {
	assert.equal(shouldToggleEventDetails('user_viewed_home'), false);
});

test('toggles event details for a regular click without selected text', () => {
	assert.equal(shouldToggleEventDetails(''), true);
});

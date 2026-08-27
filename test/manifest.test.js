const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');

test('registers sidepanel.html as the action-driven native side panel', () => {
	const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'manifest.json'), 'utf8'));

	assert.equal(manifest.action.default_popup, undefined);
	assert.equal(manifest.side_panel.default_path, 'sidepanel.html');
	assert.ok(manifest.permissions.includes('sidePanel'));
});

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const zipPath = path.join(projectRoot, 'segment-chromeextension.zip');

test('includes native side-panel assets and event helpers in the Chrome Web Store package', (t) => {
	t.after(() => fs.rmSync(zipPath, { force: true }));
	execFileSync(process.execPath, ['zip-for-chromestore.js'], { cwd: projectRoot });

	const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
	for (const file of [
		'sidepanel.html',
		'sidepanel.js',
		'sidepanel.css',
		'event-store.js',
		'event-name-formatter.js',
		'event-click-handler.js'
	]) {
		assert.match(entries, new RegExp(`^${file.replace('.', '\\.')}$`, 'm'));
	}
});

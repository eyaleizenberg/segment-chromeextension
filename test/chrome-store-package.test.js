const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const zipPath = path.join(projectRoot, 'segment-chromeextension.zip');

test('includes the event-name formatter in the Chrome Web Store package', (t) => {
	t.after(() => fs.rmSync(zipPath, { force: true }));
	execFileSync(process.execPath, ['zip-for-chromestore.js'], { cwd: projectRoot });

	const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
	assert.match(entries, /^event-name-formatter\.js$/m);
});

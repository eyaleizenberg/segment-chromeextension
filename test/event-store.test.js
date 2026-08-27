const test = require('node:test');
const assert = require('node:assert/strict');
const { selectEvents, formatEventSource } = require('../event-store');

test('returns only the active tab events when all-tabs mode is disabled', () => {
  const events = [{ id: 'new', tabId: 7 }, { id: 'old', tabId: 9 }];

  assert.deepEqual(selectEvents(events, 7, false), [{ id: 'new', tabId: 7 }]);
});

test('returns the newest-first global stream when all-tabs mode is enabled', () => {
  const events = [{ id: 'new', tabId: 7 }, { id: 'old', tabId: 9 }];

  assert.deepEqual(selectEvents(events, 7, true), events);
});

test('uses a tab title and host for an all-tabs source label', () => {
  assert.equal(
    formatEventSource({ tabTitle: 'Riverside dashboard', hostName: 'https://riverside.com/dashboard/home', tabId: 7 }),
    'Riverside dashboard · riverside.com'
  );
});

test('falls back from a missing title to a tab id, then Unknown tab', () => {
  assert.equal(formatEventSource({ hostName: '', tabId: 7 }), 'Tab 7');
  assert.equal(formatEventSource({ hostName: '', tabId: undefined }), 'Unknown tab');
});

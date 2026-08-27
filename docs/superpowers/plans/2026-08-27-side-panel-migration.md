# Side Panel Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the toolbar popup with a native Chrome side panel that supports active-tab and all-tabs event streams.

**Architecture:** A shared browser-compatible event utility will define event-scope selection and safe source labels for both the service worker and side-panel UI. The service worker will record the originating tab metadata and honor an explicit query scope. The new side-panel page will persist its display scope, refresh on active-tab changes, and render source labels only for the all-tabs stream.

**Tech Stack:** Manifest V3, Chrome Side Panel API, Chrome extension storage and runtime ports, plain HTML/CSS/JavaScript, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-27-side-panel-design.md`

## Global Constraints

- Require Chrome 114 or later and Manifest V3.
- Use Chrome's native side panel; do not retain an action popup.
- The side panel opens from the action icon.
- Persist `show_all_tabs` in `chrome.storage.local`; its default is `false`.
- The all-tabs list remains newest-first and shows the originating tab title and host for every event.
- The active-tab list does not show source labels.
- The configuration control is a cog icon only; do not render “Configure” text.
- Preserve filtering, copy-to-clipboard, event expansion, snake-case display, and API-domain settings.
- Package every side-panel HTML, CSS, and JavaScript dependency in `segment-chromeextension.zip`.

---

## File Structure

- Create: `event-store.js` — UMD-compatible shared functions for selecting scoped events and formatting source labels.
- Create: `sidepanel.html` — native side-panel document and script/style loading order.
- Create: `sidepanel.js` — event-stream rendering, configuration state, runtime port querying, and active-tab refresh.
- Create: `sidepanel.css` — responsive side-panel layout, cog control, configuration view, and source-label styling.
- Create: `test/event-store.test.js` — real behavioral tests for scope selection and source-label fallbacks.
- Create: `test/manifest.test.js` — manifest behavior checks for Side Panel API registration.
- Modify: `background.js` — capture request-origin tab metadata and return scoped events through the existing port.
- Modify: `background-service.js` — configure action clicks to open the side panel.
- Modify: `manifest.json` — remove the popup and declare the Side Panel API entry point.
- Modify: `zip-for-chromestore.js` — package the side-panel files and shared utility instead of popup files.
- Modify: `test/chrome-store-package.test.js` — assert the ZIP contains every required side-panel dependency.
- Delete: `popup.html`, `popup.js`, `popup.css` — superseded popup-only entry-point files.

## Task 1: Add shared event scope and source-label behavior

**Files:**
- Create: `event-store.js`
- Create: `test/event-store.test.js`

**Interfaces:**
- Produces: `selectEvents(events, tabId, showAllTabs)` returning all events when `showAllTabs` is true and otherwise only events whose `tabId` equals `tabId`.
- Produces: `formatEventSource(event)` returning `"<tabTitle> · <host>"`, `"<host>"`, `"Tab <tabId>"`, or `"Unknown tab"` in that priority order.
- Consumed by: `background.js` and `sidepanel.js`.

- [ ] **Step 1: Write the failing scope-selection tests**

```js
test('returns only the active tab events when all-tabs mode is disabled', () => {
  const events = [{ id: 'new', tabId: 7 }, { id: 'old', tabId: 9 }];

  assert.deepEqual(selectEvents(events, 7, false), [{ id: 'new', tabId: 7 }]);
});

test('returns the newest-first global stream when all-tabs mode is enabled', () => {
  const events = [{ id: 'new', tabId: 7 }, { id: 'old', tabId: 9 }];

  assert.deepEqual(selectEvents(events, 7, true), events);
});
```

- [ ] **Step 2: Run the scope-selection tests to verify they fail**

Run: `node --test test/event-store.test.js`

Expected: FAIL because `../event-store` does not exist.

- [ ] **Step 3: Implement the minimal UMD utility and scope selection**

```js
function selectEvents(events, tabId, showAllTabs) {
  return showAllTabs ? events : events.filter((event) => event.tabId === tabId);
}
```

Export it as `module.exports` for Node and attach it to `globalThis` for extension pages and `importScripts()`.

- [ ] **Step 4: Run the scope-selection tests to verify they pass**

Run: `node --test test/event-store.test.js`

Expected: PASS with 2 tests.

- [ ] **Step 5: Write the failing source-label tests**

```js
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
```

- [ ] **Step 6: Run the source-label tests to verify they fail**

Run: `node --test test/event-store.test.js`

Expected: FAIL because `formatEventSource` is not exported.

- [ ] **Step 7: Implement safe source-label formatting**

```js
function formatEventSource({ tabTitle, hostName, tabId }) {
  const host = hostName ? new URL(hostName).host : '';
  if (tabTitle && host) return `${tabTitle} · ${host}`;
  if (host) return host;
  if (Number.isInteger(tabId) && tabId >= 0) return `Tab ${tabId}`;
  return 'Unknown tab';
}
```

Catch malformed URLs and treat them as an empty host so rendering can continue.

- [ ] **Step 8: Run the complete event-store tests to verify they pass**

Run: `node --test test/event-store.test.js`

Expected: PASS with 4 tests.

- [ ] **Step 9: Commit the shared utility**

```bash
git add event-store.js test/event-store.test.js
git commit -m "Add event scope and source utilities"
```

## Task 2: Record origin metadata and serve the requested event scope

**Files:**
- Modify: `background.js`
- Modify: `event-store.js`
- Modify: `test/event-store.test.js`

**Interfaces:**
- Consumes: `selectEvents(events, tabId, showAllTabs)` from `event-store.js`.
- Produces: background port update messages with `{ type: 'update', events }` scoped by `msg.showAllTabs`.
- Produces: event objects containing `tabId`, `tabTitle`, and `hostName` whenever `details.tabId` resolves to a browser tab.
- Consumed by: `sidepanel.js`.

- [ ] **Step 1: Write the failing tab-metadata merge test**

```js
test('keeps request event fields while adding the originating tab metadata', () => {
  assert.deepEqual(
    attachTabSource({ eventName: 'saved' }, { id: 7, title: 'Riverside dashboard', url: 'https://riverside.com/dashboard/home' }),
    { eventName: 'saved', tabId: 7, tabTitle: 'Riverside dashboard', hostName: 'https://riverside.com/dashboard/home' }
  );
});
```

- [ ] **Step 2: Run the event-store tests to verify the metadata test fails**

Run: `node --test test/event-store.test.js`

Expected: FAIL because `attachTabSource` is not exported.

- [ ] **Step 3: Implement metadata merging in `event-store.js`**

```js
function attachTabSource(event, tab) {
  return {
    ...event,
    tabId: tab?.id,
    tabTitle: tab?.title || '',
    hostName: tab?.url || event.hostName || ''
  };
}
```

- [ ] **Step 4: Run the event-store tests to verify they pass**

Run: `node --test test/event-store.test.js`

Expected: PASS with 5 tests.

- [ ] **Step 5: Resolve `details.tabId` for both request capture paths**

In `background.js`, replace active-tab attribution with `chrome.tabs.get(details.tabId, callback)` for `onBeforeRequestHandler` and `onHeadersReceivedHandler`. Pass the resulting tab to `attachTabSource` before `addEvent`. When `details.tabId < 0` or `chrome.tabs.get` fails, pass `undefined` and preserve any available request URL as `hostName`.

- [ ] **Step 6: Extend the port update protocol**

Change the update message handling to call:

```js
updateTrackedEventsForTab(msg.tabId, Boolean(msg.showAllTabs), connection);
```

Within `updateTrackedEventsForTab`, replace the manual loop with:

```js
const sendEvents = selectEvents(trackedEvents, tabId, showAllTabs);
```

Keep the `clear` protocol active-tab-specific: clear only `msg.tabId`, then respond using the same `msg.showAllTabs` value.

- [ ] **Step 7: Run syntax and unit verification**

Run: `node --test test/event-store.test.js && node --check background.js && node --check background-service.js && node --check event-store.js`

Expected: all tests PASS and every syntax check exits 0.

- [ ] **Step 8: Commit background source and scope support**

```bash
git add background.js event-store.js test/event-store.test.js
git commit -m "Track event source tabs and query scopes"
```

## Task 3: Register the native Chrome side panel

**Files:**
- Create: `test/manifest.test.js`
- Modify: `manifest.json`
- Modify: `background-service.js`

**Interfaces:**
- Produces: a Manifest V3 extension with `sidePanel` permission and `side_panel.default_path` equal to `sidepanel.html`.
- Produces: an action icon that opens the extension's native side panel.
- Consumed by: Chrome's extension loader.

- [ ] **Step 1: Write the failing manifest behavior test**

```js
test('registers sidepanel.html as the action-driven native side panel', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'manifest.json'), 'utf8'));

  assert.equal(manifest.action.default_popup, undefined);
  assert.equal(manifest.side_panel.default_path, 'sidepanel.html');
  assert.ok(manifest.permissions.includes('sidePanel'));
});
```

- [ ] **Step 2: Run the manifest test to verify it fails**

Run: `node --test test/manifest.test.js`

Expected: FAIL because the manifest still declares `action.default_popup` and has no side-panel entry.

- [ ] **Step 3: Update the manifest for the Side Panel API**

Replace the `action.default_popup` field with a title-only action, add `"sidePanel"` to `permissions`, and add:

```json
"side_panel": {
  "default_path": "sidepanel.html"
}
```

- [ ] **Step 4: Configure the service worker's action behavior**

Update `background-service.js` to load the shared utility before the background logic, then configure the action icon:

```js
importScripts('event-store.js', 'background.js');
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
```

- [ ] **Step 5: Run the manifest test and service-worker syntax check**

Run: `node --test test/manifest.test.js && node --check background-service.js`

Expected: the manifest test PASSes and the syntax check exits 0.

- [ ] **Step 6: Commit the native panel registration**

```bash
git add manifest.json background-service.js test/manifest.test.js
git commit -m "Register the Segment side panel"
```

## Task 4: Build the side-panel interface and configuration view

**Files:**
- Create: `sidepanel.html`
- Create: `sidepanel.js`
- Create: `sidepanel.css`

**Interfaces:**
- Consumes: `formatEventSource(event)` from `event-store.js`, `toSnakeCase(eventName)` from `event-name-formatter.js`, and `shouldToggleEventDetails(selectedText)` from `event-click-handler.js`.
- Consumes: runtime port update messages with `{ type: 'update', events }`.
- Produces: update requests with `{ type: 'update', tabId, showAllTabs }` and clear requests with `{ type: 'clear', tabId, showAllTabs }`.
- Produces: a cog-only configuration toggle and persisted `show_all_tabs` preference.

- [ ] **Step 1: Create `sidepanel.html` from the current popup document**

Load scripts in this order so shared globals exist before `sidepanel.js`:

```html
<link rel="stylesheet" href="sidepanel.css">
<script src="event-store.js"></script>
<script src="event-name-formatter.js"></script>
<script src="event-click-handler.js"></script>
<script src="sidepanel.js"></script>
```

Replace the text configuration input with a cog button using `aria-label="Toggle configuration"`, then add `showAllTabs` as a checkbox inside `configurationDiv`.

- [ ] **Step 2: Move the popup logic into `sidepanel.js` and make scope explicit**

Start from the existing popup behavior. Maintain a `showAllTabs` boolean loaded from storage, and send it in both update and clear port messages:

```js
connection.postMessage({ type: 'update', tabId: currentTab.id, showAllTabs });
connection.postMessage({ type: 'clear', tabId: currentTab.id, showAllTabs });
```

Use `formatEventSource(event)` only when `showAllTabs` is true, rendering the result in a `.eventSource` element below the timestamp. Keep existing event-name formatting, filter behavior, copy handler, and selection guard.

- [ ] **Step 3: Add storage and tab-activation refresh behavior**

Load `show_all_tabs` with `false` as the default. Set its checkbox state, save checkbox changes through `chrome.storage.local.set`, and immediately call `queryForUpdate`. Register:

```js
chrome.tabs.onActivated.addListener(() => queryForUpdate());
```

so active-tab mode changes views as users navigate tabs. Continue to call `queryForUpdate` after `new_event` messages.

- [ ] **Step 4: Add responsive side-panel CSS**

Remove the fixed `body style="width: 700px"`. Use full available width, keep the header controls in a wrapping row, and add `.eventSource` as a compact muted line. Make the cog control visually compact while preserving its accessible label. Retain the existing event type colors and configuration spacing.

- [ ] **Step 5: Retain the popup files until packaging is switched**

Do not delete `popup.html`, `popup.js`, or `popup.css` in this task. The existing ZIP test still requires them until Task 5 replaces its package file list.

- [ ] **Step 6: Run JavaScript syntax and the complete automated suite**

Run: `npm test && node --check sidepanel.js && node --check event-store.js && node --check background.js && node --check background-service.js && git diff --check`

Expected: all tests PASS, every syntax check exits 0, and `git diff --check` reports no whitespace errors.

- [ ] **Step 7: Commit the side-panel UI migration**

```bash
git add sidepanel.html sidepanel.js sidepanel.css popup.html popup.js popup.css
git commit -m "Move event viewer into side panel"
```

## Task 5: Build the distributable extension and complete manual verification

**Files:**
- Modify: `README.md`
- Modify: `zip-for-chromestore.js`
- Modify: `test/chrome-store-package.test.js`
- Delete: `popup.html`
- Delete: `popup.js`
- Delete: `popup.css`

**Interfaces:**
- Consumes: all files from Tasks 1–4.
- Produces: `segment-chromeextension.zip` containing the working native-side-panel extension.

- [ ] **Step 1: Extend the package contents test before editing the packager**

In `test/chrome-store-package.test.js`, assert that `unzip -Z1 segment-chromeextension.zip` contains `sidepanel.html`, `sidepanel.js`, `sidepanel.css`, `event-store.js`, `event-name-formatter.js`, and `event-click-handler.js`.

- [ ] **Step 2: Run the package test to verify it fails**

Run: `node --test test/chrome-store-package.test.js`

Expected: FAIL because the ZIP still contains popup-only files and lacks the side-panel files.

- [ ] **Step 3: Update the packager file list**

Replace `popup.html`, `popup.js`, and `popup.css` in `zip-for-chromestore.js` with `sidepanel.html`, `sidepanel.js`, and `sidepanel.css`. Add `event-store.js` while retaining the existing formatter and click-handler files.

- [ ] **Step 4: Remove the superseded popup files**

Delete `popup.html`, `popup.js`, and `popup.css` after the packager references only their side-panel replacements.

- [ ] **Step 5: Run the package test to verify it passes**

Run: `node --test test/chrome-store-package.test.js && node --check zip-for-chromestore.js`

Expected: the package test PASSes and the syntax check exits 0.

- [ ] **Step 6: Update the local development instructions**

Change the README's testing guidance to say: reload the unpacked extension from the repository root, click the extension action icon, and use the native Chrome side panel. State that Chrome 114 or later is required.

- [ ] **Step 7: Build the package and verify its archive**

Run: `node zip-for-chromestore.js && unzip -t segment-chromeextension.zip`

Expected: the archive command reports every file as `OK` and exits 0.

- [ ] **Step 8: Perform manual Chrome verification**

1. Open `chrome://extensions`, enable Developer mode, and reload the unpacked extension from the repository root.
2. Navigate two tabs to pages that emit Segment-compatible events.
3. Click the extension action icon and confirm Chrome opens the native side panel rather than a popup.
4. Confirm the default stream shows only the active tab's events and source labels are absent.
5. Open the cog configuration view, enable “Show events from all tabs,” and confirm one newest-first stream with a title/host source label under every event.
6. Switch active tabs and confirm active-tab mode refreshes to that tab's events.
7. Confirm filter, snake-case toggle, API-domain settings, copy, event expansion, and text selection still work.

- [ ] **Step 9: Run the final complete verification suite**

Run: `npm test && node --check sidepanel.js && node --check event-store.js && node --check background.js && node --check background-service.js && git diff --check`

Expected: all tests PASS, every syntax check exits 0, and no whitespace errors are reported.

- [ ] **Step 10: Commit packaging and documentation updates**

```bash
git add README.md zip-for-chromestore.js test/chrome-store-package.test.js popup.html popup.js popup.css
git commit -m "Package and document side panel usage"
```

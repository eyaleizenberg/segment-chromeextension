# Task 1 Report: Shared Event Scope and Source Labels

## Implementation summary

- Added `event-store.js` as a UMD-compatible shared utility for extension pages, `importScripts()`, and Node tests.
- Added `selectEvents(events, tabId, showAllTabs)`, preserving the newest-first input order while selecting either the global stream or active-tab events.
- Added `formatEventSource(event)` with the required priority: tab title plus parsed host, parsed host, valid non-negative tab ID, then `Unknown tab`.
- Malformed host URLs are caught and treated as an empty host so label rendering continues safely.
- Added four focused Node tests covering scope selection and source-label fallback behavior.

## Exact tests and results

1. `node --test test/event-store.test.js` after the initial scope tests: **FAIL** with `MODULE_NOT_FOUND` for `../event-store` (expected RED).
2. `node --test test/event-store.test.js` after the scope implementation: **PASS**, 2 tests.
3. `node --test test/event-store.test.js` after adding source-label tests and before exporting `formatEventSource`: **FAIL**, 2 passing and 2 failing with `formatEventSource is not a function` (expected RED).
4. `node --test test/event-store.test.js` after source-label implementation: **PASS**, 4 tests.
5. `npm test`: **PASS**, 10 tests.
6. `git diff --check`: **PASS**, no whitespace errors.

## RED/GREEN evidence

- Scope RED demonstrated the missing production module, then GREEN passed both scope assertions.
- Source-label RED demonstrated the missing export, then GREEN passed both source-label assertions and the complete focused suite.

## Files changed

- `event-store.js`
- `test/event-store.test.js`

## Self-review

- Confirmed all-tabs mode returns the original array reference/order and active-tab mode filters with strict tab ID equality.
- Confirmed UMD behavior exports both utilities through `module.exports` and attaches both to `globalThis` for extension contexts.
- Confirmed URL parsing uses `URL(...).host` and malformed URLs do not throw.
- Confirmed no unrelated tracked or untracked source files were changed.

## Concerns

None for Task 1. Integration into `background.js` and `sidepanel.js` is intentionally left for subsequent tasks.

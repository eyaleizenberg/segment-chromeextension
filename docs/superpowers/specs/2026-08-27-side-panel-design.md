# Segment Chrome Extension Side Panel Design

## Goal

Replace the extension popup with Chrome's native side panel while preserving its event-inspection workflow. The extension action icon opens the panel, which shows Segment-compatible events either for the active tab or for every tab in a combined chronological stream.

## Scope

- Replace the popup surface with `sidepanel.html`.
- Open the side panel from the extension action icon.
- Add a persisted configuration setting for active-tab versus all-tabs event display.
- In all-tabs mode, identify the originating tab for every event.
- Preserve filtering, event expansion, copy-to-clipboard, API-domain configuration, and snake-case event-name display.

## Non-goals

- Changing event capture rules or external API-domain defaults.
- Adding tab grouping, sorting controls, or event persistence across service-worker restarts.
- Supporting Chrome versions before Side Panel API availability (Chrome 114).

## Manifest and entry points

The extension already uses Manifest V3. Update `manifest.json` to:

- Remove `action.default_popup`.
- Add the `sidePanel` permission.
- Add `side_panel.default_path` pointing to `sidepanel.html`.
- Keep the action icon and existing storage, webRequest, and host permissions.

`background-service.js` will configure `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`, allowing the toolbar icon to open or toggle the native panel.

`sidepanel.html` replaces `popup.html` as the extension UI entry page, loading the existing stylesheet and shared browser-compatible utilities. The packaging script will include the renamed page and every script it loads.

## Event data and panel queries

Each captured event will retain its chronological ordering and include source metadata captured from the originating browser tab:

- `tabId`
- `tabTitle`
- `hostName`

Capture paths will resolve the request's tab rather than assuming the current active tab. This gives all-tabs mode a reliable source label even after the user changes tabs.

The side panel persists `show_all_tabs` in `chrome.storage.local`; it defaults to `false`.

- **Active-tab mode:** the panel asks the background worker for the active tab's events.
- **All-tabs mode:** the panel asks for the global event list in its existing newest-first order.

The background port protocol receives the requested scope and returns the corresponding event list. The panel re-queries after a new event, after a setting change, and when the active browser tab changes.

## UI behavior

The side panel uses its available width rather than the popup's fixed 700px body width.

- The primary view contains the filter and event stream.
- A cog icon in the panel header toggles the configuration view. It does not display a “Configure” text button.
- The configuration view contains the existing snake-case and API-domain settings plus “Show events from all tabs.”
- When all-tabs mode is enabled, every event includes a compact source line with the originating tab's title and host. Active-tab mode does not add that line.
- Existing copy behavior and the protection against text selections toggling an event remain intact.

If the active tab cannot be resolved, the panel renders the existing empty state. Missing source metadata is displayed with a safe fallback rather than preventing the event list from rendering.

## Testing and verification

Automated coverage will include:

- event selection for active-tab and all-tabs modes;
- source-label formatting and fallbacks;
- the all-tabs storage preference;
- active-tab-change refresh behavior;
- the existing formatter and text-selection interaction regressions;
- manifest structure and Chrome Web Store package contents.

Verification will run the complete Node test suite, JavaScript syntax checks, manifest validation, and package validation. Manual Chrome verification will reload the unpacked extension, open the panel from the toolbar icon, switch tabs, toggle all-tabs mode, and confirm event source labels and existing interactions.

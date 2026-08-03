# Sent-message editing

BetterLectio edits a sent message through Lectio's native ASP.NET controls. There is no BetterLectio API or database involved.

## Eligibility

A message is editable only when its rendered row contains an `EditModeToggleBtn` postback. The clients preserve that exact target while parsing the thread and do not infer ownership from the sender name. If Lectio does not render the target, the Edit action is absent.

## Postback sequence

Editing is always a serialized two-POST operation:

1. Fetch/open a fresh copy of the thread and locate the message again by its portable locator.
2. POST every current form field to the parsed form action with:
   - `__EVENTTARGET=<row prefix>$EditModeToggleBtn`
   - `__EVENTARGUMENT=`
3. Parse the returned form, including its new ViewState and form action.
4. Within the same dynamic row prefix, parse:
   - title: `…$EditModeHeaderTitleTB$tb`
   - body: `…$EditModeContentBBTB$TbxNAME$tb`
   - save target ending in `SendMessageBtn`, `SaveMessageBtn`, or `UpdateMessageBtn`
   - optional cancel target ending in `BackMessageBtn`
5. POST every field from the edit response to its parsed form action with the row-scoped save target and the edited title/body overrides.
6. Accept success only when the response parses as a thread page without Lectio validation errors, then replace/invalidate cached thread data.

The two POSTs must never share ViewState. Dynamic `ctlNN` row indices must never be hardcoded, and a control from another row must never be used as a fallback.

## Content rules

- Title limit: 100 characters.
- Body limit: 100,000 characters, including a preserved BetterLectio signature.
- Existing attachments remain attached and are read-only in the editor.
- Supported rich-text BBCode is `[b]`, `[i]`, `[u]`, `[url]`, and `[url=…]`.
- If the body ends with `\n\n[url=https://betterlectio.dk/download]Sendt med BetterLectio[/url]`, the editor hides it and appends the exact original bytes when saving.
- Lectio may append a terminal `Redigeret af …, d. …` audit line after saving. Thread parsers expose its timestamp separately and omit the audit line from the visible message body.

## Platform UX

- Extension: inline editor inside the message card.
- iOS: native sheet with a UIKit-backed rich BBCode editor.
- Android: Material bottom sheet using the shared `BbcodeEditor`.

All platforms disable conflicting reply/reaction operations during an edit, retain edit state after a failed save, and refresh or replace the thread after completion.

# BetterLectio message reactions (`blr1`)

Message reactions are ordinary Lectio messages. BetterLectio adds no reaction
backend and stores no reaction data outside the Lectio thread. Clients that do
not understand this protocol see a short Danish status message and a working
link to the BetterLectio download page.

## Carrier format

A carrier is a reply with no attachments and exactly one metadata link:

```text
Reagerede med “❤️”

[url=https://betterlectio.dk/download#blr1.<payload>]Sendt med BetterLectio[/url]
```

When the normal BetterLectio signature is suppressed, the link label is `#`.
The destination still opens the real download page for non-BetterLectio users.
The payload is UTF-8 JSON encoded as unpadded base64url and placed in the URL
fragment, so it is not sent to the website when the link is opened.

```ts
type Envelope =
  | {
      v: 1;
      op: 'set';
      emoji: '👍' | '❤️' | '😂' | '😮' | '😢' | '👎';
      target: MessageLocator;
    }
  | {
      v: 1;
      op: 'clear';
      emoji: null;
      target: MessageLocator;
    };

type MessageLocator = {
  senderKey: `id:${string}` | `name:${string}`;
  sentAt: `${string}-${string}-${string}T${string}:${string}:${string}`;
  occurrence: number;
};
```

A clear carrier's visible sentence is exactly `Fjernede sin reaktion`. It must
contain `emoji: null`; neither the visible fallback nor the clear payload
reveals the removed emoji.

## Target resolution

Clients scan messages in thread order. Non-carrier messages receive a locator
from their Lectio context-card ID (falling back to a normalized Danish sender
name), normalized local Lectio timestamp, and zero-based occurrence among
messages with the same sender and timestamp. Carrier messages do not consume
an occurrence.

A carrier is applied only when its target resolves to an earlier message. For
each target and native Lectio sender, the latest carrier wins. A `set` adds that
sender to one emoji group; a `clear` adds no group. Resolved carriers are hidden
by BetterLectio. Unresolved or malformed messages remain visible so ordinary
messages can never disappear merely because they resemble protocol data.

## Validation

Clients must require all of the following before hiding a carrier:

- HTTPS host `betterlectio.dk`, path `/download`, no query, fragment prefix
  `#blr1.`, and a bounded URL length.
- A version-1 payload matching one of the two envelope variants exactly enough
  to validate its operation, emoji, and locator.
- Exactly one protocol link whose label is either `Sendt med BetterLectio` or
  `#`.
- Visible text matching the canonical sentence for the decoded operation.
- No attachments and a target earlier in the same thread.

After an edit, Lectio may inject a localized audit line such as
`Redigeret af …, d. 3/8-2026 09:54`. Clients ignore only that narrowly formatted
Lectio line while validating the carrier. The line is not removed from normal
messages by the reaction resolver itself; the ordinary message parser extracts
the same terminal line into `editedAt` metadata before rendering it as a compact
localized label. Any other extra carrier text still fails validation.

## Mutation behavior

The first reaction is sent through Lectio's normal reply postback and preserves
the user's current notification choice. Changing or clearing it edits that same
owned carrier through Lectio's row-scoped edit and save postbacks, which keeps
one carrier per person. Every postback uses the newest ASP.NET ViewState.

Web, iOS, and Android should share this protocol and resolution algorithm. A
platform may use a native reaction UI, but the Lectio carrier remains the sole
source of truth.

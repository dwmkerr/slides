# Conference decks

Conference decks are dependency-free HTML presentations for talks where pacing and feel matter as much as content.

## Start

Copy `themes/conference/template/` to the destination. The folder contains:

- `presentation.html`: the public deck
- `presentation.md`: slide outline and speaker-note source
- `notes.html`: phone-readable teleprompter
- `slides-editor.js`: browser editing and live-save controls

When the user asks to preview, present, serve, or edit the deck, use the serving workflow in `SKILL.md`.

## Markup

- Each slide is `<section class="slide TYPE" data-name="unique-id">`.
- Use an eyebrow followed by one heading.
- Add `data-reveal="true"` to progressive slides and `revealable` to fragments.
- Keep full speaker notes in `presentation.md`, not the public deck.
- Pair Markdown note sections to HTML slides by order and stable `data-name`.

## Copy

- One idea per slide.
- No full stops on headings or leads.
- No em dashes.
- The slide is not the script.

`references/conference-example.html` is a real-world example from the publicly delivered AI Native DevCon London 2026 talk.

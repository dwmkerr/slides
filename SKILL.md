---
name: slides
description: Creates, previews, serves, and collaboratively edits hand-built HTML slide decks, conference presentations, and speaker notes. Use when the user asks to "create slides", "make a presentation", "build a slide deck", use the "dwmkerr.com style", create a conference talk, preview or open a deck, "serve the slides", or "make the slides editable". Produces dependency-free HTML with browser editing, live-save, and comments.
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
license: MIT
compatibility: Generated decks need a modern browser. Live editing requires Node.js 20 or later.
metadata:
  author: dwmkerr
---

# Slides

Create whitespace-led, hand-built HTML decks that work without a framework or build step. Decks must remain readable source files that an agent can edit directly.

## Use cases

### Create a deck

Trigger: the user asks for slides or a presentation from a prompt, README, or document.

1. Read the source material.
2. Ask for a style only when the prompt does not signal one. Offer `dwmkerr.com`, `conference`, or `QuantumBlack-inspired`.
3. Copy the closest template from `themes/` or `references/` into the user's requested directory.
4. Write one central idea per slide and keep the slide separate from its script.
5. Preserve the keyboard and editing conventions below.
6. Verify every slide at 16:9 with available rendering or browser tooling.
7. Unless the prompt asks to preview, show, open, serve, present, or edit the deck, report its path without launching a browser or leaving a server running.
8. When that intent is explicit or clear from context, follow **Preview, serve, or edit with the user**.

Result: a dependency-free HTML deck plus any local images and speaker notes it needs.

### Create a conference talk

Trigger: the user says "conference talk", "conference deck", "speaker notes", "teleprompter", or asks for the hand-built dark style.

1. Read [Conference decks](references/conference-decks.md).
2. Copy `themes/conference/template/` into the chosen deck directory.
3. Edit `presentation.html` for slides and `presentation.md` for the talk track.
4. Keep `notes.html` as the phone-readable teleprompter view.
5. Verify navigation, reveals, notes, and fullscreen. Serve and open the deck only when the user asks to preview, present, rehearse, serve, or edit it.

Result: a complete conference deck with separate speaker notes.

### Preview, serve, or edit with the user

Trigger: the user asks to preview, show, open, present, or rehearse a deck; "serve the slides"; "make the slides editable"; edit in the browser; save changes live; or comment on slides.

1. Resolve `bin/slides.js` relative to this `SKILL.md` and run `node <skill-directory>/bin/slides.js serve <deck-path> --open` in a long-running process.
2. Give the user the printed local URL, not the implementation command.
3. Keep the process running until the user asks to stop or the presentation/editing session is finished. Comments are printed there as they arrive.
4. For machine-readable events, query `GET /__slides/comments` or watch `GET /__slides/events` as Server-Sent Events.
5. Apply requested changes to the source and tell the user when a browser refresh is needed.

Result: browser edits save to the served HTML file and comments reach the agent without a sidecar file.

## Styles

- **dwmkerr.com**: off-white, terminal details, mono typography, restrained amber. Read [dwmkerr.com style](references/dwmkerr-style.md).
- **Conference**: dark, typographic, progressive reveals, notes, and teleprompter. Read [Conference decks](references/conference-decks.md).
- **QuantumBlack-inspired**: a public-material-only approximation for dark technical slides. Read [QuantumBlack-inspired style](references/quantumblack-style.md).

If the user explicitly requests another presentation format, use a more suitable installed tool or skill when one is available.

## Deck conventions

- Use `<section class="slide" data-name="unique-id">` for every slide.
- Use unique, stable `data-name` values so navigation, notes, and comments can identify slides.
- Mark editable content with `data-editable` or use the standard heading, paragraph, list, table, and blockquote elements.
- Mark progressive fragments with `class="revealable"`.
- Keep headings and leads free of full stops.
- Use regular hyphens, not em dashes.
- Keep one central idea per slide and favour whitespace over dense copy.
- Put images beside the deck and use relative paths.
- Include `runtime/slides-editor.js` as `slides-editor.js` beside the deck.

## Keyboard conventions

| Key | Action |
|---|---|
| Right / Space / PageDown | Reveal or move forward |
| Left / PageUp | Undo a reveal or move back |
| `E` | Enter edit mode |
| `Esc` | Leave edit mode or close a dialog |
| `Cmd/Ctrl+Enter` | Save now while editing |
| `C` | Comment on the current slide |
| `F` | Toggle fullscreen |
| Home / End | First / last slide |

Do not intercept `Cmd/Ctrl+S`; it belongs to the browser. The edit toolbar must display the save shortcut and connection state.

## Live editing rules

- The editor pings `/__slides/ping` when edit mode starts.
- When the local server is detected, edits save automatically after a short debounce.
- When it is not detected, do not claim that changes are saved. Show: `Live editing is disconnected. Tell your agent: "Serve the slides."`
- Comments exist in server memory only. They are available through HTTP and SSE, and disappear when the server exits.
- Never add the analytics tag to user-generated decks. Analytics belongs only to this repository's public gallery and demos.

## Quality check

Before finishing:

1. For ordinary creation, validate without launching the user's browser or leaving a server running. When preview, presentation, serving, or editing is requested, serve the deck and keep the process running.
2. Check first/last navigation, fragment reveals, edit mode, comment mode, fullscreen, and the counter.
3. Confirm live-save works when the server is present and warns when it is absent.
4. Check for clipped or overflowing content at a 16:9 desktop viewport.
5. Check that all assets use relative paths and no confidential content is included.

## Attribution

The QuantumBlack-inspired style is unofficial and based only on publicly available material. It is not a brand guide or endorsement. Do not include internal, confidential, client, or proprietary content in examples.

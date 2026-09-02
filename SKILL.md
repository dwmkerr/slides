---
name: slides
description: Creates, previews, serves, checks, exports, and collaboratively edits hand-built HTML slide decks, conference presentations, and speaker notes. Use when the user asks to "create slides", "make a presentation", "build a slide deck", use the "dwmkerr.com style", create a conference talk, preview or open a deck, "serve the slides", "make the slides editable", check a deck, or export slides to PDF. Produces dependency-free HTML with browser editing, conflict-safe live-save, comments, preflight checks, and selected-slide export.
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
license: MIT
compatibility: Generated decks need a modern browser. Live editing requires Node.js 20 or later. Checks and PDF export also require Playwright with Chromium.
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

### Present or print in the browser

Trigger: the user asks to present a deck, print the current slide, print the complete deck, or save numbered pages through the browser.

1. Open or serve the deck as requested.
2. Move into the bottom 20% or use normal `Tab` navigation to reveal the auto-hiding toolbar. It flashes briefly on load and when entering fullscreen.
3. Use **Print** for the current slide or **Export** for the complete deck.
4. Both actions open the browser's print dialog; choose Save as PDF when a file is needed.
5. For numbered selections such as `1,3-5`, print all and enter the range in the browser's Pages field.
6. Use the CLI export flow below for stable `data-name` values or reordered selections.

Result: clean 16:9 print pages with progressive content revealed and presentation controls removed.

### Check a deck

Trigger: the user asks to validate, preflight, or check a deck for problems.

1. Resolve `bin/slides.js` relative to this `SKILL.md`.
2. Run `node <skill-directory>/bin/slides.js check <deck-path>`.
3. Report errors for missing or duplicate `data-name` values, persisted editor state, and broken local assets.
4. Report slide-overflow warnings with the affected stable slide name.

Result: an evidence-based structural and 16:9 browser check without changing the deck.

### Export slides

Trigger: the user asks for a PDF, selected slides, or an export of a deck.

1. Resolve `bin/slides.js` relative to this `SKILL.md`.
2. Run `node <skill-directory>/bin/slides.js export <deck-path> --output <file.pdf>`.
3. Add `--slides 1,3-5` for numeric selection or `--slides title,community` for stable `data-name` selection.
4. Preserve the requested order and report the output path and page count.

Result: a 16:9 PDF with one page per selected slide, progressive content fully revealed, and editor controls excluded.

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

Do not intercept `Tab`; native focus reveals the toolbar through `:focus-within`. Do not intercept `Cmd/Ctrl+S`; it belongs to the browser. The bottom toolbar must auto-hide when idle, reappear only in the bottom 20%, flash briefly on load and fullscreen, remain visible while focused or editing, and provide navigation, edit, save, print, and export actions.

## Live editing rules

- The editor pings `/__slides/ping` when edit mode starts.
- The server injects its current editor runtime into the served response without changing the source file.
- When the local server is detected, edits save automatically after a short debounce.
- Every page receives the revision of the exact source it loaded. Saves use that revision and stop with a reconcile warning if the source changed externally.
- Browser-generated paste markup is reduced to plain text. Existing semantic markup and deliberate styling remain intact.
- Saving reapplies editable content to a clean copy of the loaded source so navigation, reveal, viewport, and editor-owned state are not persisted.
- When it is not detected, do not claim that changes are saved. Show: `Live editing is disconnected. Tell your agent: "Serve the slides."`
- Comments exist in server memory only. They are available through HTTP and SSE, and disappear when the server exits.
- Never add the analytics tag to user-generated decks. Analytics belongs only to this repository's public gallery and demos.

## Quality check

Before finishing:

1. For ordinary creation, validate without launching the user's browser or leaving a server running. When preview, presentation, serving, or editing is requested, serve the deck and keep the process running.
2. Check first/last navigation, fragment reveals, edit mode, comment mode, fullscreen, and the counter.
3. Confirm live-save works when the server is present and warns when it is absent.
4. Run `node <skill-directory>/bin/slides.js check <deck-path>` to check stable names, local assets, persisted state, and overflow at a 16:9 desktop viewport.
5. Check that all assets use relative paths and no confidential content is included.

## Attribution

The QuantumBlack-inspired style is unofficial and based only on publicly available material. It is not a brand guide or endorsement. Do not include internal, confidential, client, or proprietary content in examples.

---
name: slides
description: Creates, previews, serves, checks, exports, and collaboratively edits hand-built HTML slide decks, conference presentations, and speaker notes. Use when the user asks to "create slides", "make a presentation", "build a slide deck", use the "dwmkerr.com style", create a conference talk, compare alternative slide layouts, preview or open a deck, "serve the slides", "make the slides editable", check a deck, or export slides to PDF. Produces dependency-free HTML with browser editing, conflict-safe live-save, comments, preflight checks, and selected-slide export.
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
2. Press `Esc` (or `M`, which also works in fullscreen) to open the menu at the top of the deck. Normal `Tab` navigation opens it too.
3. Use `F` for fullscreen while presenting.
4. Use the browser's print (`Cmd/Ctrl+P`) to print or save every slide; choose Save as PDF when a file is needed.
5. For numbered selections such as `1,3-5`, enter the range in the browser's Pages field.
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

- **Editorial layouts**: clean white slides with large imagery, split introductions, columns/rows, checklists, timelines and reading walls. Copy `themes/editorial/template/`; read its [layout guide](themes/editorial/template/README.md). Left/right moves through the story; up/down compares alternative layouts of the same content. Public essay content and Gemini-generated abstract imagery are included as examples.
- **dwmkerr.com**: off-white, terminal details, mono typography, restrained amber. Read [dwmkerr.com style](references/dwmkerr-style.md).
- **Conference**: dark, typographic, progressive reveals, notes, and teleprompter. Read [Conference decks](references/conference-decks.md).
- **QuantumBlack-inspired**: a public-material-only approximation for dark technical slides. Read [QuantumBlack-inspired style](references/quantumblack-style.md).

If the user explicitly requests another presentation format, use a more suitable installed tool or skill when one is available.

## Deck conventions

- Use `<section class="slide" data-name="unique-id">` for every slide.
- Use unique, stable `data-name` values so navigation, notes, and comments can identify slides.
- Mark editable content with `data-editable` or use the standard heading, paragraph, list, table, and blockquote elements.
- Mark progressive fragments with `class="revealable"`.
- To offer themes, add one `<style data-slides-theme="name">` block per theme (optional `data-label`). With two or more, the menu shows a toggle top right, enables only the chosen block, sets `data-theme` on `<html>`, remembers the choice, and accepts `?theme=`. Leave the base theme's block empty. Slides that should not change have no rules in the theme blocks.
- Add `data-slides-menu="open"` to `<html>` to start with the menu open, for example on public demos.
- Add `data-layout="page"` to a slide that scrolls like a web page. `slides check` skips its overflow warning.
- Do not add a footer with key hints, a slide counter, or navigation buttons. The shared menu and its hint already provide them.
- Keep headings and leads free of full stops.
- Use regular hyphens, not em dashes.
- Keep one central idea per slide and favour whitespace over dense copy.
- Put images beside the deck and use relative paths.
- Include `runtime/slides-editor.js` as `slides-editor.js` beside the deck.

### Alternative layouts

When the user wants layout options, use the editorial template or add `runtime/slides-navigation.js` beside the deck. Load it before `slides-editor.js` and remove the previous deck navigation handler. It scales a `.stage` canvas authored at 1920 × 1080 and also supports `.revealable` fragments.

Give each alternative its own stable `data-name`, share a `data-page` key within a group, and use distinct single-letter `data-alt` values such as `A` and `B`. Keep the core content consistent across alternatives. A slide with no alternatives needs only its unique name. The shared menu adds up/down buttons when alternatives are present and counts groups, for example `2 / 5 (B)`.

Link directly with `?slide=2B` or `?slide=stories-rows`. Choices are remembered per URL path; explicit URL alternatives take precedence. Use `data-goto="group-key"` on a link to jump to that group while preserving its selected alternative.

Print and default export include every HTML section, including all alternatives. Numeric export indices count sections, whereas the navigation counter counts groups. To export a curated deck, select one stable `data-name` per group with `--slides`; do not imply export uses browser-stored choices.

## Keyboard conventions

| Key | Action |
|---|---|
| Right / Space / PageDown | Reveal or move forward |
| Left / PageUp | Undo a reveal or move back |
| Up / Down | Previous / next alternative in a grouped deck |
| `E` | Enter edit mode |
| `Esc` | Close a dialog, then leave edit mode, then open or close the menu |
| `M` | Open or close the menu, including in fullscreen |
| `Cmd/Ctrl+Enter` | Save now while editing |
| `C` | Comment on the current slide |
| `F` | Toggle fullscreen |
| Home / End | First / last slide |

Do not intercept `Tab`; native focus opens the menu. Do not intercept `Cmd/Ctrl+S`; it belongs to the browser. Do not bind `Esc` or `M` in deck scripts; the shared runtime owns them. The menu is a top bar with previous, slide counter, next, edit, save, save status, and a theme toggle at the right when the deck embeds themes. Fullscreen stays on `F` and printing stays on the browser's own print. It stays open while editing. A small, plainly styled `Esc Show/Hide Toolbar` hint sits top right, as the last item in the menu while it is open (themes sit to its left), fades in on load, fades after a few idle seconds, returns on mouse movement, never prints, and inverts its colour so it stays readable on any background.

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

<a href="https://dwmkerr.github.io/slides/"><img src="./site/assets/hero.gif" alt="A tour of QuantumBlack-inspired, conference, and dwmkerr.com slide styles followed by browser edit mode" width="100%"></a>

# slides

Hand-built HTML presentations that coding agents can create, present, and edit with you.

## Install

```sh
npx skills add dwmkerr/slides
```

## Try it out

> **Prompt:** Create slides in the dwmkerr.com style that present three options for coding agents

## Examples

### QuantumBlack-inspired

<a href="https://dwmkerr.github.io/slides/quantumblack/"><img src="./site/assets/quantumblack-preview.png" alt="Dark technical slide comparing vibe coding with agentic engineering" width="100%"></a>

### Conference

<a href="https://dwmkerr.github.io/slides/conference/"><img src="./site/assets/conference-preview.png" alt="Dark typographic conference title slide" width="100%"></a>

### dwmkerr.com

<a href="https://dwmkerr.github.io/slides/demo-slides/"><img src="./site/assets/demo-preview.png" alt="Warm off-white dwmkerr.com slide comparing three coding-agent options" width="100%"></a>

- Dependency-free, hand-built HTML
- QuantumBlack-inspired, conference, and `dwmkerr.com` styles
- Arrow-key navigation, progressive reveals, fullscreen, notes, and teleprompter view
- Move into the bottom 20% or use `Tab` to reveal the auto-hiding toolbar
- Press `E` to edit any served HTML deck, with conflict-safe live saving
- Check decks for structural and visual problems, then export all or selected slides to PDF

## Edit together

To preview or edit a deck, ask:

> Serve the slides

or “Make the slides editable.” Move into the bottom 20% to reveal the toolbar, or reach it with normal `Tab` navigation. It flashes briefly on load and fullscreen, stays visible in edit mode, shows whether live-save is connected, and warns clearly if it disconnects.

The local server injects the editor in memory. It does not add editor code to the source file. Browser saves are rejected if an agent or text editor changed the file after the page loaded.

## Present and print

Use **Print** in the bottom toolbar for the current slide or **Export** for the complete deck. Both use the browser's print dialog; choose Save as PDF to create a file. When exporting all slides, enter a numbered range such as `1,3-5` in the browser's Pages field.

[Open the interactive demo pack](https://dwmkerr.github.io/slides/demo-pack/) to try navigation, reveals, editing, and printing together.

## Check and export

Check stable slide names, local assets, persisted editor state, and 16:9 overflow:

```sh
slides check presentation.html
```

Export the complete deck or a selected subset:

```sh
slides export presentation.html --output presentation.pdf
slides export presentation.html --slides 1,3-5 --output review.pdf
slides export presentation.html --slides title,community --output review.pdf
```

Selections preserve the requested order. Every slide is exported at 16:9 with progressive content revealed and editor controls hidden.

## See also

- [Interactive template gallery](https://dwmkerr.github.io/slides/)
- [AI Native DevCon conference deck](https://dwmkerr.github.io/slides/conference/) and [recorded talk](https://www.youtube.com/watch?v=ACL7_EsfIio)
- [More tools and skills by dwmkerr](https://skills.sh/dwmkerr)
- [claude-toolkit](https://github.com/dwmkerr/claude-toolkit), the original home of this skill

This standalone project starts at `v0.1.6`, inherited from [claude-toolkit v0.1.6](https://github.com/dwmkerr/claude-toolkit/tree/v0.1.6/plugins/dwmkerr/skills/slides).

## Developer guide

Install the CLI dependencies and Chromium:

```sh
npm install
npm link
npx playwright install chromium
```

Install the current checkout globally, then invoke it in Claude Code:

```sh
npx skills add . --global --agent claude-code --yes
```

```text
/slides build me a deck comparing coding agent harnesses
```

Run the install command again after source changes because the checkout is copied. Claude Code hot-reloads standalone skills; use `/reload-skills` only if needed. No version bump or `/reload-plugins` is required.

Run all unit, browser, export, and project checks:

```sh
npm test
```

## Attribution

The QuantumBlack-inspired style is an unofficial approximation based only on publicly available material. It is not a QuantumBlack or McKinsey brand guide, product, or endorsement. No internal, confidential, client, or proprietary presentation content is included. Use of a style for an external work-related presentation does not make these templates official work assets; users remain responsible for permissions for anything they add.

[MIT](./LICENSE) © Dave Kerr

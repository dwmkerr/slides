# Editorial layouts with alternatives

Copy this whole folder to start a deck. Open `presentation.html` directly in a browser, or serve it with the slides CLI for live editing. There is no build step and no external asset dependency.

Left/right moves through five slide groups. Up/down cycles through alternative layouts within the current group. The menu shows the group number and alternative, for example `2 / 5 (B)`. Each group remembers its selected alternative in this browser.

## Layouts

| Group | Alternative A | Alternative B |
|---|---|---|
| 1. Introduction | Split introduction, image and three strands | Full-width image band |
| 2. Three ideas | Three image columns | Three image rows |
| 3. Next steps | Parallel checklists | — |
| 4. A case study | Narrative and vertical timeline | Visual pair and horizontal timeline |
| 5. Reading | Linked reading wall and process | — |

The alternative pairs carry the same core content. Choose an arrangement to suit the story, or keep multiple options while reviewing.

## Adapt a layout

Edit the HTML sections and CSS directly. Each section needs a unique `data-name`; give alternatives the same `data-page` and distinct single-letter `data-alt` values:

```html
<section class="slide stories-columns" data-name="overview-columns" data-page="overview" data-alt="A">
  <!-- Content for the first layout -->
</section>
<section class="slide stories-rows" data-name="overview-rows" data-page="overview" data-alt="B">
  <!-- The same content in another layout -->
</section>
<section class="slide" data-name="next-steps" data-page="next-steps">
  <!-- A group with only one layout -->
</section>
```

The groups follow their first appearance in the source. Keep alternative sections together for readability. Omit `data-alt` on groups with only one layout. Navigation also accepts ordinary slides with just `data-name`.

Keep `slides-navigation.js` before `slides-editor.js` at the end of the document. The navigation script replaces any existing deck navigation handler. It handles scaling, grouped navigation, optional `.revealable` fragments and fullscreen; the shared editor owns editing, comments, the menu and printing.

- `?slide=2B` opens a particular alternative; `?slide=stories-rows` uses its stable name.
- Links such as `<a href="?slide=2A" data-goto="stories">Explore</a>` jump to a group and respect the reader's chosen alternative.
- Home/End moves to the first/last group. Up/down wraps within a group. The up/down buttons are disabled on a group with no alternatives and while editing.
- Selection is stored per URL path. An explicit URL alternative takes precedence; stale or unavailable choices fall back to the first layout.
- Replace the images with local assets and update their alternative text. The included art is decorative, not a visualisation of model activations or measured results.

## Check and export

```sh
slides check presentation.html
slides export presentation.html --output all-layouts.pdf
slides export presentation.html --slides intro-split,stories-rows,next-steps,study-timeline,reading-wall --output chosen-layouts.pdf
```

Browser print and default CLI export include **all eight layout sections**. Browser print also adds a small layout label to each page. The navigation counter counts five groups. Numeric export selections count HTML sections, not groups; use stable names when choosing one alternative per group. Export does not read browser-stored choices.

## Content and image sources

The examples adapt public essays by Dave Kerr:

- [Building Evidence with Agents](https://dwmkerr.com/building-evidence-with-agents/)
- [How I Use AI in Writing](https://dwmkerr.com/how-i-use-ai-in-writing/)
- [Understanding Byte Models](https://dwmkerr.com/understanding-byte-models/)

All people, company and client examples from the working deck have been replaced with public essay content. No portraits, office photographs, internal plans or results are included.

The three abstract images were previously generated with Google Gemini for the repository author and reused here as compressed JPEGs. They contain no text, logos, real locations or people. No new images were generated for this pack because Gemini's image quota was unavailable at the time.

| Image | Art direction |
|---|---|
| `images/neural-textures.jpg` | Repeating luminous textures, cyan and violet on a dark field |
| `images/iridescent-ribbons.jpg` | Floating translucent ribbons with iridescent colour |
| `images/neural-currents.jpg` | Turbulent currents and textured ridges in cyan, violet and green |

The canonical scripts live in `runtime/`. Their copies here keep the template portable. `site/layouts/` is the public demo, with the same layouts and images.

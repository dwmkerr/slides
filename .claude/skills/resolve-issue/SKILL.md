---
name: resolve-issue
description: Make a zero-shot first attempt at a GitHub issue in this repo, ending in a PR with before/after evidence (screenshots of the deck and menu, a live preview link, a single-file demo to download, or test output), or an issue comment explaining why not. Use when the user says "resolve issue #N", "zero-shot this", or asks for a resolve-issue style PR.
---

# Resolve an issue

A first effort, without a human in the loop. Get from a GitHub issue to a reviewable PR in one pass. The operator reviews it and merges, asks for changes or takes over. A clear PR that fails honestly is worth more than a polished one that hides a guess.

Running this skill is the operator's go-ahead to create an issue, push a fix branch and open a PR. Never push to `main` and never merge. Branches start from `origin/main` and their PRs target it.

## 1. Find the work

- **An issue**, `#15`: `gh issue view 15 --repo dwmkerr/slides --json number,title,body,labels,comments`.
- **An idea with no issue** (often a change first prototyped in a working deck): create the issue first. Every PR closes an issue. Title it as a conventional commit, e.g. `feat: hide backup slides from presenting navigation`; the body says what is wrong today and what is proposed. Never paste content from a private or client deck: describe the behaviour.

## 2. Decide whether to attempt it

Stop and comment on the issue instead of coding when any of these hold:

- It needs a product or design decision the issue doesn't make.
- It changes the CLI's public flags or the deck file format in a way existing decks would break on.
- The fix is clearly bigger than about 10 files or 300 lines, not counting the synced runtime copies.
- You can't reproduce it.

The comment says what you found: where the code is, the likely cause, the options and which you'd pick. Shape it like the PR body (step 7).

## 3. Branch and capture "before"

The working tree must be clean apart from untracked files. Work in a worktree so the operator's checkout is untouched:

```bash
git fetch origin
git worktree add -b feat/<issue>-<short-slug> ../slides-<issue> origin/main    # fix/ for bugs
```

Evidence lives in `scratch/resolve-<issue>/` (gitignored). Pick what fits:

| Change | Evidence |
| --- | --- |
| Runtime or menu behaviour, a theme, a template | Before/after screenshots of the same deck, desktop `1280x800` and mobile `390x844` |
| The preview site (`site/`) | Screenshots, plus the PR preview link (step 6) |
| CLI (`slides check`, `slides export`) | Command output before and after, or a test that fails then passes |
| Logic with nothing to see | A test that fails before the fix and passes after |

Use the same deck for both sides so only the code differs. For runtime changes, serve one copy of the deck with the runtime from `main` (`git show origin/main:runtime/slides-editor.js > scratch/resolve-<issue>/before/slides-editor.js`, next to a copy of the deck) and the branch's copy for after. Serve each with `python3 -m http.server <port> --bind 127.0.0.1` and drive it with Playwright MCP.

- Open the menu for a shot with `document.documentElement.classList.add('slides-menu-open')`.
- Clear local storage **before** loading each side, then reload: the runtime reads settings at load, and both sides share an origin if you reuse a port.
- The menu updates a moment after a key press. Check the screenshot, not a value read straight after the key.
- The before must show the problem to someone glancing at it, e.g. the counter on the slide you should not have reached.

## 4. Make the change

- Follow `CLAUDE.md`: decks stay framework-free, dependency-free and editable as HTML, and static viewing must work without the local server.
- A runtime change bumps the runtime version and syncs every copy of `slides-editor.js`; `npm run validate` checks this.
- Changes to `SKILL.md` need a matching update to `skill-tests.yaml`.
- Add or update a test that fails before the fix (`test/*.unit.test.js` or `test/*.browser.test.js`).
- Run `npm test` (unit, browser and validation) and `node bin/slides.js check <deck>` for any deck you touched.
- Use conventional commits; release-please writes `CHANGELOG.md`, so leave it alone.

## 5. Capture "after"

Repeat step 3's steps exactly against the branch and save `*-after-*` files next to the before ones. Look at every pair. If the after doesn't show the fix, keep working or say so in the PR.

## 6. Upload the evidence

PR bodies can't take attachments through the API. Images and openable files go on the `pr-assets` branch, which shares no history with `main`, one folder per issue. **This repo is public, so everything on `pr-assets` is public**: upload demo content only, never a private deck or a screenshot of one.

Copy the files to `scratch/resolve-<issue>/upload/`, shrink desktop shots with `sips -Z 1400`, then upload each with the contents API (create the branch first if `git ls-remote --heads origin pr-assets` is empty: an orphan commit with a short README):

```bash
for f in scratch/resolve-<issue>/upload/*; do
  base64 -i "$f" | tr -d '\n' > "$f.b64"
  gh api -X PUT "repos/dwmkerr/slides/contents/<issue>/$(basename "$f")" \
    -f message="chore: evidence for #<issue>" -f branch=pr-assets -F content=@"$f.b64" --jq .content.path
  rm "$f.b64"
done
```

Name files `<desktop|mobile>-<before|after>-<what>.png`. Each file's URL is `https://github.com/dwmkerr/slides/blob/pr-assets/<issue>/<file>?raw=true`.

Give the reviewer something to open, not just pictures:

- **Live preview.** Any PR that touches `site/` deploys to `https://dwmkerr.github.io/slides/pr-preview/pr-<n>/` (`.github/workflows/pr-preview.yaml`). Link the page and slide that shows the change, e.g. `.../pr-<n>/demo-pack/index.html?slide=4`. Put a demo deck that shows the change in `site/` so the preview has it.
- **Single-file demo.** Inline the runtime into a copy of the demo deck (replace `<script src="slides-editor.js"></script>` with the script's contents, escaping `</script>`), upload it as `demo-<what>.html`, and link it with "download and open in a browser". It works offline and outlives the preview.

## 7. Open the PR

```bash
git push -u origin HEAD
gh pr create --repo dwmkerr/slides --base main --label zero-shot \
  --title "<conventional commit title>" --body-file scratch/resolve-<issue>/pr.md
```

Create the `zero-shot` label if it is missing. Open as a draft when the fix is partial. If a push guard on the operator's machine blocks the push, stop: leave the branch and `pr.md` ready and give the operator the exact commands.

The body:

- **Lead with the key message.** Summary, the "Try it" links, the before and after table, Checks, then "Still open" if a problem remains. Everything else goes in one collapsed `<details><summary>Details</summary>` block. The Zero-shot footer is last.
- **Caption every Before and After cell** with one short line under the image: what's wrong in the before, what's fixed in the after. A cell with no shot says why.
- **Give each distinct visible change its own pair**, including mobile when the menu or layout changes.
- Write in plain prose with no em dashes or curly quotes.

````markdown
## Summary
- <what changed and why, 1-3 bullets>

Closes #<issue>

**Try it:** [live preview](https://dwmkerr.github.io/slides/pr-preview/pr-<n>/<page>) (<what to press>), or [download the single-file demo](https://github.com/dwmkerr/slides/blob/pr-assets/<issue>/demo-<what>.html?raw=true) and open it in a browser.

## Before and after
| | Before | After |
| --- | --- | --- |
| <what>, desktop | <img src="https://github.com/dwmkerr/slides/blob/pr-assets/<issue>/desktop-before-<what>.png?raw=true" width="480"><br><what's wrong> | <img src="...desktop-after-<what>.png?raw=true" width="480"><br><what's fixed> |
| <what>, mobile | <img src="...mobile-before-<what>.png?raw=true" width="280"><br><what's wrong> | <img src="...mobile-after-<what>.png?raw=true" width="280"><br><what's fixed> |

## Checks
- <npm test results with counts; slides check results>
- <how before and after were made identical; anything not checked and why>

## Still open
<only when a problem remains>

<details><summary>Details</summary>

<how it works, edge cases, commits, longer notes>

</details>

## Zero-shot
First attempt by the `resolve-issue` skill. Review it, then merge, ask for changes or take it over.
````

The preview URL needs the PR number, which you only know after `gh pr create`. Write the body with the expected number, then patch it if it differs: `gh api -X PATCH repos/dwmkerr/slides/pulls/<n> -F body=@scratch/resolve-<issue>/pr.md`.

## 8. Report

Give the operator the PR URL (or the issue comment URL if you stopped at step 2), the issue number and whether you created it, and anything you didn't check or weren't sure of.

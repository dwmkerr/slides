# Project instructions

- This repository contains one standalone Agent Skill for hand-built HTML slides.
- Keep generated decks framework-free.
- Keep generated decks dependency-free and directly editable as HTML.
- Preserve static viewing when the local slides server is unavailable.
- Skill changes require matching updates to `skill-tests.yaml`.
- Run `npm test` before handing off changes.
- Use conventional commits so release-please can manage versions and changelogs.

## Hero GIF

- Rebuild `site/assets/hero.gif` with `make hero` after changing its source screenshots.
- The required local tools are `ffmpeg` and `gifsicle` (`brew install ffmpeg gifsicle`).
- Keep the frame order: QuantumBlack-inspired, conference, dwmkerr.com, then dwmkerr.com edit mode.
- The source frames are `site/assets/quantumblack-preview.png`, `site/assets/conference-preview.png`, `site/assets/demo-preview.png`, and `references/dwmkerr-com-timeline-slide.png`.

# Tech articles and posts

A personal tech blog. Markdown files are turned into static HTML by a small
Python script (no static site generator), and the output is deployed to
GitHub Pages.

**Live site:** https://bogomaz-robotic.github.io/fantastic-garbanzo/

## Layout

```
.
├── src/
│   ├── posts/
│   │   └── <category>/[<sub-category>/]<post-slug>/
│   │       ├── index.md      # required — main content + YAML frontmatter
│   │       ├── <extra>.md    # optional — extra page(s) of this post
│   │       └── assets/       # optional — images etc., copied as-is
│   ├── templates/            # Jinja2: base.html, index.html, post.html
│   └── static/style.css      # the only stylesheet, copied to dist/static/
├── build.py                  # src/ → dist/
├── requirements.txt
└── .github/workflows/deploy.yml
```

## Writing a post

Create `src/posts/<category>/<slug>/index.md` (or `src/posts/<category>/<sub-category>/<slug>/index.md`):

```markdown
---
title: Async patterns in Python   # required
date: 2026-09-20                  # required, YYYY-MM-DD
tags: [python, asyncio]           # optional, filterable on the homepage
summary: One sentence for the homepage card.  # optional
cover: assets/cover.png           # optional card image, must be inside assets/
---

Post body in Markdown.
```

That's all — category and sub-category come from the directory path, and the
homepage is regenerated from the directory tree on every build. The homepage
shows every post as a card (a colored placeholder is used when there's no
`cover`) and can be filtered by category and tag; filters are reflected in the
URL, e.g. `?category=architecture&tag=caching`.

- **Extra pages:** any other `.md` file in the post directory becomes its own
  page at `<post-url>/<filename>/`, linked from an "In this post" list. Give it
  a `title` in frontmatter (defaults to the filename) and optionally an integer
  `order` (otherwise pages are sorted by filename).
- **Jupyter notebooks:** a `.ipynb` file in the post directory is rendered as
  an extra page too (markdown cells, highlighted code, and saved text, HTML,
  image and error outputs — the notebook is not executed). Set optional
  `title`/`order` in the notebook's top-level `metadata`. Link to it as
  `[notebook](analysis.ipynb)`.
- **Links and images:** use paths relative to the post directory, e.g.
  `![chart](assets/chart.png)` or `[benchmarks](benchmarks.md)` — they work
  from both the main page and extra pages.
- **Code:** fenced code blocks with a language (```` ```python ````) are
  syntax-highlighted at build time.
- **Diagrams:** ```` ```mermaid ```` blocks render as Mermaid diagrams. Only
  pages that contain one load the Mermaid script; all other pages are JS-free.
- **Raw HTML** (e.g. inline SVG figures using the `dg-*` classes in
  `style.css`) is passed through unchanged.

## Local development

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python build.py
cd dist && python -m http.server 8000
```

Then visit `http://localhost:8000`. `build.py` wipes and regenerates `dist/`
on every run.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which installs the
requirements, runs `python build.py`, and publishes `dist/` to GitHub Pages.
In the repository settings, Pages must be set to deploy from **GitHub
Actions**.

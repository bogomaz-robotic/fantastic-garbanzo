# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal tech blog ("bogomaz-robotic.tech"). A single Python script, `build.py`, turns Markdown/Jupyter sources under `src/posts/` into static HTML in `dist/`, which is deployed to GitHub Pages (https://bogomaz-robotic.github.io/fantastic-garbanzo/). There is no static site generator, no test suite, and no linter configured. `README.md` is the author-facing guide to writing posts (frontmatter fields, extra pages, notebooks, mermaid) — keep it in sync when changing build behavior.

## Commands

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python build.py                      # wipes and regenerates dist/
cd dist && python -m http.server 8000
```

`build.py` validates all posts before touching `dist/`; on a validation error it prints `build failed: <path>: <reason>` and exits 1 with the previous `dist/` left intact. Running the build is the only way to check a change.

Deployment: pushing to `main` is meant to run `.github/workflows/deploy.yml` (install requirements, `python build.py`, publish `dist/` to Pages). Note: `.github/workflows/` is currently empty, so that workflow does not exist yet.

## Architecture

**Content model is the directory tree.** A post is any directory containing `index.md`, and it must sit at exactly `posts/<category>/<slug>/` or `posts/<category>/<sub-category>/<slug>/` (depth 2 or 3; nesting a post inside another post is an error). Category/sub-category are derived from the path, never from frontmatter. Output URL mirrors the source path: `dist/posts/<rel>/index.html`.

**Build pipeline (`build.py`):**
1. `discover_post_dirs` → `load_post` per directory: parses/validates frontmatter (`title`, `date` required; `tags` list; `cover` must resolve inside the post's `assets/`), renders Markdown.
2. Every other `.md` or `.ipynb` file in the post directory becomes an `ExtraPage` at `<post-url>/<stem>/`, sorted by optional integer `order` then filename. `index` and `assets` are reserved stems. Notebooks are rendered from saved outputs only (never executed) by `render_notebook`.
3. `render_markdown` pre-extracts ```` ```mermaid ```` fences into `<pre class="mermaid">` *before* python-markdown runs (so codehilite doesn't touch them) and returns a `has_mermaid` flag; that flag flows into the template context so only pages with diagrams load the Mermaid CDN script (in `base.html`).
4. `rewrite_relative_urls` post-processes rendered HTML `href`/`src` attributes: `foo.md`/`foo.ipynb` links become clean `foo/` URLs, and extra pages get `../` prepended because they live one directory deeper than the post. Authors therefore always write links relative to the post source directory.
5. `Site.emit` renders Jinja templates with `StrictUndefined` (any missing context variable is a build error) and computes `root` (a `../` chain) so all site links are relative — the site works under the `/fantastic-garbanzo/` Pages subpath and from a local server alike. Templates must use `{{ root }}` for site-relative links, never absolute `/` paths.
6. `src/static/` is copied wholesale to `dist/static/`; each post's `assets/` is copied next to its HTML.

**Homepage filtering** is client-side. `homepage_context` builds category/tag chip data (tags are grouped by `slugify`, label from the first spelling seen); `index.html` renders every card with `data-category`/`data-tags`, and `src/static/filter.js` shows/hides cards and syncs `?category=&tag=` in the URL. The same script handles each card's title-bar buttons: × (`.card-close`) and _ (`.card-minimize`) hide the card on top of the filters, stored by `data-id` (the post URL) in `localStorage.closedPosts` / `minimizedPosts`. Minimized cards appear as buttons in `.card-tray` (click restores one); closed cards come back only via "Restore closed". □ (`.card-open`) is a plain link to the post. Filters, the full-width toggle (`layout.js`) and the light/dark toggle (`theme.js`) are rendered `hidden` and revealed by JS, so the page degrades to a plain list without JS. Both toggles persist in `localStorage` and are applied by an inline script in `base.html` before first paint. On post pages the window title bar's □ (`.width-toggle-alt`) is a second width toggle driven by `layout.js`; its _ and × are plain links back to the homepage.

**Theming:** the dark palette in `style.css` exists twice — under `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and under `:root[data-theme="dark"]` — so a stored choice overrides the system setting. Keep the two blocks identical, and put theme-dependent values in tokens rather than new media queries. `theme.js` fires a `themechange` event that re-renders Mermaid diagrams.

**Image viewer:** `src/static/zoom.js` (loaded by `post.html` only) opens diagrams and images from `.post-content` in an overlay with wheel/pinch zoom and pointer-drag panning. It clones the clicked node, so Mermaid SVGs work once rendered; targets are matched by selector at click time and re-marked on `load` and `themechange`.

**Styling:** `src/static/style.css` is the only stylesheet. Card placeholders use a `--hue` derived from a CRC32 of the category (`Post.hue`). Raw HTML in posts passes through unchanged; inline SVG figures use the `dg-*` classes defined in `style.css`.

Frontend JS is plain ES5-style IIFEs with no build step or dependencies.

#!/usr/bin/env python3
"""Build the blog: src/posts/**/*.md -> static HTML in dist/."""

from __future__ import annotations

import base64
import html
import json
import re
import shutil
import sys
import zlib
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

import frontmatter
import markdown
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name
from pygments.util import ClassNotFound

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
POSTS_DIR = SRC / "posts"
TEMPLATES_DIR = SRC / "templates"
STATIC_DIR = SRC / "static"
DIST = ROOT / "dist"

SITE_NAME = "bogomaz-robotic.tech"
POST_ASSETS_DIRNAME = "assets"
EXTRA_PAGE_SUFFIXES = (".md", ".ipynb")

MARKDOWN_EXTENSIONS = ["fenced_code", "tables", "codehilite"]
MARKDOWN_CONFIG = {"codehilite": {"css_class": "highlight", "guess_lang": False}}

MERMAID_FENCE = re.compile(r"^```mermaid[ \t]*\n(.*?)^```[ \t]*$", re.MULTILINE | re.DOTALL)
URL_ATTR = re.compile(r'(\s(?:href|src)=")([^"]*)(")')
URL_SCHEME = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")
ANSI_ESCAPE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


class BuildError(Exception):
    pass


@dataclass
class ExtraPage:
    slug: str
    title: str
    order: int | None
    body: str
    has_mermaid: bool


@dataclass
class Post:
    rel: tuple[str, ...]
    src_dir: Path
    title: str
    date: date
    tags: list[str]
    summary: str | None
    cover: str | None
    body: str
    has_mermaid: bool
    pages: list[ExtraPage] = field(default_factory=list)

    @property
    def category(self) -> str:
        return self.rel[0]

    @property
    def cover_url(self) -> str | None:
        return self.url + self.cover if self.cover else None

    @property
    def hue(self) -> int:
        return zlib.crc32(self.category.encode()) % 360

    @property
    def breadcrumb(self) -> list[str]:
        return [humanize(part) for part in self.rel[:-1]]

    @property
    def url(self) -> str:
        return "posts/" + "/".join(self.rel) + "/"

    @property
    def date_label(self) -> str:
        return f"{self.date:%b} {self.date.day}, {self.date.year}"


def humanize(name: str) -> str:
    return re.sub(r"[-_]+", " ", name).strip().title()


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def render_markdown(text: str) -> tuple[str, bool]:
    def to_mermaid_block(match: re.Match[str]) -> str:
        return f'\n\n<pre class="mermaid">{html.escape(match.group(1).rstrip())}</pre>\n\n'

    text, mermaid_count = MERMAID_FENCE.subn(to_mermaid_block, text)
    md = markdown.Markdown(extensions=MARKDOWN_EXTENSIONS, extension_configs=MARKDOWN_CONFIG)
    return md.convert(text), mermaid_count > 0


def rewrite_relative_urls(body: str, from_subpage: bool) -> str:
    """Map `foo.md`/`foo.ipynb` links to clean URLs; re-anchor relative URLs for sub-pages one level deeper."""

    def rewrite(url: str) -> str:
        if not url or url.startswith(("#", "/", "?")) or URL_SCHEME.match(url):
            return url
        path, sep, fragment = url.partition("#")
        if path.endswith(EXTRA_PAGE_SUFFIXES):
            head, _, name = path.rsplit(".", 1)[0].rpartition("/")
            path = (f"{head}/" if head else "") + ("" if name == "index" else f"{name}/")
        if from_subpage:
            path = "../" + path
        return (path or "./") + sep + fragment

    return URL_ATTR.sub(lambda m: m.group(1) + rewrite(m.group(2)) + m.group(3), body)


def read_markdown_file(path: Path) -> tuple[dict, str]:
    try:
        doc = frontmatter.load(path)
    except Exception as exc:
        raise BuildError(f"{path.relative_to(ROOT)}: invalid frontmatter ({exc})") from exc
    return dict(doc.metadata), doc.content


def parse_date(value: object, path: Path) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value.strip())
        except ValueError:
            pass
    raise BuildError(f"{path.relative_to(ROOT)}: 'date' is required and must be YYYY-MM-DD")


def discover_post_dirs() -> list[Path]:
    post_dirs = sorted(p.parent for p in POSTS_DIR.rglob("index.md"))
    post_dir_set = set(post_dirs)
    for post_dir in post_dirs:
        rel = post_dir.relative_to(POSTS_DIR).parts
        if len(rel) not in (2, 3):
            raise BuildError(
                f"{post_dir.relative_to(ROOT)}: posts must live at posts/<category>/<slug>/ "
                "or posts/<category>/<sub-category>/<slug>/"
            )
        nested_in = next((p for p in post_dir.parents if p in post_dir_set), None)
        if nested_in:
            raise BuildError(
                f"{post_dir.relative_to(ROOT)}: post directory is nested inside another post "
                f"({nested_in.relative_to(ROOT)})"
            )
    return post_dirs


def join_source(value: object) -> str:
    return "".join(value) if isinstance(value, list) else str(value or "")


def highlight_code(source: str, language: str) -> str:
    try:
        lexer = get_lexer_by_name(language)
    except ClassNotFound:
        lexer = get_lexer_by_name("text")
    return highlight(source, lexer, HtmlFormatter(cssclass="highlight", wrapcode=True))


def render_notebook_output(output: dict) -> str:
    def pre(text: str, css_class: str) -> str:
        return f'<pre class="nb-output {css_class}">{html.escape(ANSI_ESCAPE.sub("", text.rstrip()))}</pre>\n'

    kind = output.get("output_type")
    if kind == "stream":
        return pre(join_source(output.get("text")), "nb-stderr" if output.get("name") == "stderr" else "nb-stream")
    if kind == "error":
        traceback = output.get("traceback") or [f"{output.get('ename')}: {output.get('evalue')}"]
        return pre("\n".join(traceback), "nb-error")

    data = output.get("data") or {}
    for mime in ("image/png", "image/jpeg"):
        if mime in data:
            encoded = join_source(data[mime]).replace("\n", "")
            return f'<img class="nb-image" alt="" src="data:{mime};base64,{encoded}">\n'
    if "image/svg+xml" in data:
        encoded = base64.b64encode(join_source(data["image/svg+xml"]).encode()).decode()
        return f'<img class="nb-image" alt="" src="data:image/svg+xml;base64,{encoded}">\n'
    if "text/html" in data:
        return f'<div class="nb-output nb-html">{join_source(data["text/html"])}</div>\n'
    if "text/plain" in data:
        return pre(join_source(data["text/plain"]), "nb-result")
    return ""


def render_notebook(path: Path) -> tuple[dict, str, bool]:
    try:
        notebook = json.loads(path.read_text(encoding="utf-8"))
        cells = notebook["cells"]
    except (ValueError, KeyError, TypeError) as exc:
        raise BuildError(f"{path.relative_to(ROOT)}: not a valid Jupyter notebook ({exc})") from exc

    meta = notebook.get("metadata") or {}
    language = (
        (meta.get("kernelspec") or {}).get("language")
        or (meta.get("language_info") or {}).get("name")
        or "python"
    )

    parts: list[str] = []
    has_mermaid = False
    for cell in cells:
        source = join_source(cell.get("source"))
        if cell.get("cell_type") == "markdown":
            cell_html, cell_mermaid = render_markdown(source)
            has_mermaid |= cell_mermaid
            parts.append(f'<div class="nb-cell nb-markdown">\n{cell_html}\n</div>')
        elif cell.get("cell_type") == "code" and (source.strip() or cell.get("outputs")):
            outputs = "".join(render_notebook_output(o) for o in cell.get("outputs") or [])
            code = highlight_code(source, language) if source.strip() else ""
            parts.append(f'<div class="nb-cell nb-code">\n{code}{outputs}</div>')
    return meta, "\n".join(parts), has_mermaid


def load_extra_page(path: Path) -> ExtraPage:
    if path.stem in (POST_ASSETS_DIRNAME, "index"):
        raise BuildError(f"{path.relative_to(ROOT)}: '{path.stem}' is a reserved page name")
    if path.suffix == ".ipynb":
        meta, body, has_mermaid = render_notebook(path)
    else:
        meta, content = read_markdown_file(path)
        body, has_mermaid = render_markdown(content)
    order = meta.get("order")
    if order is not None and (isinstance(order, bool) or not isinstance(order, int)):
        raise BuildError(f"{path.relative_to(ROOT)}: 'order' must be an integer")
    title = meta.get("title")
    return ExtraPage(
        slug=path.stem,
        title=title.strip() if isinstance(title, str) and title.strip() else humanize(path.stem),
        order=order,
        body=rewrite_relative_urls(body, from_subpage=True),
        has_mermaid=has_mermaid,
    )


def load_post(post_dir: Path) -> Post:
    index_path = post_dir / "index.md"
    meta, content = read_markdown_file(index_path)

    title = meta.get("title")
    if not isinstance(title, str) or not title.strip():
        raise BuildError(f"{index_path.relative_to(ROOT)}: 'title' is required")

    tags = meta.get("tags") or []
    if not isinstance(tags, list) or not all(isinstance(t, (str, int, float)) for t in tags):
        raise BuildError(f"{index_path.relative_to(ROOT)}: 'tags' must be a list")
    if any(not slugify(str(t)) for t in tags):
        raise BuildError(f"{index_path.relative_to(ROOT)}: every tag needs at least one letter or digit")

    cover = meta.get("cover")
    if cover is not None:
        assets_dir = (post_dir / POST_ASSETS_DIRNAME).resolve()
        cover_path = (post_dir / str(cover)).resolve()
        if not cover_path.is_file() or assets_dir not in cover_path.parents:
            raise BuildError(
                f"{index_path.relative_to(ROOT)}: 'cover' must point to an existing file inside "
                f"{POST_ASSETS_DIRNAME}/ (e.g. {POST_ASSETS_DIRNAME}/cover.png)"
            )
        cover = cover_path.relative_to(post_dir.resolve()).as_posix()

    summary = meta.get("summary")
    body, has_mermaid = render_markdown(content)

    page_files = sorted(
        p for p in post_dir.iterdir() if p.is_file() and p.suffix in EXTRA_PAGE_SUFFIXES and p.name != "index.md"
    )
    slugs = [p.stem for p in page_files]
    duplicate = next((s for s in slugs if slugs.count(s) > 1), None)
    if duplicate:
        raise BuildError(f"{post_dir.relative_to(ROOT)}: more than one page file named '{duplicate}'")
    pages = [load_extra_page(p) for p in page_files]
    pages.sort(key=lambda p: (p.order is None, p.order or 0, p.slug))

    return Post(
        rel=post_dir.relative_to(POSTS_DIR).parts,
        src_dir=post_dir,
        title=title.strip(),
        date=parse_date(meta.get("date"), index_path),
        tags=[str(t) for t in tags],
        summary=str(summary).strip() if summary else None,
        cover=cover,
        body=rewrite_relative_urls(body, from_subpage=False),
        has_mermaid=has_mermaid,
        pages=pages,
    )


def homepage_context(posts: list[Post]) -> dict:
    categories = Counter(post.category for post in posts)
    tag_counts = Counter(slug for post in posts for slug in {slugify(tag) for tag in post.tags})
    tag_labels: dict[str, str] = {}
    for post in posts:
        for tag in post.tags:
            tag_labels.setdefault(slugify(tag), tag)
    return {
        "posts": sorted(posts, key=lambda p: (-p.date.toordinal(), p.title)),
        "categories": [
            {"slug": slug, "label": humanize(slug), "count": count} for slug, count in sorted(categories.items())
        ],
        "tags": [
            {"slug": slug, "label": tag_labels[slug], "count": tag_counts[slug]}
            for slug in sorted(tag_counts, key=lambda s: tag_labels[s].lower())
        ],
    }


class Site:
    def __init__(self) -> None:
        self.env = Environment(
            loader=FileSystemLoader(TEMPLATES_DIR),
            autoescape=select_autoescape(["html"]),
            undefined=StrictUndefined,
            trim_blocks=True,
            lstrip_blocks=True,
            keep_trailing_newline=True,
        )
        self.env.filters["slugify"] = slugify

    def emit(self, parts: tuple[str, ...], template: str, **context: object) -> None:
        context.setdefault("description", None)
        context.setdefault("mermaid", False)
        root = "../" * len(parts) or "./"
        out = self.env.get_template(template).render(site_name=SITE_NAME, root=root, **context)
        out_path = DIST.joinpath(*parts, "index.html")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(out, encoding="utf-8", newline="\n")

    def emit_post(self, post: Post) -> None:
        parts = ("posts", *post.rel)
        self.emit(
            parts,
            "post.html",
            post=post,
            page=None,
            page_title=post.title,
            description=post.summary,
            body=post.body,
            nav=self.page_nav(post, current=None),
            mermaid=post.has_mermaid,
        )
        for page in post.pages:
            self.emit(
                (*parts, page.slug),
                "post.html",
                post=post,
                page=page,
                page_title=f"{page.title} · {post.title}",
                body=page.body,
                nav=self.page_nav(post, current=page),
                mermaid=page.has_mermaid,
            )
        assets = post.src_dir / POST_ASSETS_DIRNAME
        if assets.is_dir():
            shutil.copytree(assets, DIST.joinpath(*parts, POST_ASSETS_DIRNAME))

    @staticmethod
    def page_nav(post: Post, current: ExtraPage | None) -> list[dict]:
        if not post.pages:
            return []
        prefix = "../" if current else ""
        nav = [{"title": post.title, "href": None if current is None else prefix or "./"}]
        for page in post.pages:
            nav.append({"title": page.title, "href": None if page is current else f"{prefix}{page.slug}/"})
        return nav


def main() -> int:
    try:
        posts = [load_post(d) for d in discover_post_dirs()]
    except BuildError as exc:
        print(f"build failed: {exc}", file=sys.stderr)
        return 1

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    shutil.copytree(STATIC_DIR, DIST / "static")

    site = Site()
    for post in posts:
        site.emit_post(post)
    site.emit((), "index.html", **homepage_context(posts))

    extra_count = sum(len(p.pages) for p in posts)
    print(f"Built {len(posts)} post(s) and {extra_count} extra page(s) into {DIST.relative_to(ROOT)}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())

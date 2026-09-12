# Written — Design Overview

## About this document

This is **as-built documentation**, reverse-engineered from the current state of the codebase and its git history — not a forward-looking design document written before the system existed, and not a record of an actual design process. The project's history contains no design docs, ADRs, or commit messages explaining rationale.

Accordingly, this document describes **what the system does and how its pieces fit together** with the confidence that comes from direct observation of the code. Anywhere it states **why** something is shaped the way it is, that reasoning is either confirmed directly by the project owner or explicitly marked as inference from evidence in the code — never presented as if it were a rationale on record when it isn't.

This document is distinct from `CLAUDE.md`, the project's operational context file for AI coding agents. `CLAUDE.md` is dense, line-number-specific, and gotcha-oriented, meant to be read by an agent about to edit this code. This document is a narrative overview meant for a human reader — onboarding, or getting oriented before consulting `CLAUDE.md`'s specifics. Where the two would repeat the same fact in a different register, this document defers to `CLAUDE.md` and links to it rather than duplicating it.

## System summary

Written is a personal publishing site: a reading portal for stories, essays, poetry, and articles, paired with two tools for producing that content — a content-management admin panel, and a standalone plain-text-to-HTML formatting editor ("Written & Formatted"). It is built as three independent HTML/CSS/JS surfaces sharing a filesystem, with no build step, no package manager, and no client-side framework anywhere in the stack.

## The three surfaces

**Reading portal** (repo root — `index.html`, `index.js`, `filter-system.js`, `theme.js`, `style.css`, `data.js`) is the public-facing side: a table of contents with genre/theme filtering, series grouping, and dark/light theming. It is fully static and carries no runtime dependency on any server. Its content data (`data.js`, a plain JS file that sets `window.__WRITTEN_DATA__`) is generated ahead of time and committed alongside the HTML; the portal reads it via a synchronous `<script>` tag rather than a network request. `index.js` contains a fetch-based fallback path to `/api/projects` for local development convenience, but the portal's deployed behavior does not depend on it.

**Admin panel** (`admin/`) is the only surface with a real backend dependency: it requires `save-server.js`, a small hand-written Node HTTP server, running locally to persist anything. It is a single-page CRUD interface for the site's content — add, edit, reorder, and delete pieces; manage genres, themes, and series — that communicates with the server over a small set of JSON endpoints (`GET /api/projects`, `POST /api/save-projects`, `POST /api/save-html`). This is the one surface that requires the local dev server; the other two are served by opening the HTML file directly or through any static file server.

**Written & Formatted** (`app/`) is a self-contained plain-text-to-HTML formatting tool with its own bracket-tag markup language (`[title]`, `[section]`, `[pullquote]`, etc.), a live preview, and export options. It runs from a static server and has no build-step requirement, matching the rest of the site. Its data model, markup language, and code are entirely independent of the rest of the system — no shared JS modules and no shared data model with the reading portal or admin panel. Its only connection to the rest of the system is a manual, user-driven one: a piece is composed in the editor, its "embed" HTML export is copied, and that HTML is pasted into the admin panel to publish it. There is no API call or shared code path between `app/` and `admin/`; the handoff is copy-paste.

## Data flow: publishing a piece

```
Written & Formatted (app/)          Admin panel (admin/)              save-server.js
        |                                    |                              |
   [compose text,                            |                              |
    export embed HTML]                       |                              |
        |                                    |                              |
        `-------- copy/paste content ------->|                              |
                                              |                              |
                                    [fill in title, path,                    |
                                     slug, date, genres...]                  |
                                              |                              |
                                       autosave (debounced)                  |
                                              |                              |
                                              |--- POST /api/save-html ----->|
                                              |                        writes writing/<category>/<slug>.html
                                              |                              |
                                              |--- POST /api/save-projects ->|
                                              |                        writes data/projects.json
                                              |                        regenerates data.js
                                              |                              |
                                                                              v
                                                                    Reading portal (index.html)
                                                                    reads data.js on next load
```

`data/projects.json` is the single source of truth for the site's content metadata (title, path, slug, dates, genres, themes, series linkage, publish state). `data.js` is a derived artifact, mechanically regenerated from it on every save — the generated file's own header comment states this ("Auto-generated from projects.json — Do not edit directly"). The pipeline is deliberately one-directional: `projects.json` → `data.js` → reading portal, never the reverse.

The one sharp edge in this pipeline, documented further in `CLAUDE.md`: regeneration only happens when `save-server.js` actually runs it — at server startup, or after a `POST /api/save-projects`. If `projects.json` is edited by any other means (a hand edit, a merge conflict resolution) without the server subsequently running, `data.js` goes stale with no error — the reading portal continues serving whatever `data.js` last contained, indefinitely, with no visible sign anything is wrong.

## Why no build tooling, framework, or package manager

No `package.json` exists anywhere in the repository, and every JS file loads via a plain `<script>` tag with no bundler, transpiler, or module system. `save-server.js` itself uses only Node's built-in `http`, `fs`, and `path` modules, with zero npm dependencies even for tasks — serving files, parsing JSON request bodies — that most comparable projects would delegate to a small framework.

The project runs from a static server and is built on the premise that it should not need a build step: the entire stack — reading portal, admin panel, and editor alike — is designed to be servable as-is, with nothing to compile, bundle, or transpile before it works. This keeps the dependency surface at zero: nothing to install, nothing to update, nothing that can go stale or need a security patch, at the cost of writing more by hand in places a framework would otherwise cover (the manual MIME-type mapping in `save-server.js`, for instance).

## Why a bespoke local server instead of a general backend

`save-server.js` exists to solve one problem: a static HTML page cannot write files to the local filesystem on its own. Every responsibility it has follows from that single constraint — read and write `data/projects.json`, regenerate `data.js`, write generated article HTML into `writing/`, and, as a secondary convenience, serve the site's own static files so the whole system can be exercised from one `localhost:3000` origin during local editing.

It is not a general-purpose backend: there is no database, no authentication, and no multi-user concept, and its scope is explicitly limited (per its own startup log output, "Written Admin Server") to this project's admin workflow. This fits a single-author publishing tool operated locally by one person, where a conventional backend — a framework, a database, deployed infrastructure — would be solving problems the project does not have.

## Design tokens and the wf.css relationship

The reading portal and admin panel share one design-token system, defined in `style.css`'s `:root[data-theme="light"/"dark"]` blocks: colors, an 8px spacing scale, and a shared container width. `admin.css` consumes these tokens correctly and defines none of its own.

`app/wf.css` defines its own, separate token system rather than importing `style.css`'s. This is an intentional design relationship, not an oversight: Written (the publishing site) and Written & Formatted (the editor) are meant to share a consistent color and typography identity — the same visual "vibe" — while remaining two independently implemented stylesheets with no shared file. In practice this means the two token systems currently hold matching values for several token names (`--color-bg`, `--color-accent`, `--shadow-sm/md`), but nothing in the code enforces that they stay in sync going forward; keeping them aligned is a manual, ongoing responsibility rather than a structural guarantee. `CLAUDE.md` documents the specific mechanics and drift risk of this arrangement in more detail.

## Scope boundary

Line-level detail, specific known bugs, exact API contracts, and the current tracked backlog live in `CLAUDE.md` and `sentinel-notes/` (audit reports, `TODO.md`, per-issue design briefs). This document stays at the level of how the system's pieces fit together and omits that operational detail by design.

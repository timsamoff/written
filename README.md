# Written by Tim Samoff

A publishing platform for stories, essays, poetry, and articles, with a plain-text tool that turns your writing into semantic, accessible HTML.

## What is Written?

Written is two things:

1. **A Reading Experience** — a collection of stories, essays, poetry, articles, and how-tos, presented beautifully with dark/light theme support and filtering by genre and theme.

2. **A Writing Tool** — "Written & Formatted" is an embedded editor that converts plain-text markup into publication-ready HTML with typographic features like drop caps, footnotes, and pull quotes.

---

## Features

### The Reading Portal
- Browse and filter by genre (Sci-Fi, YA, Articles, Poetry, Essays, Guides) and theme (Software Development, Writing, Post-Apocalyptic, Publishing, Autobiographical)
- Dark/light theme toggle with a persistent preference
- Responsive across desktop, tablet, and mobile
- Set in EB Garamond and Plus Jakarta Sans

### Written & Formatted Editor
- Live preview as you type
- Simple tag-based markup: `[b]bold[/b]`, `[i]italic[/i]`, `[section]Heading[/section]`, and more
- Four output styles — Written & Formatted Light/Dark (serif) and Modern Light/Dark (sans-serif); switch instantly in the preview, and exports use whichever style you've selected
- Formatting features:
  - Smart typography (curly quotes, proper dashes)
  - Drop caps and paragraph indentation options
  - Adjustable line spacing (1×, 1.5×, 2×)
  - Footnotes with automatic backlinking
  - Pull quotes, asides, epigraphs
  - Code blocks with syntax highlighting (via Prism)
  - Images with captions and credits
  - Lists (bullets, numbered, alphabetical) with nesting
- Export options:
  - **Standalone HTML** — a complete, self-contained page with your chosen style embedded
  - **Embeddable HTML** — a clean `<article>` block for pasting into a CMS or existing site
  - **Base CSS** — a structural stylesheet for your own theming
- Save and load your work directly from your browser (local storage)
- Click the toolbar to insert tags, or just type them

---

## Project Structure

```
written/
├── index.html              # Main reading portal & table of contents
├── index.js                # Table-of-contents rendering, series grouping
├── filter-system.js        # Filtering system for genres & themes
├── theme.js                # Dark/light theme toggle logic
├── style.css               # Design tokens, typography, and component styles
├── pill.js                 # Shared genre/theme pill rendering (portal + admin)
├── data.js                 # Auto-generated from data/projects.json — do not edit directly
├── save-server.js          # Local server the admin panel needs to save content
├── wbts_icon.png           # Logo and branding
├── favicon.ico
├── apple-touch-icon.png
├── admin/                  # Content management admin panel
│   ├── admin.html
│   ├── admin.js
│   └── admin.css
├── app/                    # Written & Formatted editor app (standalone)
│   ├── index.html
│   ├── wf.js
│   └── wf.css
├── data/
│   └── projects.json       # Central content data store
├── templates/
│   └── template.html       # Base template used to assemble article pages
└── writing/                # Published content (articles, essays, shorts, etc.)
```

---

## Getting Started

### For Readers
1. Open `index.html` in any modern web browser.
2. Use the **Filter by Genre & Theme** button to explore content.
3. Click any story title to read the full piece.
4. Toggle the theme with the moon/sun icon in the header.

### For Writers (Using the Editor)
1. Navigate to `/app/`, or use the embedded editor.
2. Click **Syntax guide** to see the available markup tags.
3. Type or paste your plain text, using tags to format it:
   ```
   [title]My Story Title[/title]
   [byline]By Your Name[/byline]

   [section]Chapter One[/section]

   This is a paragraph with [b]bold text[/b] and [i]italics[/i].

   [pullquote]A memorable line from your story[/pullquote]

   [link]Learn more → https://example.com[/link]
   ```
4. Watch the **Live Preview** panel update as you type.
5. Adjust formatting options (drop caps, line spacing, indentation) in the left panel.
6. Export your work:
   - **View Standalone** — download a complete HTML page.
   - **View Embed** — copy the article block for your CMS.
   - **View Base CSS** — copy the structural stylesheet.

### For Publishing (Using the Admin Panel)

The admin panel (`/admin/admin.html`) manages the site's content — adding, editing, and organizing published pieces. It needs a small local server running to save changes, since a browser can't write files to disk on its own.

1. Start the local server from the project root:
   ```
   node save-server.js
   ```
2. Open `http://localhost:3000/admin/admin.html` in your browser. The admin panel won't load or save anything without this server running.
3. Fill in the piece's details (title, path, slug, date, genres, themes) and paste in the HTML — either the embed output from the Written & Formatted editor above, or hand-written markup.
4. Changes autosave as you type. Saving writes the piece's HTML file into `writing/<category>/` and updates the site's content index (`data/projects.json`) — no separate step is needed to add it to the table of contents.
5. Stop the server (Ctrl+C in its terminal) when you're done editing.

The reading portal and the Written & Formatted editor are both fully static and don't need this server. Only the admin panel does.

---

## Design

The palette is a warm, earthy set of tones, chosen with contrast and accessibility in mind. Typography pairs EB Garamond for prose with Plus Jakarta Sans for UI. Dark and light themes both run on CSS custom properties, so switching between them doesn't cause any layout shift. It's built with plain HTML, CSS, and JavaScript — no framework, no build step, since the whole thing runs from a static server and doesn't need one.

---

## Technology Stack

- **HTML5** — semantic markup
- **CSS3** — custom properties, flexbox, grid
- **Vanilla JavaScript** — no dependencies
- **Google Fonts** — EB Garamond, Plus Jakarta Sans, Source Code Pro
- **Font Awesome 6.4** — icons
- **Prism.js** — syntax highlighting for code blocks

---

## Markup Reference

### Document Structure
```
[manuscript]name: Your Name | email: you@example.com | wordcount: 5000[/manuscript]
[title]Main Title Here[/title]
[subtitle]Optional Subtitle[/subtitle]
[byline]By Author Name[/byline]
```

### Inline Formatting
```
[b]Bold[/b]
[i]Italic[/i]
[link]Link text → https://example.com[/link]
[fn]1[/fn]  (footnote reference — links to [citations])
```

### Structural Blocks
```
[section]Major Heading[/section]
[subsection]Sub-heading[/subsection]
[subsubsection]Deeper heading[/subsubsection]

[pullquote]Memorable excerpt[/pullquote]
[aside]Supplementary content[/aside]
[epigraph]Opening quote — Attribution[/epigraph]
[mono]Monospaced prose block[/mono]
[code]# lang: javascript
const x = 1;[/code]
```

### Lists
```
[bullet]
Item one
Item two
[/bullet]

[num]
First item
Second item
[/num]

[alpha]
Letter A item
Letter B item
[/alpha]
```

### Media & Footnotes
```
[image]source: image.jpg | alt: Description | caption: Caption | credit: by Jane Doe[/image]

[citations]heading: Notes
1. First citation
2. Second citation
[/citations]

[end]The End[/end]
```

---

## Filtering and Theme

The reading portal supports multi-select filtering across genres and themes at once, with a live result counter and an "All" option that resets a category. It collapses into a compact UI on small screens.

The theme system detects your system preference automatically, remembers your choice in local storage, and transitions between light and dark without any layout shift.

---

## Example: Publishing a Story

1. Open the **Written & Formatted** editor and write your piece, using tags to format it.
2. Click **View Embed** and copy the article block.
3. Paste it into the admin panel (`/admin/admin.html`, with `node save-server.js` running), along with the piece's title, path, slug, date, genres, and themes.
4. Save. The admin panel writes the HTML file into `writing/` and adds it to the table of contents automatically.

---

## License

This work is released under the **Creative Commons Zero v1.0 Universal** (CC0) license, meaning it's public domain. Use it freely, with no restrictions.

---

## Contact

Questions or suggestions? Reach out:
**Email**: [samoff@gmail.com](mailto:samoff@gmail.com)

---

## Acknowledgments

- **Fonts**: Google Fonts (EB Garamond, Plus Jakarta Sans, Source Code Pro)
- **Icons**: Font Awesome 6.4
- **Syntax Highlighting**: Prism.js
- Built with care for readers and writers alike.

---

**Written by Tim Samoff** — *A collection of stories, essays, poetry, articles, and how-tos.*

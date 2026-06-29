# Written by Tim Samoff

A beautifully crafted digital publishing platform for writers. Browse stories, essays, poetry, and articles with powerful filtering, and transform plain text into semantically rich, professionally formatted HTML.

## 🎯 What is Written?

**Written** is a dual-purpose creative platform:

1. **A Reading Experience** — A curated collection of stories, essays, poetry, articles, and how-tos, beautifully presented with dark/light theme support and intelligent filtering by genre and theme.

2. **A Writing Tool** — "Written & Formatted" is an embedded editor that converts simple plain-text markup into publication-ready, accessible HTML with sophisticated typographic features like drop caps, ligatures, footnotes, and more.

---

## 🌟 Features

### The Reading Portal
- 📚 **Browse & Filter** — Discover content by genre (Sci-Fi, YA, Articles, Poetry, Essays, Guides) and theme (Software Development, Writing, Post-Apocalyptic, Publishing, Autobiographical)
- 🌓 **Dark/Light Theme** — Toggle between elegant light and dark color schemes with persistent preferences
- 📱 **Responsive Design** — Seamless reading experience across desktop, tablet, and mobile
- 🎨 **Typographic Excellence** — Built on EB Garamond and Plus Jakarta Sans for sophisticated, readable layouts
- ✨ **Smooth Interactions** — Polished hover states, transitions, and animations

### Written & Formatted Editor
- ✍️ **Live Preview** — See your formatted story update in real-time as you type
- 🏷️ **Simple Markup Syntax** — Intuitive tag-based formatting: `[b]bold[/b]`, `[i]italic[/i]`, `[section]Heading[/section]`, and more
- 🎨 **Four Output Styles** — Choose how your story looks:
  - **Written & Formatted Light/Dark** — Classic serif typography with warm, timeless tones
  - **Modern Light/Dark** — Clean sans-serif design with a contemporary feel
  - Switch styles instantly in the preview; exports use your selected style
- 📖 **Professional Features**:
  - Smart typography (curly quotes, ligatures, proper dashes)
  - Drop caps and paragraph indentation options
  - Adjustable line spacing (1×, 1.5×, 2×)
  - Footnotes with automatic backlinking
  - Pull quotes, asides, epigraphs
  - Code blocks with syntax highlighting (via Prism)
  - Images with captions and credits
  - Lists (bullets, numbered, alphabetical) with nesting
- 📤 **Export Options**:
  - **Standalone HTML** — Complete, self-contained page with your chosen style embedded
  - **Embeddable HTML** — Clean `<article>` block for pasting into CMSs or existing sites
  - **Base CSS** — Structural stylesheet for custom theming
- 💾 **Local Storage** — Save and load your work directly from your browser
- 🎯 **Formatting Toolbar** — Click to insert tags or type manually—your choice
- 🌗 **App Theme** — Switch between light and dark mode for comfortable editing

---

## 📂 Project Structure

```
written/
├── index.html              # Main reading portal & table of contents
├── app/
│   └── index.html          # Written & Formatted editor app
├── filter.js               # Smart filtering system for genres & themes
├── theme.js                # Dark/light theme toggle logic
├── style.css               # Design tokens, typography, and component styles
├── wbts_icon.png           # Logo and branding
├── favicon.ico
├── apple-touch-icon.png
└── writing/                # Content directory (stories, articles, etc.)
```

---

## 🚀 Getting Started

### For Readers
1. Open `index.html` in any modern web browser
2. Use the **Filter by Genre & Theme** button to explore content
3. Click any story title to read the full piece
4. Toggle the theme using the moon/sun icon in the header

### For Writers (Using the Editor)
1. Navigate to `/app/` or access the embedded editor
2. Click the **Syntax guide** toggle to see all available markup tags
3. Type or paste your plain text, using tags to format:
   ```
   [title]My Story Title[/title]
   [byline]By Your Name[/byline]

   [section]Chapter One[/section]

   This is a paragraph with [b]bold text[/b] and [i]italics[/i].

   [pullquote]A memorable line from your story[/pullquote]

   [link]Learn more → https://example.com[/link]
   ```
4. Watch the **Live Preview** panel update in real-time
5. Adjust formatting options (drop caps, line spacing, indentation) in the left panel
6. Export your work:
   - **View Standalone** → Download a complete HTML page
   - **View Embed** → Copy the article block for your CMS
   - **View Base CSS** → Copy the structural stylesheet

---

## 🎨 Design Highlights

- **Color Palette** — Warm, sophisticated earthy tones with excellent contrast for accessibility
- **Typography** — EB Garamond for prose (refined and elegant), Plus Jakarta Sans for UI (modern and clear)
- **Accessibility** — Semantic HTML, ARIA labels, keyboard navigation, and screen-reader support throughout
- **Theme Support** — CSS custom properties allow seamless dark/light mode switching without layout shifts
- **Performance** — Lightweight, no heavy frameworks—pure HTML, CSS, and vanilla JavaScript

---

## 🛠️ Technology Stack

- **HTML5** — Semantic markup for accessibility and SEO
- **CSS3** — Custom properties, flexbox, grid, and smooth transitions
- **Vanilla JavaScript** — No dependencies; lightweight interactivity
- **Google Fonts** — EB Garamond, Plus Jakarta Sans, Source Code Pro
- **Font Awesome 6.4** — Icons for buttons and UI elements
- **Prism.js** — Syntax highlighting for code blocks

---

## 📝 Markup Reference

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
[fn]1[/fn]  (footnote reference—links to [citations])
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

## 🌐 Live Features

### Filtering System
- **Multi-select filtering** — Choose multiple genres and themes simultaneously
- **Smart "All" button** — Selecting "All" resets the filter category
- **Live result counter** — See how many pieces match your filters
- **Empty state** — Helpful message when no results match
- **Collapsible UI** — Compact on small screens, expands on demand

### Theme System
- Automatically detects system preference (light/dark)
- Manual toggle always available in header
- Persistent preference using localStorage
- Smooth transitions with no layout shifts

---

## 📖 Example: Publishing a Story

1. Open the **Written & Formatted** editor
2. Paste or type your story in plain text
3. Add formatting tags:
   ```
   [title]The Threxil Pattern[/title]
   [byline]By Tim Samoff[/byline]

   [section]Part One[/section]

   [dropcap]T[/dropcap]he morning light filtered through crystalline structures...

   [pullquote]Some moments define entire civilizations.[/pullquote]

   [section]Part Two[/section]
   ...more content...

   [citations]
   1. Reference to external source
   [/citations]

   [end][/end]
   ```
4. Click **View Standalone** → Save as `.html` file
5. Add to the `writing/` directory and link from `index.html`
6. Update the table of contents with your new piece

---

## 🔐 License

This work is released under the **Creative Commons Zero v1.0 Universal** (CC0) license—public domain. Use it freely, with no restrictions.

---

## 📬 Contact

Questions or suggestions? Reach out:  
📧 **Email**: [samoff@gmail.com](mailto:samoff@gmail.com)

---

## 🙏 Acknowledgments

- **Fonts**: Google Fonts (EB Garamond, Plus Jakarta Sans, Source Code Pro)
- **Icons**: Font Awesome 6.4
- **Syntax Highlighting**: Prism.js
- Built with care for readers and writers alike ✨

---

**Written by Tim Samoff** — *A collection of stories, essays, poetry, articles, and how-tos.*

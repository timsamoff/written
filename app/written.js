/* ==========================================================================
   Written — HTML Formatter  |  written.js
   ========================================================================== */

'use strict';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const inputText        = document.getElementById('inputText');
const outputHtml       = document.getElementById('outputHtml');
const clearBtn         = document.getElementById('clearBtn');
const copyBtn          = document.getElementById('copyBtn');
const copyCleanBtn     = document.getElementById('copyCleanBtn');
const downloadBtn      = document.getElementById('downloadBtn');
const downloadCleanBtn = document.getElementById('downloadCleanBtn');
const downloadCssBtn   = document.getElementById('downloadCssBtn');
const livePreview      = document.getElementById('livePreview');
const themeToggle      = document.getElementById('themeToggle');
const toast            = document.getElementById('toast');
const rootEl           = document.documentElement;

// ── Theme ─────────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  rootEl.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '☀' : '☽';
  localStorage.setItem('written-formatter-theme', theme);
}

themeToggle.addEventListener('click', () => {
  applyTheme(rootEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

(function () {
  const saved = localStorage.getItem('written-formatter-theme');
  if (saved) applyTheme(saved);
  else if (window.matchMedia('(prefers-color-scheme: dark)').matches) applyTheme('dark');
  else applyTheme('light');
})();

// ── Option helpers ────────────────────────────────────────────────────────────

function getRadio(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : null;
}

// ── HTML escaping ─────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}

// ── Smart Quotes ──────────────────────────────────────────────────────────────

function smartenQuotes(str) {
  str = str.replace(/"([^"]*)"/g, '\u201C$1\u201D');
  str = str.replace(/(^|[\s([{])"(?=\S)/gm, '$1\u201C');
  str = str.replace(/(\S)"/g, '$1\u201D');
  str = str.replace(/"/g, '\u201D');
  str = str.replace(/(\w)'(\w)/g, '$1\u2019$2');
  str = str.replace(/(^|[\s([{])'(?=\S)/gm, '$1\u2018');
  str = str.replace(/(\S)'/g, '$1\u2019');
  str = str.replace(/'/g, '\u2019');
  return str;
}

// ── Inline markup ─────────────────────────────────────────────────────────────

function applyInlineMarkup(str, fnMap) {
  // [b]…[/b] → <strong>
  str = str.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>');
  // [i]…[/i] → <em>
  str = str.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<em>$1</em>');
  // [fn]ref[/fn] → footnote superscript link (fnMap is ref → id)
  if (fnMap) {
    str = str.replace(/\[fn\]([\s\S]*?)\[\/fn\]/gi, (_, ref) => {
      const id = fnMap[ref.trim()];
      if (!id) return `<sup>${escHtml(ref.trim())}</sup>`;
      // Anchor span sits one line above the sup via negative offset so the
      // return link scrolls to just above the footnote reference, not on top of it.
      return `<span id="fnref-${id}" class="fn-anchor" aria-hidden="true"></span><sup><a href="#fn-${id}" aria-label="Footnote ${id}" class="fn-ref">${id}</a></sup>`;
    });
  }
  // [link]text -> url[/link]
  str = str.replace(/\[link\]([\s\S]*?)\s*->\s*([^\[]*?)\[\/link\]/gi,
    (_, text, url) => `<a href="${url.trim()}" target="_blank" rel="noopener" aria-label="${escAttr(text.trim())} (opens in new tab)">${text.trim()}</a>`);
  // Legacy arrow link fallback: [Link Text -> URL]
  str = str.replace(/\[([^\]\n]+?)\s*->\s*([^\]\n]+?)\]/gi,
    (_, text, url) => `<a href="${url.trim()}" target="_blank" rel="noopener" aria-label="${escAttr(text.trim())} (opens in new tab)">${text.trim()}</a>`);
  return str;
}

function processInline(str, fnMap) {
  return applyInlineMarkup(smartenQuotes(escHtml(str)), fnMap);
}

// ── Section-break detection ───────────────────────────────────────────────────

function isSectionBreak(t) {
  if (!t) return false;
  return [
    /^\*{3,}$/, /^\*(\s*\*){2,}$/,
    /^-{3,}$/,  /^-(\s*-){2,}$/,
    /^~{3,}$/,  /^#{3,}$/, /^#(\s*#){2,}$/,
    /^={3,}$/,  /^\+{3,}$/, /^\.{3,}$/,
    /^<hr\s*\/?>$/i,
  ].some(p => p.test(t));
}

// ── Universal Open/Close Tokenizer ───────────────────────────────────────────

function tokenise(raw) {
  const lines  = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const tokens = [];
  let i = 0;

  function consumeBlock(closeTag) {
    const inner = [];
    while (i < lines.length && lines[i].trim().toLowerCase() !== closeTag) {
      inner.push(lines[i]);
      i++;
    }
    i++; // consume close tag
    return inner;
  }

  while (i < lines.length) {
    const line = lines[i];
    const t    = line.trim();
    const tl   = t.toLowerCase();

    // Header blocks
    if (tl === '[title]')    { i++; const inner = consumeBlock('[/title]');    tokens.push({ type: 'title',    content: inner.join('\n').trim() }); continue; }
    if (tl === '[subtitle]') { i++; const inner = consumeBlock('[/subtitle]'); tokens.push({ type: 'subtitle', content: inner.join('\n').trim() }); continue; }
    if (tl === '[byline]')   { i++; const inner = consumeBlock('[/byline]');   tokens.push({ type: 'byline',   content: inner.join('\n').trim() }); continue; }

    // Section heading (mid-document h2)
    if (tl === '[section]')    { i++; const inner = consumeBlock('[/section]');    tokens.push({ type: 'section',    content: inner.join('\n').trim() }); continue; }
    if (tl === '[subsection]') { i++; const inner = consumeBlock('[/subsection]'); tokens.push({ type: 'subsection', content: inner.join('\n').trim() }); continue; }

    // Editorial containers
    if (tl === '[pullquote]') { i++; const inner = consumeBlock('[/pullquote]'); tokens.push({ type: 'pullquote', content: inner.join('\n').trim() }); continue; }
    if (tl === '[aside]')     { i++; const inner = consumeBlock('[/aside]');     tokens.push({ type: 'aside',     content: inner.join('\n').trim() }); continue; }
    if (tl === '[epigraph]')  { i++; const inner = consumeBlock('[/epigraph]');  tokens.push({ type: 'epigraph',  content: inner.join('\n').trim() }); continue; }
    if (tl === '[mono]')      { i++; const inner = consumeBlock('[/mono]');      tokens.push({ type: 'mono',      content: inner.join('\n').trim() }); continue; }
    if (tl === '[code]')      { i++; const inner = consumeBlock('[/code]');      tokens.push({ type: 'code',      content: inner.join('\n') });        continue; }

    // Lists
    if (tl === '[bullet]' || tl === '[num]' || tl === '[alpha]') {
      const type = tl.replace('[', '').replace(']', '');
      i++;
      const inner = consumeBlock(`[/${type}]`);
      // rawLines preserves indentation for nested list detection
      tokens.push({ type, rawLines: inner.filter(l => l.trim() !== '' || /^[ \t]/.test(l)), items: inner.map(l => l.trim()).filter(Boolean) });
      continue;
    }

    // Image block
    if (tl === '[image]') {
      i++;
      const inner = consumeBlock('[/image]');
      const props = { source: '', alt: '', caption: '', credit: '' };
      inner.forEach(l => {
        const idx = l.indexOf(':');
        if (idx !== -1) {
          const key = l.substring(0, idx).trim().toLowerCase();
          const val = l.substring(idx + 1).trim();
          if (key in props) props[key] = val;
        }
      });
      tokens.push({ type: 'image', ...props });
      continue;
    }

    // Manuscript header block
    if (tl === '[manuscript]') {
      i++;
      const inner = consumeBlock('[/manuscript]');
      const props = { name: '', address: '', city: '', phone: '', email: '', wordcount: 'auto' };
      inner.forEach(l => {
        const idx = l.indexOf(':');
        if (idx !== -1) {
          const key = l.substring(0, idx).trim().toLowerCase();
          const val = l.substring(idx + 1).trim();
          if (key in props) props[key] = val;
        }
      });
      tokens.push({ type: 'manuscript', ...props });
      continue;
    }

    // Citations block — optional title: key, then free-form entries
    if (tl === '[citations]') {
      i++;
      const inner = consumeBlock('[/citations]');
      let citTitle = 'Notes';
      const contentLines = [];
      for (const l of inner) {
        const m = l.match(/^heading:\s*(.+)$/i);
        if (m) citTitle = m[1].trim();
        else contentLines.push(l);
      }
      tokens.push({ type: 'citations', lines: contentLines, title: citTitle });
      continue;
    }

    // [end] block
    if (tl === '[end]') {
      i++;
      const inner = consumeBlock('[/end]');
      tokens.push({ type: 'ending', content: inner.join('\n').trim() });
      continue;
    }

    // Section dividers
    if (isSectionBreak(t)) { tokens.push({ type: 'break', content: t }); i++; continue; }

    // Blank lines
    if (t === '') {
      let blanks = 0;
      while (i < lines.length && lines[i].trim() === '') { blanks++; i++; }
      if (blanks >= 2) tokens.push({ type: 'break', content: '' });
      continue;
    }

    // Plain paragraph (may contain [fn] inline)
    tokens.push({ type: 'para', content: t });
    i++;
  }

  return tokens;
}

// ── Footnote map builder ──────────────────────────────────────────────────────
// Scans tokens for [fn]ref[/fn] occurrences and assigns sequential integers.
// Returns a map of ref string → footnote number (as string).

function countBodyWords(tokens) {
  // Count words in all prose tokens (para, pullquote, aside, epigraph, mono)
  const proseTypes = new Set(['para','pullquote','aside','epigraph','mono']);
  let words = 0;
  for (const tok of tokens) {
    if (proseTypes.has(tok.type) && tok.content) {
      // Strip any tag markup before counting
      const plain = tok.content.replace(/\[[^\]]*\]/g, '').trim();
      if (plain) words += plain.split(/\s+/).length;
    }
  }
  // Round to nearest 100 (manuscript convention)
  return Math.round(words / 100) * 100;
}

function buildFnMap(tokens) {
  const map = {};    // ref → number
  let counter = 1;
  const inlineFn = /\[fn\]([\s\S]*?)\[\/fn\]/gi;

  function scanText(str) {
    let m;
    inlineFn.lastIndex = 0;
    while ((m = inlineFn.exec(str)) !== null) {
      const ref = m[1].trim();
      if (!(ref in map)) map[ref] = String(counter++);
    }
  }

  for (const tok of tokens) {
    if (tok.type === 'para')      scanText(tok.content);
    if (tok.type === 'pullquote') scanText(tok.content);
    if (tok.type === 'aside')     scanText(tok.content);
    if (tok.type === 'epigraph')  scanText(tok.content);
    if (tok.type === 'mono')      scanText(tok.content);
  }
  return map;
}

// ── Block renderers ───────────────────────────────────────────────────────────

function renderBlockLines(content, fnMap, extraClass) {
  return content.split('\n').map(l => {
    if (l.trim() === '') return `    <p class="block-spacer"></p>`;
    const cls = extraClass ? ` class="${extraClass}"` : '';
    return `    <p${cls}>${processInline(l, fnMap)}</p>`;
  }).join('\n');
}

function renderPullquote(tok, fnMap) {
  const rows = renderBlockLines(tok.content, fnMap);
  return `  <aside class="pullquote" role="note" aria-label="Pull quote">\n${rows}\n  </aside>`;
}

function renderAside(tok, fnMap) {
  const rows = renderBlockLines(tok.content, fnMap);
  return `  <aside class="editorial-aside">\n${rows}\n  </aside>`;
}

function renderManuscript(tok, wordCount) {
  // Left column: contact info. Right column: word count.
  // Convention: name on first line, word count right-aligned on same line,
  // then address lines below, left only.
  const wc = tok.wordcount === 'auto'
    ? `about ${wordCount.toLocaleString()} words`
    : tok.wordcount;

  const leftLines = [];
  if (tok.name)    leftLines.push(`<span class="ms-name">${escHtml(tok.name)}</span>`);
  if (tok.address) leftLines.push(escHtml(tok.address));
  if (tok.city)    leftLines.push(escHtml(tok.city));
  if (tok.phone)   leftLines.push(escHtml(tok.phone));
  if (tok.email)   leftLines.push(`<a href="mailto:${escAttr(tok.email)}" class="ms-email">${escHtml(tok.email)}</a>`);

  // First line gets the word count floating right
  const firstLine = leftLines.shift() || '';
  const restLines = leftLines.map(l => `<p class="ms-line">${l}</p>`).join('\n    ');

  return [
    `  <div class="manuscript-header" role="group" aria-label="Manuscript submission header">`,
    `    <p class="ms-line ms-first-line">`,
    `      <span class="ms-contact">${firstLine}</span>`,
    `      <span class="ms-wordcount" aria-label="Approximate word count">${escHtml(wc)}</span>`,
    `    </p>`,
    restLines ? `    ${restLines}` : '',
    `  </div>`,
  ].filter(l => l.trim() !== '').join('\n');
}

function renderEpigraph(tok, fnMap) {
  // Last non-blank line is treated as attribution if preceded by a blank line
  // or starts with — / - / ~ (em-dash convention)
  const lines = tok.content.split('\n');
  let attrLine = null;
  let quoteLines = lines;

  // Check if last content line looks like an attribution
  const lastContent = [...lines].reverse().find(l => l.trim() !== '');
  if (lastContent && /^[\u2014\-~]/.test(lastContent.trim())) {
    const lastIdx = lines.lastIndexOf(lastContent);
    attrLine  = lastContent.trim().replace(/^[\u2014\-~]\s*/, '');
    quoteLines = lines.slice(0, lastIdx);
  }

  const quoteHtml = quoteLines
    .filter(l => l.trim() !== '')
    .map(l => `    <p>${processInline(l, fnMap)}</p>`)
    .join('\n');
  const attrHtml = attrLine
    ? `\n    <footer class="epigraph-attribution"><cite>${processInline(attrLine, fnMap)}</cite></footer>`
    : '';

  return `  <blockquote class="epigraph">\n${quoteHtml}${attrHtml}\n  </blockquote>`;
}

function renderMono(tok, fnMap) {
  const rows = renderBlockLines(tok.content, fnMap, 'mono-line');
  return `  <div class="literary-mono" role="region" aria-label="Monospace text">\n${rows}\n  </div>`;
}

function renderSection(tok, fnMap) {
  return `  <h2 class="section-heading">${processInline(tok.content, fnMap)}</h2>`;
}

function renderSubsection(tok, fnMap) {
  return `  <h3 class="subsection-heading">${processInline(tok.content, fnMap)}</h3>`;
}

function renderCode(tok) {
  const lines = tok.content.split('\n');
  if (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();

  let lang = null;
  let codeLines = lines;
  const langHint = lines[0] && lines[0].match(/^(?:\/\/|#)\s*lang:\s*(\w+)/i);
  if (langHint) {
    lang = langHint[1].toLowerCase();
    codeLines = lines.slice(1);
    if (codeLines.length && codeLines[0].trim() === '') codeLines = codeLines.slice(1);
  }

  const usePrism = typeof Prism !== 'undefined' && lang;
  const grammar  = usePrism ? (Prism.languages[lang] || null) : null;

  let rowsHtml;
  if (usePrism && grammar) {
    const rawBlock = codeLines.join('\n');
    let highlighted;
    try { highlighted = Prism.highlight(rawBlock, grammar, lang); }
    catch(e) { highlighted = escHtml(rawBlock); }
    const hlLines = highlighted.split('\n');
    rowsHtml = hlLines.map((l, idx) =>
      `<span class="code-row"><span class="line-number" aria-hidden="true">${idx + 1}</span><code>${l || '\u200b'}</code></span>`
    ).join('\n');
  } else {
    rowsHtml = codeLines.map((l, idx) =>
      `<span class="code-row"><span class="line-number" aria-hidden="true">${idx + 1}</span><code>${escHtml(l) || '\u200b'}</code></span>`
    ).join('\n');
  }

  const langLabel = lang ? `<span class="code-lang-label" aria-hidden="true">${lang}</span>` : '';
  const langAttr  = lang ? ` aria-label="Code block: ${lang}"` : ' aria-label="Code block"';
  return `  <div class="code-block-wrap"${langAttr}>\n  ${langLabel}<button class="code-copy-btn" aria-label="Copy code" title="Copy code"><i class="fa-regular fa-copy" aria-hidden="true"></i></button>\n  <pre class="line-numbered-code" role="img">${rowsHtml}</pre>\n  </div>`;
}

function renderList(tok, fnMap) {
  const rootTag   = tok.type === 'bullet' ? 'ul' : 'ol';
  const rootClass = tok.type === 'alpha'  ? ' class="list-alpha"' : '';
  const rawLines  = tok.rawLines || tok.items;

  // Measure indent depth — tabs count as 2 spaces
  function depth(line) {
    const m = line.match(/^([ \t]*)/);
    if (!m) return 0;
    return m[1].replace(/\t/g, '  ').length;
  }

  // Recursively build nested list HTML from a flat array of raw lines.
  // Only processes lines whose depth >= baseDepth; stops when depth drops below it.
  function buildList(lines, baseDepth, pad) {
    const items = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      const d = depth(line);
      if (d < baseDepth) break; // belongs to a parent level

      // Collect all following lines that are strictly deeper (children)
      const children = [];
      let j = i + 1;
      while (j < lines.length) {
        if (!lines[j].trim()) { j++; continue; }
        if (depth(lines[j]) > d) { children.push(lines[j]); j++; }
        else break;
      }

      const text = line.trim();
      if (children.length) {
        const childDepth = depth(children.find(l => l.trim()) || children[0]);
        const childHtml  = buildList(children, childDepth, pad + '  ');
        items.push(`${pad}  <li>${processInline(text, fnMap)}\n${childHtml}\n${pad}  </li>`);
      } else {
        items.push(`${pad}  <li>${processInline(text, fnMap)}</li>`);
      }
      i = j;
    }
    return `${pad}<${rootTag}${rootClass}>\n${items.join('\n')}\n${pad}</${rootTag}>`;
  }

  const validLines = rawLines.filter(l => l.trim());
  if (!validLines.length) return '';
  const minDepth = validLines.reduce((min, l) => Math.min(min, depth(l)), Infinity);
  return '  ' + buildList(rawLines, minDepth, '  ');
}

function renderImage(tok) {
  const src     = tok.source || '';
  const altText = tok.alt || '';
  const hasAlt  = altText.trim() !== '';
  const warnAttr = !hasAlt ? ' data-a11y-warn="missing-alt"' : '';
  const imgAttr = src
    ? `src="${escAttr(src)}" alt="${escAttr(altText)}"${!hasAlt ? ' role="presentation"' : ''} class="editorial-image"`
    : `src="" alt="" role="presentation" class="editorial-image editorial-image--placeholder"`;

  let html = `  <figure class="editorial-figure"${warnAttr}>\n    <img ${imgAttr} />\n`;
  if (tok.caption || tok.credit) {
    html += `    <figcaption class="editorial-caption">`;
    if (tok.caption) html += processInline(tok.caption);
    if (tok.credit) {
      // Replace any URLs embedded in the credit string with hyperlinks
      const creditHtml = escHtml(tok.credit).replace(
        /https?:\/\/[^\s<>"')]+|www\.[^\s<>"')]+/gi,
        url => {
          const href = url.startsWith('www.') ? 'https://' + url : url;
          return `<a href="${escAttr(href)}" target="_blank" rel="noopener" class="caption-credit-link">${url}</a>`;
        }
      );
      html += ` <span class="caption-credit">${creditHtml}</span>`;
    }
    html += `</figcaption>\n`;
  }
  html += `  </figure>`;
  return html;
}

function renderCitations(tok, fnMap) {
  // Build reverse map: number → ref text
  const reverseMap = {};
  for (const [ref, num] of Object.entries(fnMap)) reverseMap[num] = ref;

  // Parse citation lines: "1. Citation text" or "1 Citation text" or just text in order
  const entries = [];
  let autoIdx = 1;

  for (const line of tok.lines) {
    const t = line.trim();
    if (!t) continue;
    const numbered = t.match(/^(\d+)[.\)]\s+([\s\S]+)$/);
    if (numbered) {
      entries.push({ num: numbered[1], text: numbered[2] });
    } else {
      entries.push({ num: String(autoIdx++), text: t });
    }
  }

  if (!entries.length) return '';

  const items = entries.map(e =>
    `    <li id="fn-${e.num}" class="citation-entry">` +
    `${processInline(e.text)} ` +
    `<a href="#fnref-${e.num}" class="fn-return" aria-label="Return to footnote ${e.num} reference">↩</a>` +
    `</li>`
  ).join('\n');

  const heading = tok.title || 'Notes';
  return `  <section class="citations-section" aria-label="${escAttr(heading)}">\n    <p class="citations-heading" role="heading" aria-level="2">${escHtml(heading)}</p>\n    <ol class="citations-list">\n${items}\n    </ol>\n  </section>`;
}

// ── Image alt-text warning in output pane ────────────────────────────────────

function checkAltWarnings(html) {
  const hasWarn = html.includes('data-a11y-warn="missing-alt"');
  const existing = document.getElementById('altWarning');
  if (hasWarn && !existing) {
    const warn = document.createElement('div');
    warn.id = 'altWarning';
    warn.className = 'alt-warning';
    warn.innerHTML = '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> One or more images are missing alt text — add an <code>alt:</code> field for accessibility.';
    const anchor = document.getElementById('editorActionBar');
    if (anchor) anchor.insertAdjacentElement('beforebegin', warn);
  } else if (!hasWarn && existing) {
    existing.remove();
  }
}

// ── Core converter ────────────────────────────────────────────────────────────

function convertText() {
  const raw = inputText.value;
  if (!raw.trim()) {
    outputHtml.value = '';
    livePreview.innerHTML = '';
    checkAltWarnings('');
    return;
  }

  const dropcap = getRadio('dropcap');
  const indent  = getRadio('indent');
  const endhr   = getRadio('endhr');
  const spacing = getRadio('linespacing');

  const tokens = tokenise(raw);
  const fnMap     = buildFnMap(tokens);
  const wordCount = countBodyWords(tokens);

  const headerTypes = ['title', 'subtitle', 'byline', 'manuscript'];
  const headerToks  = tokens.filter(t => headerTypes.includes(t.type));
  const bodyToks    = tokens.filter(t => !headerTypes.includes(t.type));

  let paraIndex = 0;
  let nextAfterBreak = false;
  const paraMap = [];
  const blockTypes = new Set(['pullquote','aside','epigraph','mono','code','image','bullet','num','alpha','section','subsection','citations','manuscript']);
  let afterBlock = false;

  for (const tok of bodyToks) {
    if (tok.type === 'break') {
      nextAfterBreak = true;
      afterBlock = false;
    } else if (tok.type === 'para') {
      paraMap.push({
        afterBreak: nextAfterBreak || paraIndex === 0,
        isFirst:    paraIndex === 0,
        afterBlock: afterBlock && !nextAfterBreak,
      });
      paraIndex++;
      nextAfterBreak = false;
      afterBlock = false;
    } else if (blockTypes.has(tok.type)) {
      afterBlock = true;
    }
  }

  const lsClass = spacing === '1' ? ' ls-1' : spacing === '2' ? ' ls-2' : ' ls-1-5';
  const out = [];
  const hasTitle   = headerToks.some(t => t.type === 'title');
  const labelAttr  = hasTitle ? ' aria-labelledby="story-title"' : '';
  out.push(`<article class="story-content${lsClass}"${labelAttr}>`);

  // subtitle and byline are NOT headings — they don't belong in the document outline
  // manuscript renders before everything else (standard submission format)
  const msTok = headerToks.find(t => t.type === 'manuscript');
  if (msTok) out.push(renderManuscript(msTok, wordCount));

  headerToks.filter(t => t.type !== 'manuscript').forEach(t => {
    const brokenContent = t.content.split('\n').map(l => processInline(l, fnMap)).join('<br />');
    if (t.type === 'title') {
      out.push(`  <h1 class="story-title" id="story-title">${brokenContent}</h1>`);
    } else if (t.type === 'subtitle') {
      out.push(`  <p class="story-subtitle">${brokenContent}</p>`);
    } else if (t.type === 'byline') {
      out.push(`  <p class="story-byline" role="doc-byline">${brokenContent}</p>`);
    }
  });

  if (headerToks.length) out.push(`  <hr class="title-rule" aria-hidden="true" />`);

  let pIdx = 0;
  for (const tok of bodyToks) {
    if (tok.type === 'break')    { out.push(`  <hr class="fleuron-break" aria-label="Section break" />`); continue; }
    if (tok.type === 'ending')   {
      if (tok.content) out.push(`  <p class="story-end">${processInline(tok.content, fnMap)}</p>`);
      if (endhr === 'yes') out.push(`  <hr class="fleuron-end" aria-hidden="true" />`);
      continue;
    }
    if (tok.type === 'pullquote')  { out.push(renderPullquote(tok, fnMap));  continue; }
    if (tok.type === 'aside')      { out.push(renderAside(tok, fnMap));      continue; }
    if (tok.type === 'epigraph')   { out.push(renderEpigraph(tok, fnMap));   continue; }
    if (tok.type === 'mono')       { out.push(renderMono(tok, fnMap));       continue; }
    if (tok.type === 'code')       { out.push(renderCode(tok));              continue; }
    if (tok.type === 'section')    { out.push(renderSection(tok, fnMap));    continue; }
    if (tok.type === 'subsection') { out.push(renderSubsection(tok, fnMap)); continue; }
    if (tok.type === 'citations')  { out.push(renderCitations(tok, fnMap));  continue; }
    if (['bullet','num','alpha'].includes(tok.type)) { out.push(renderList(tok, fnMap)); continue; }
    if (tok.type === 'image')      { out.push(renderImage(tok));             continue; }

    const { afterBreak, isFirst, afterBlock } = paraMap[pIdx++];
    const content = processInline(tok.content, fnMap);
    const classes = [];

    if (dropcap === 'first' && isFirst) classes.push('dropcap-paragraph');
    else if (dropcap === 'sections' && afterBreak) classes.push('dropcap-paragraph');

    const hasDrop = classes.includes('dropcap-paragraph');
    if (indent === 'none') {
      if (!hasDrop) classes.push('no-indent');
    } else if (indent === 'all') {
      if (!hasDrop && afterBlock) classes.push('continues');
    } else if (indent === 'section-only') {
      if (!hasDrop && (isFirst || afterBreak)) classes.push('no-indent');
      else if (!hasDrop && afterBlock) classes.push('continues');
    }

    const classAttr = classes.length ? ` class="${classes.join(' ')}"` : '';
    out.push(`  <p${classAttr}>${content}</p>`);
  }

  out.push(`</article>`);

  const html = out.join('\n');
  outputHtml.value = html;
  checkAltWarnings(html);
  updatePreview(html, lsClass);
}

// ── Live Preview Sync ─────────────────────────────────────────────────────────

function updatePreview(html, lsClass) {
  livePreview.className = 'story-content preview-body' + lsClass;
  livePreview.innerHTML = html
    .replace(/^<article class="story-content[^"]*">\n/, '')
    .replace(/\n<\/article>$/, '');
  wireCopyButtons(livePreview);
}

// ── Copy/Download helpers ─────────────────────────────────────────────────────

function getCleanHtml() {
  return outputHtml.value
    .replace(/^<article class="story-content[^"]*">\n/, '')
    .replace(/\n<\/article>$/, '');
}

// ── Input Debounce ────────────────────────────────────────────────────────────

let debounceTimer;
function scheduleConvert() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(convertText, 300);
}

inputText.addEventListener('input', scheduleConvert);
document.querySelectorAll('input[type="radio"]').forEach(r => r.addEventListener('change', convertText));

// ── Clear ─────────────────────────────────────────────────────────────────────

// clearBtn wired in setupViewModals()

// ── Clipboard / Download ──────────────────────────────────────────────────────

async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`${label} copied!`);
  } catch {
    outputHtml.select();
    showToast('Press Ctrl+C / ⌘+C to copy manually');
  }
}

// Copy/download now handled by View modals — see setupViewModals()

function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// Download helpers used by View modals
function getStandaloneHtml() {
  const title = document.querySelector('.story-title')?.textContent?.trim() || 'Formatted Story';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css">
  <style>
${BASE_CSS_TEXT}
  </style>
</head>
<body>
${outputHtml.value}
</body>
</html>`;
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// ==========================================================================
//  Toolbar
// ==========================================================================

// insertTextWithUndo — uses execCommand so browser undo (Ctrl+Z) works.
// Falls back to direct .value assignment if execCommand is unavailable.
function insertTextWithUndo(textarea, text) {
  textarea.focus();
  // execCommand is deprecated but remains the only way to integrate with
  // the browser's native undo stack in a plain textarea.
  const ok = document.execCommand('insertText', false, text);
  if (!ok) {
    // Fallback: direct assignment (no undo support)
    const s = textarea.selectionStart;
    const e = textarea.selectionEnd;
    const v = textarea.value;
    textarea.value = v.substring(0, s) + text + v.substring(e);
    textarea.setSelectionRange(s + text.length, s + text.length);
  }
}

// replaceSelectionWithUndo — replaces start..end with text, with undo support.
function replaceRangeWithUndo(textarea, start, end, text) {
  textarea.focus();
  textarea.setSelectionRange(start, end);
  const ok = document.execCommand('insertText', false, text);
  if (!ok) {
    const v = textarea.value;
    textarea.value = v.substring(0, start) + text + v.substring(end);
    textarea.setSelectionRange(start + text.length, start + text.length);
  }
}

function wrapSelection(openTag, closeTag, blockMode = false) {
  const start = inputText.selectionStart;
  const end   = inputText.selectionEnd;
  const sel   = inputText.value.substring(start, end);

  if (blockMode) {
    const before = inputText.value.substring(0, start);
    const after  = inputText.value.substring(end);
    const pre    = (before.length > 0 && !before.endsWith('\n')) ? '\n' : '';
    const post   = (after.length  > 0 && !after.startsWith('\n')) ? '\n' : '';
    const inner  = sel || 'Content here';
    const replacement = `${pre}${openTag}\n${inner}\n${closeTag}${post}`;
    // Expand selection to include the pre/post newlines so execCommand replaces correctly
    inputText.setSelectionRange(start - pre.length < 0 ? 0 : start, end);
    replaceRangeWithUndo(inputText, Math.max(0, start - (pre ? 0 : 0)), end, replacement);
    // Re-select the inner content for immediate editing
    const newSelStart = start + pre.length + openTag.length + 1;
    inputText.setSelectionRange(newSelStart, newSelStart + inner.length);
  } else {
    const inner = sel || 'text';
    const replacement = `${openTag}${inner}${closeTag}`;
    replaceRangeWithUndo(inputText, start, end, replacement);
    const newSelStart = start + openTag.length;
    inputText.setSelectionRange(newSelStart, newSelStart + inner.length);
  }
  inputText.focus();
  scheduleConvert();
}

function insertList(type) {
  const start  = inputText.selectionStart;
  const end    = inputText.selectionEnd;
  const sel    = inputText.value.substring(start, end).trim();
  const items  = sel ? sel.split('\n').map(l => l.trim()).filter(Boolean) : ['Item one', 'Item two', 'Item three'];
  const inner  = items.join('\n');
  const before = inputText.value.substring(0, start);
  const after  = inputText.value.substring(end);
  const pre    = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
  const post   = after.length  > 0 && !after.startsWith('\n') ? '\n' : '';
  const replacement = `${pre}[${type}]\n${inner}\n[/${type}]${post}`;
  replaceRangeWithUndo(inputText, start, end, replacement);
  const selStart = before.length + pre.length + `[${type}]\n`.length;
  inputText.setSelectionRange(selStart, selStart + inner.length);
  inputText.focus();
  scheduleConvert();
}

function insertFn() {
  const start   = inputText.selectionStart;
  const end     = inputText.selectionEnd;
  const sel     = inputText.value.substring(start, end).trim();
  // Count existing [fn] tags to suggest next number
  const existing = (inputText.value.match(/\[fn\]/gi) || []).length + 1;
  const ref     = sel || String(existing);
  const tag     = `[fn]${ref}[/fn]`;
  const before  = inputText.value.substring(0, start);
  const after   = inputText.value.substring(end);
  replaceRangeWithUndo(inputText, start, end, tag);
  inputText.setSelectionRange(before.length + tag.length, before.length + tag.length);
  inputText.focus();
  scheduleConvert();
}

function indentLines(direction) {
  const start  = inputText.selectionStart;
  const end    = inputText.selectionEnd;
  const val    = inputText.value;

  // Expand selection to full lines
  const lineStart = val.lastIndexOf('\n', start - 1) + 1;
  const lineEnd   = val.indexOf('\n', end);
  const blockEnd  = lineEnd === -1 ? val.length : lineEnd;
  const block     = val.substring(lineStart, blockEnd);

  const modified = block.split('\n').map(line => {
    if (direction === 'in') return '  ' + line;
    // dedent: remove up to 2 leading spaces (one indent level)
    return line.replace(/^  /, '');
  }).join('\n');

  inputText.value = val.substring(0, lineStart) + modified + val.substring(blockEnd);
  inputText.setSelectionRange(lineStart, lineStart + modified.length);
  inputText.focus();
  scheduleConvert();
}

function insertCitations() {
  const start  = inputText.selectionStart;
  const before = inputText.value.substring(0, start);
  const after  = inputText.value.substring(start);
  const pre    = (before.length > 0 && !before.endsWith('\n')) ? '\n' : '';
  const post   = (after.length  > 0 && !after.startsWith('\n')) ? '\n' : '';
  const block  = `${pre}[citations]\nheading: Notes\n1. \n[/citations]${post}`;
  replaceRangeWithUndo(inputText, start, start, block);
  // Place cursor after "1. " ready to type
  const cursorPos = before.length + pre.length + '[citations]\nheading: Notes\n1. '.length;
  inputText.setSelectionRange(cursorPos, cursorPos);
  inputText.focus();
  scheduleConvert();
}

const TOOLBAR_BUTTONS = [
  { label: 'Manuscript', title: 'Insert [manuscript] submission header', action: () => openManuscriptModal() },
  { label: 'Title',      title: 'Insert [title] block',      action: () => wrapSelection('[title]',      '[/title]',      true) },
  { label: 'Subtitle',   title: 'Insert [subtitle] block',   action: () => wrapSelection('[subtitle]',   '[/subtitle]',   true) },
  { label: 'Byline',     title: 'Insert [byline] block',     action: () => wrapSelection('[byline]',     '[/byline]',     true) },
  { label: 'Section',    title: 'Insert [section] heading',    action: () => wrapSelection('[section]',    '[/section]',    true) },
  { label: 'Subsection', title: 'Insert [subsection] heading', action: () => wrapSelection('[subsection]', '[/subsection]', true) },
  { label: 'B',          title: 'Bold [b]',                  action: () => wrapSelection('[b]', '[/b]'),  bold: true },
  { label: 'I',          title: 'Italic [i]',                action: () => wrapSelection('[i]', '[/i]'),  italic: true },
  { label: '⇗ Link',     title: 'Insert [link]',             action: () => openLinkModal() },
  { label: 'Footnote',   title: 'Insert [fn] footnote ref',  action: () => insertFn() },
  { label: 'Pullquote',  title: 'Insert [pullquote] block',  action: () => wrapSelection('[pullquote]',  '[/pullquote]',  true) },
  { label: 'Aside',      title: 'Insert [aside] block',      action: () => wrapSelection('[aside]',      '[/aside]',      true) },
  { label: 'Epigraph',   title: 'Insert [epigraph] block',   action: () => wrapSelection('[epigraph]',   '[/epigraph]',   true) },
  { label: 'Mono',       title: 'Insert [mono] block',       action: () => wrapSelection('[mono]',       '[/mono]',       true) },
  { label: 'Code',       title: 'Insert [code] block',       action: () => wrapSelection('[code]',       '[/code]',       true) },
  { label: '⊞ Image',   title: 'Insert [image] block',      action: () => openImageModal() },
  { label: '• List',     title: 'Insert [bullet] list',      action: () => insertList('bullet') },
  { label: '1. List',    title: 'Insert [num] list',         action: () => insertList('num') },
  { label: 'a. List',    title: 'Insert [alpha] list',       action: () => insertList('alpha') },
  { label: '→ Indent',   title: 'Indent selected lines (nest list items)', action: () => indentLines('in') },
  { label: '← Dedent',   title: 'Dedent selected lines',    action: () => indentLines('out') },
  { label: 'Citations',  title: 'Insert [citations] block',  action: () => insertCitations() },
  { label: '❦ End',      title: 'Insert [end] block',        action: () => wrapSelection('[end]',        '[/end]',        true) },
];

function buildToolbar() {
  const toolbar = document.getElementById('editorToolbar');
  if (!toolbar) return;
  TOOLBAR_BUTTONS.forEach(def => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toolbar-btn';
    btn.textContent = def.label;
    btn.title = def.title;
    if (def.bold)   btn.style.fontWeight = '700';
    if (def.italic) btn.style.fontStyle  = 'italic';
    btn.addEventListener('click', def.action);
    toolbar.appendChild(btn);
  });
}

// ==========================================================================
//  Link Modal
// ==========================================================================

function openLinkModal() {
  const selStart = inputText.selectionStart;
  const selEnd   = inputText.selectionEnd;
  const selText  = inputText.value.substring(selStart, selEnd);
  const modal    = document.getElementById('linkModal');
  document.getElementById('linkText').value = selText || '';
  document.getElementById('linkUrl').value  = '';
  modal.removeAttribute('hidden');
  document.getElementById('linkText').focus();
  modal._selStart = selStart;
  modal._selEnd   = selEnd;
}

function closeLinkModal() {
  document.getElementById('linkModal').setAttribute('hidden', '');
  inputText.focus();
}

function confirmLink() {
  const modal = document.getElementById('linkModal');
  const text  = document.getElementById('linkText').value.trim();
  const url   = document.getElementById('linkUrl').value.trim();
  if (!url) { showToast('Please enter a URL'); return; }
  const displayText = text || url;
  const tag  = `[link]${displayText} -> ${url}[/link]`;
  const before = inputText.value.substring(0, modal._selStart);
  const after  = inputText.value.substring(modal._selEnd);
  inputText.value = before + tag + after;
  inputText.setSelectionRange(before.length + tag.length, before.length + tag.length);
  closeLinkModal();
  scheduleConvert();
}

// ==========================================================================
//  Image Modal
// ==========================================================================

function openImageModal() {
  ['imgSource','imgAlt','imgCaption','imgCredit'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('imageModal').removeAttribute('hidden');
  document.getElementById('imgSource').focus();
}

function closeImageModal() {
  document.getElementById('imageModal').setAttribute('hidden', '');
  inputText.focus();
}

function confirmImage() {
  const source  = document.getElementById('imgSource').value.trim();
  const alt     = document.getElementById('imgAlt').value.trim();
  const caption = document.getElementById('imgCaption').value.trim();
  const credit  = document.getElementById('imgCredit').value.trim();
  if (!source) { showToast('Please enter an image source'); return; }
  const lines = ['[image]', `source: ${source}`];
  if (alt)     lines.push(`alt: ${alt}`);
  if (caption) lines.push(`caption: ${caption}`);
  if (credit)  lines.push(`credit: ${credit}`);
  lines.push('[/image]');
  const tag    = lines.join('\n');
  const start  = inputText.selectionStart;
  const before = inputText.value.substring(0, start);
  const after  = inputText.value.substring(start);
  const pre    = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
  const post   = after.length  > 0 && !after.startsWith('\n') ? '\n' : '';
  inputText.value = before + pre + tag + post + after;
  closeImageModal();
  scheduleConvert();
}

// ==========================================================================
//  Modal wiring
// ==========================================================================

function openManuscriptModal() {
  ['msName','msAddress','msCity','msPhone','msEmail','msWordcount'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('msWordcount').placeholder = 'auto (calculated from text)';
  document.getElementById('manuscriptModal').removeAttribute('hidden');
  document.getElementById('msName').focus();
}

function closeManuscriptModal() {
  document.getElementById('manuscriptModal').setAttribute('hidden', '');
  inputText.focus();
}

function confirmManuscript() {
  const name      = document.getElementById('msName').value.trim();
  const address   = document.getElementById('msAddress').value.trim();
  const city      = document.getElementById('msCity').value.trim();
  const phone     = document.getElementById('msPhone').value.trim();
  const email     = document.getElementById('msEmail').value.trim();
  const wordcount = document.getElementById('msWordcount').value.trim();

  if (!name && !address) { showToast('Enter at least a name or address'); return; }

  const lines = ['[manuscript]'];
  if (name)      lines.push(`name: ${name}`);
  if (address)   lines.push(`address: ${address}`);
  if (city)      lines.push(`city: ${city}`);
  if (phone)     lines.push(`phone: ${phone}`);
  if (email)     lines.push(`email: ${email}`);
  if (wordcount) lines.push(`wordcount: ${wordcount}`);
  lines.push('[/manuscript]');

  const tag    = lines.join('\n');
  const start  = inputText.selectionStart;
  const before = inputText.value.substring(0, start);
  const after  = inputText.value.substring(start);
  const pre    = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
  const post   = after.length  > 0 && !after.startsWith('\n') ? '\n' : '';
  inputText.value = before + pre + tag + post + after;
  closeManuscriptModal();
  scheduleConvert();
}

function setupModals() {
  const wire = (closeId, cancelId, confirmId, closeFn, confirmFn, modalId) => {
    document.getElementById(closeId).addEventListener('click', closeFn);
    if (cancelId) document.getElementById(cancelId).addEventListener('click', closeFn);
    document.getElementById(confirmId).addEventListener('click', confirmFn);
    document.getElementById(modalId).addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmFn();
      if (e.key === 'Escape') closeFn();
    });
    document.getElementById(modalId).addEventListener('click', e => {
      if (e.target === e.currentTarget) closeFn();
    });
  };

  wire('linkModalClose', 'linkModalCancel', 'linkModalConfirm', closeLinkModal, confirmLink, 'linkModal');
  wire('manuscriptModalClose', 'manuscriptModalCancel', 'manuscriptModalConfirm', closeManuscriptModal, confirmManuscript, 'manuscriptModal');
  wire('imageModalClose', 'imageModalCancel', 'imageModalConfirm', closeImageModal, confirmImage, 'imageModal');
}

// ==========================================================================
//  Preview Expand Modal
// ==========================================================================

function setupPreviewModal() {
  const expandBtn = document.getElementById('previewExpandBtn');
  const modal     = document.getElementById('previewModal');
  const closeBtn  = document.getElementById('previewModalClose');
  const modalBody = document.getElementById('previewModalBody');

  function open() {
    modalBody.innerHTML = livePreview.innerHTML;
    modalBody.className = livePreview.className + ' preview-modal-body';
    modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
    wireCopyButtons(modalBody);
    wireFootnoteLinks(modalBody);
  }

  function close() {
    modal.setAttribute('hidden', '');
    document.body.style.overflow = '';
    expandBtn.focus();
  }

  expandBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.hasAttribute('hidden')) close();
  });
}

// Intercept footnote anchor/return clicks inside a scrollable container
// so they scroll within the container instead of the background page.
function wireFootnoteLinks(container) {
  container.querySelectorAll('a.fn-ref, a.fn-return').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const targetId = link.getAttribute('href')?.replace('#', '');
      if (!targetId) return;
      const target = container.querySelector('#' + CSS.escape(targetId));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });
}

function wireCopyButtons(container) {
  container.querySelectorAll('.code-copy-btn').forEach(btn => {
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.addEventListener('click', () => {
      const pre  = fresh.closest('.code-block-wrap').querySelector('pre');
      const text = Array.from(pre.querySelectorAll('.code-row')).map(r => r.querySelector('code').textContent).join('\n');
      navigator.clipboard.writeText(text).then(() => {
        fresh.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
        setTimeout(() => { fresh.innerHTML = '<i class="fa-regular fa-copy" aria-hidden="true"></i>'; }, 1800);
      }).catch(() => showToast('Copy failed'));
    });
  });
}

// ==========================================================================
//  View Modals — Standalone, Embed, Base CSS
// ==========================================================================

function openViewModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  // Populate content
  if (modalId === 'viewStandaloneModal') {
    document.getElementById('viewStandaloneContent').value = getStandaloneHtml();
  } else if (modalId === 'viewEmbedModal') {
    document.getElementById('viewEmbedContent').value = outputHtml.value;
  } else if (modalId === 'viewCssModal') {
    document.getElementById('viewCssContent').value = BASE_CSS_TEXT;
  }
  modal.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
  modal.querySelector('.modal-close')?.focus();
}

function closeViewModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.setAttribute('hidden', '');
  document.body.style.overflow = '';
}

function setupViewModals() {
  const modals = [
    { id: 'viewStandaloneModal', copyId: 'viewStandaloneCopy',    dlId: 'viewStandaloneDl',    getContent: () => document.getElementById('viewStandaloneContent').value, filename: 'story-standalone.html', dlType: 'text/html' },
    { id: 'viewEmbedModal',      copyId: 'viewEmbedCopy',         dlId: 'viewEmbedDl',         getContent: () => document.getElementById('viewEmbedContent').value,      filename: 'story-embed.html',      dlType: 'text/html' },
    { id: 'viewCssModal',        copyId: 'viewCssCopy',           dlId: 'viewCssDl',           getContent: () => document.getElementById('viewCssContent').value,         filename: 'story-base.css',        dlType: 'text/css'  },
  ];

  modals.forEach(({ id, copyId, dlId, getContent, filename, dlType }) => {
    const modal = document.getElementById(id);
    if (!modal) return;

    modal.querySelector('.modal-close')?.addEventListener('click', () => closeViewModal(id));
    modal.addEventListener('click', e => { if (e.target === modal) closeViewModal(id); });
    modal.addEventListener('keydown', e => { if (e.key === 'Escape') closeViewModal(id); });

    document.getElementById(copyId)?.addEventListener('click', () => {
      navigator.clipboard.writeText(getContent()).then(() => showToast('Copied!')).catch(() => showToast('Copy failed'));
    });

    document.getElementById(dlId)?.addEventListener('click', () => {
      const blob = new Blob([getContent()], { type: dlType + ';charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    });
  });

  // Action bar buttons
  document.getElementById('viewStandaloneBtn')?.addEventListener('click', () => {
    if (!outputHtml.value.trim()) { showToast('Nothing to view — type some text first'); return; }
    openViewModal('viewStandaloneModal');
  });
  document.getElementById('viewEmbedBtn')?.addEventListener('click', () => {
    if (!outputHtml.value.trim()) { showToast('Nothing to view — type some text first'); return; }
    openViewModal('viewEmbedModal');
  });
  document.getElementById('viewCssBtn')?.addEventListener('click', () => openViewModal('viewCssModal'));
  document.getElementById('clearBtn')?.addEventListener('click', () => {
    inputText.value = '';
    outputHtml.value = '';
    livePreview.innerHTML = '';
    checkAltWarnings('');
    inputText.focus();
  });
}

// ==========================================================================
//  Init
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  buildToolbar();
  setupModals();
  setupPreviewModal();
  setupViewModals();
});

// ==========================================================================
//  Downloadable Base CSS
// ==========================================================================

const BASE_CSS_TEXT = `/* ==========================================================================
   Written & Formatted — Base Stylesheet
   NOTE: For [code] syntax highlighting, also include Prism.js:
   <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css" />
   <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"><\/script>
   ========================================================================== */

.story-content {
  max-width: 660px;
  margin: 0 auto;
  padding: 40px 20px;
  font-family: 'EB Garamond', Georgia, serif;
  font-size: 1.15rem;
  line-height: 1.65;
  color: #2c3e50;
}

.story-content.ls-1   { line-height: 1.4; }
.story-content.ls-1-5 { line-height: 1.65; }
.story-content.ls-2   { line-height: 2.0; }

/* ── Header ── */
.story-content h1.story-title {
  text-align: center; font-size: 2.25rem; font-weight: 600;
  line-height: 1.2; margin: 0 0 0.25em 0;
}
.story-content p.story-subtitle {
  text-align: center; font-size: 1.35rem; font-weight: 400;
  font-style: italic; color: #627284; margin: 0 0 0.5em 0; line-height: 1.3;
}
.story-content p.story-byline {
  text-align: center; font-size: 1rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.05em; color: #627284; margin: 0 0 1.5em 0;
}
.story-content hr.title-rule {
  border: none; border-top: 1px solid #efebe4;
  margin: 0 auto 2.5rem auto; width: 80px;
}

/* ── Section heading ── */
.story-content h2.section-heading {
  font-size: 1.25rem; font-weight: 600; margin: 2.5rem 0 0.75rem 0;
  color: #2c3e50; letter-spacing: 0.01em;
}

/* ── Body paragraphs ── */
.story-content p {
  margin: 0 0 0.5em 0; text-align: justify; text-justify: inter-word;
}
.story-content p + p { text-indent: 1.5rem; }
.story-content p.no-indent { text-indent: 0 !important; }
.story-content p.continues  { text-indent: 1.4rem; }
.story-content p.dropcap-paragraph { text-indent: 0; }
.story-content p.dropcap-paragraph::first-letter {
  font-size: 4.5rem; float: left; line-height: 0.75;
  margin: 0.1em 0.1rem 0 0; color: #d35400;
}

/* ── Epigraph ── */
.story-content blockquote.epigraph {
  margin: 2rem 2rem 2rem 3rem;
  font-style: italic; color: #627284;
  border: none; padding: 0;
}
.story-content .epigraph p { text-indent: 0 !important; margin-bottom: 0.4em; }
.story-content .epigraph footer.epigraph-attribution {
  font-size: 0.9rem; font-style: normal; margin-top: 0.5em;
}
.story-content .epigraph cite { font-style: italic; }

/* ── Pull quote ── */
.story-content aside.pullquote {
  border-left: 4px solid #d35400;
  padding: 0.5rem 1.5rem;
  margin: 2rem 0;
  font-size: 1.2rem;
  font-style: italic;
  color: #3a3a3a;
}
.story-content .pullquote p { text-indent: 0 !important; margin-bottom: 0.4em; }

/* ── Editorial aside ── */
.story-content aside.editorial-aside {
  border: 1px solid #efebe4;
  border-radius: 6px;
  padding: 1rem 1.25rem;
  margin: 2rem 0;
  font-size: 0.95rem;
  color: #4a4a4a;
}
.story-content .editorial-aside p { text-indent: 0 !important; margin-bottom: 0.4em; }

/* ── Mono ── */
.story-content .literary-mono {
  font-family: 'Source Code Pro', Consolas, monospace;
  font-size: 0.9rem; margin: 2rem 0;
}
.story-content .literary-mono p {
  text-indent: 0 !important; padding-left: 1.4rem;
  margin-bottom: 0.65em; line-height: 1.6;
}
.story-content .literary-mono p:last-child { margin-bottom: 0; }

/* ── Code ── */
.story-content .code-block-wrap {
  background: #1e1e1e; border-radius: 8px; margin: 2rem 0; overflow: hidden; position: relative;
}
.story-content .code-lang-label {
  display: inline-block; font-family: monospace; font-size: 0.68rem;
  font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  color: #888; padding: 6px 0 4px 1rem;
}
.story-content pre.line-numbered-code {
  display: flex; flex-direction: column; background: transparent;
  color: #e0e0e0; padding: 0.5rem 0 1rem 0; margin: 0;
  overflow-x: auto; white-space: pre; text-indent: 0;
}
.story-content .code-row { display: flex; align-items: baseline; min-height: 1.5em; line-height: 1.5; }
.story-content .line-number {
  flex-shrink: 0; width: 42px; text-align: right; padding-right: 12px;
  color: #555; user-select: none; border-right: 1px solid #333;
  margin-right: 12px; font-family: monospace; font-size: 0.78rem; line-height: 1.5;
}
.story-content .code-row code {
  font-family: 'Source Code Pro', Consolas, monospace;
  font-size: 0.85rem; white-space: pre; color: #e0e0e0;
  background: transparent; padding: 0;
}

/* ── Lists ── */
.story-content ul, .story-content ol {
  margin: 1.5rem 0; padding-left: 2rem; text-indent: 0;
}
.story-content ol.list-alpha { list-style-type: lower-alpha; }
.story-content li { margin-bottom: 6px; }

/* ── Image ── */
.story-content figure.editorial-figure { margin: 2.5rem 0; display: flex; flex-direction: column; gap: 8px; }
.story-content .editorial-image { width: 100%; height: auto; border-radius: 8px; display: block; }
.story-content .editorial-caption { font-size: 0.88rem; color: #627284; line-height: 1.4; padding: 0 4px; }
.story-content .caption-credit { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: #d35400; margin-left: 6px; }

/* ── Section break ── */
.story-content hr.fleuron-break {
  border: none; height: 1px; background: #efebe4;
  width: 33%; margin: 3rem auto; position: relative; overflow: visible;
}
.story-content hr.fleuron-break::after {
  content: "✦"; font-size: 0.6rem; color: #d35400; background-color: #fff;
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 0 1rem;
}

/* ── End marker ── */
.story-content p.story-end { text-align: center; font-style: italic; color: #627284; margin: 3rem 0; text-indent: 0 !important; }
.story-content hr.fleuron-end {
  border: none; height: 1px; background: #efebe4;
  width: 10%; margin: 5rem auto; position: relative; overflow: visible;
}
.story-content hr.fleuron-end::after {
  content: "✦ ✦ ✦"; font-size: 0.6rem; letter-spacing: 0.5em; color: #d35400;
  background-color: #fff; position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%); padding: 0 1rem; white-space: nowrap;
}

/* ── Footnotes ── */
.story-content a.fn-ref {
  text-decoration: none; color: #d35400; font-size: 0.75em;
  vertical-align: super; line-height: 0;
}
.story-content a.fn-ref:hover { text-decoration: underline; }
.story-content .citations-section {
  margin-top: 3rem; border-top: 1px solid #efebe4; padding-top: 1.5rem;
}
.story-content .citations-heading {
  font-size: 0.9rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: #627284; margin: 0 0 1rem 0;
}
.story-content .citations-list { padding-left: 1.5rem; margin: 0; }
.story-content .citation-entry {
  font-size: 0.9rem; color: #4a4a4a; margin-bottom: 0.5em; line-height: 1.5;
}
.story-content a.fn-return {
  font-size: 0.8rem; color: #d35400; text-decoration: none; margin-left: 4px;
}
.story-content a.fn-return:hover { text-decoration: underline; }
`;

downloadCssBtn.addEventListener('click', () => {
  const blob = new Blob([BASE_CSS_TEXT], { type: 'text/css;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'story-base.css';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
});
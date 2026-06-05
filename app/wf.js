/* ==========================================================================
   Written & Formatted
   wf.js
   by Tim Samoff
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
const helpBtn          = document.getElementById('helpBtn');
const toast            = document.getElementById('toast');
const rootEl           = document.documentElement;

// ── localStorage Autosave ─────────────────────────────────────────────────────

const AUTOSAVE_KEY = 'written-formatter-autosave';

let lastAutosaveContent = '';

function autosaveToLocalStorage() {
  const text = inputText.value;
  if (text.trim() && text !== lastAutosaveContent) {
    localStorage.setItem(AUTOSAVE_KEY, text);
    lastAutosaveContent = text;
    showToast('Auto-saved');
  }
}

function loadFromLocalStorage() {
  const saved = localStorage.getItem(AUTOSAVE_KEY);
  if (saved && saved.trim()) {
    inputText.value = saved;
    lastAutosaveContent = saved;
    scheduleConvert();
    showToast('Restored previously saved text');
  }
}

// ── Theme ─────────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  rootEl.setAttribute('data-theme', theme);
  const isDark = theme === 'dark';
  themeToggle.textContent = isDark ? '☀' : '☽';
  themeToggle.setAttribute('aria-label', `Toggle theme: currently ${isDark ? 'dark' : 'light'} mode`);
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
  str = str.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>');
  str = str.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<em>$1</em>');
  if (fnMap) {
    str = str.replace(/\[fn\]([\s\S]*?)\[\/fn\]/gi, (_, ref) => {
    const id = fnMap[ref.trim()];
    if (!id) return `<sup>${escHtml(ref.trim())}</sup>`;
    return `<sup><span id="fnref-${id}" class="fn-anchor" style="display: inline; position: relative; top: -1.8em; visibility: hidden; pointer-events: none; height: 0; line-height: 0;"></span><a href="#fn-${id}" aria-label="Footnote ${id}" class="fn-ref">${id}</a></sup>`;
  });
  }
  str = str.replace(/\[link\]([\s\S]*?)\s*(?:->|-&gt;)\s*([^\[]*?)\[\/link\]/gi,
    (_, text, url) => {
      const t = text.trim();
      const u = url.trim();
      return `<a href="${escAttr(u)}" target="_blank" rel="noopener" aria-label="${escAttr(t)} (opens in new tab)">${t}</a>`;
    });
  str = str.replace(/\[([^\]\n]+?)\s*(?:->|-&gt;)\s*([^\]\n]+?)\]/gi,
    (_, text, url) => {
      const t = text.trim();
      const u = url.trim();
      return `<a href="${escAttr(u)}" target="_blank" rel="noopener" aria-label="${escAttr(t)} (opens in new tab)">${t}</a>`;
    });
  str = str.replace(/(?<!href="|">)(https?:\/\/[^\s<>"')]+|www\.[^\s<>"')]+)(?![^<]*<\/a>)/gi,
    url => {
      const href = url.startsWith('www.') ? 'https://' + url : url;
      return `<a href="${escAttr(href)}" target="_blank" rel="noopener">${url}</a>`;
    });
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

function tokenize(raw) {
  // Normalise line endings, then work on the flat string for block extraction
  // before splitting into lines for paragraph handling.
  const src = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const tokens = [];

  // ── Block tag definitions ──────────────────────────────────────────────────
  // Inline tags ([b], [i], [fn], [link]) are intentionally absent here;
  // they are handled entirely by applyInlineMarkup() at render time.
  const BLOCK_TAGS = [
    { open: '[manuscript]',     close: '[/manuscript]',     type: 'manuscript'     },
    { open: '[citations]',      close: '[/citations]',      type: 'citations'      },
    { open: '[image]',          close: '[/image]',          type: 'image'          },
    { open: '[title]',          close: '[/title]',          type: 'title'          },
    { open: '[subtitle]',       close: '[/subtitle]',       type: 'subtitle'       },
    { open: '[byline]',         close: '[/byline]',         type: 'byline'         },
    { open: '[section]',        close: '[/section]',        type: 'section'        },
    { open: '[subsection]',     close: '[/subsection]',     type: 'subsection'     },
    { open: '[subsubsection]',  close: '[/subsubsection]',  type: 'subsubsection'  },
    { open: '[pullquote]',      close: '[/pullquote]',      type: 'pullquote'      },
    { open: '[aside]',          close: '[/aside]',          type: 'aside'          },
    { open: '[epigraph]',       close: '[/epigraph]',       type: 'epigraph'       },
    { open: '[mono]',           close: '[/mono]',           type: 'mono'           },
    { open: '[code]',           close: '[/code]',           type: 'code'           },
    { open: '[bullet]',         close: '[/bullet]',         type: 'bullet'         },
    { open: '[num]',            close: '[/num]',            type: 'num'            },
    { open: '[alpha]',          close: '[/alpha]',          type: 'alpha'          },
    { open: '[end]',            close: '[/end]',            type: 'ending'         },
  ];

  // Build a regex that matches any block open-tag (case-insensitive).
  // We escape brackets so they are treated as literals.
  const blockOpenPattern = new RegExp(
    BLOCK_TAGS.map(bt => bt.open.replace(/\[/g, '\\[').replace(/\]/g, '\\]')).join('|'),
    'i'
  );

  // ── Tag-map for fast lookup ────────────────────────────────────────────────
  const tagByOpen  = {};
  const tagByClose = {};
  for (const bt of BLOCK_TAGS) {
    tagByOpen[bt.open.toLowerCase()]   = bt;
    tagByClose[bt.close.toLowerCase()] = bt;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Flush accumulated plain-text lines as para / break tokens.
  function flushLines(lines) {
    let i = 0;
    while (i < lines.length) {
      const t  = lines[i].trim();
      if (t === '') {
        let blanks = 0;
        while (i < lines.length && lines[i].trim() === '') { blanks++; i++; }
        if (blanks >= 2) tokens.push({ type: 'break', content: '' });
        continue;
      }
      if (isSectionBreak(t)) { tokens.push({ type: 'break', content: t }); i++; continue; }
      tokens.push({ type: 'para', content: t });
      i++;
    }
  }

  // Parse a captured block body (between open and close tags) into a token.
  function emitBlockToken(bt, body) {
    // Trim a single leading/trailing newline so all four spacing styles collapse
    // to the same content:
    //   [tag]content[/tag]   [tag]\ncontent[/tag]
    //   [tag]content\n[/tag] [tag]\ncontent\n[/tag]
    const content = body.replace(/^\n/, '').replace(/\n$/, '');

    if (bt.type === 'manuscript') {
      const props = { name: '', address: '', city: '', phone: '', email: '', wordcount: 'auto' };
      content.split('\n').forEach(l => {
        const idx = l.indexOf(':');
        if (idx !== -1) {
          const key = l.substring(0, idx).trim().toLowerCase();
          const val = l.substring(idx + 1).trim();
          if (key in props) props[key] = val;
        }
      });
      tokens.push({ type: 'manuscript', ...props });
      return;
    }
    if (bt.type === 'image') {
      const props = { source: '', alt: '', caption: '', credit: '' };
      content.split('\n').forEach(l => {
        const idx = l.indexOf(':');
        if (idx !== -1) {
          const key = l.substring(0, idx).trim().toLowerCase();
          const val = l.substring(idx + 1).trim();
          if (key in props) props[key] = val;
        }
      });
      tokens.push({ type: 'image', ...props });
      return;
    }
    if (bt.type === 'citations') {
      let citTitle = 'Notes';
      const contentLines = [];
      for (const l of content.split('\n')) {
        const m = l.match(/^heading:\s*(.+)$/i);
        if (m) citTitle = m[1].trim();
        else contentLines.push(l);
      }
      tokens.push({ type: 'citations', lines: contentLines, title: citTitle });
      return;
    }
    if (bt.type === 'bullet' || bt.type === 'num' || bt.type === 'alpha') {
      const rawLines = content.split('\n').filter(l => l.trim() !== '' || /^[ \t]/.test(l));
      tokens.push({ type: bt.type, rawLines, items: rawLines.map(l => l.trim()).filter(Boolean) });
      return;
    }
    // code: preserve exact whitespace (no extra trim beyond the tag-edge trim above)
    if (bt.type === 'code') {
      tokens.push({ type: 'code', content });
      return;
    }
    tokens.push({ type: bt.type, content: content.trim() });
  }

  // ── Inline-tag protection ─────────────────────────────────────────────────
  // A block open-tag that appears inside [b]...[/b] or [i]...[/i] must NOT
  // be treated as a real block boundary.  We detect this by checking whether
  // the candidate match position sits inside an unclosed inline span.
  // Inline close-tags: [/b], [/i], [/fn], [/link]
  const INLINE_OPEN_RE  = /\[(?:b|i|fn|link)\]/gi;
  const INLINE_CLOSE_RE = /\[\/(?:b|i|fn|link)\]/gi;

  function isInsideInlineTag(str, pos) {
    // Count unmatched open inline tags in str[0..pos-1].
    // If there are more opens than closes, pos is inside an inline span.
    const prefix = str.substring(0, pos);
    const opens  = (prefix.match(INLINE_OPEN_RE)  || []).length;
    const closes = (prefix.match(INLINE_CLOSE_RE) || []).length;
    return opens > closes;
  }

  // ── Main scan ──────────────────────────────────────────────────────────────
  // We walk the source string looking for the earliest *valid* block open-tag
  // (one that is not nested inside an inline [b]/[i] span).
  // Everything before it is plain text; the block body runs to the matching
  // close-tag. Text on the same line before the open-tag becomes its own para;
  // text on the same line after the close-tag is re-queued.

  let remaining = src;

  while (remaining.length > 0) {
    // Find earliest occurrence of any block open-tag that is not inside an
    // inline span.
    let earliestIdx = -1;
    let matchedTag  = null;

    const testLower = remaining.toLowerCase();
    for (const bt of BLOCK_TAGS) {
      let searchFrom = 0;
      while (true) {
        const idx = testLower.indexOf(bt.open.toLowerCase(), searchFrom);
        if (idx === -1) break;
        if (!isInsideInlineTag(remaining, idx)) {
          if (earliestIdx === -1 || idx < earliestIdx) {
            earliestIdx = idx;
            matchedTag  = bt;
          }
          break; // found the earliest valid occurrence for this tag
        }
        // This occurrence is inside an inline span — skip past it and keep looking
        searchFrom = idx + bt.open.length;
      }
    }

    if (earliestIdx === -1) {
      // No more valid block tags — flush the rest as lines
      flushLines(remaining.split('\n'));
      break;
    }

    // ── Text before the open-tag ───────────────────────────────────────────
    const before = remaining.substring(0, earliestIdx);

    // Find the close-tag (also skipping any occurrence inside an inline span,
    // though that's an edge case — close-tags inside [b] are even rarer)
    const afterOpen   = remaining.substring(earliestIdx + matchedTag.open.length);
    const closeTagLow = matchedTag.close.toLowerCase();
    const closeIdx    = afterOpen.toLowerCase().indexOf(closeTagLow);

    if (closeIdx === -1) {
      // No matching close-tag found — treat everything as plain text and stop
      flushLines(remaining.split('\n'));
      break;
    }

    const body  = afterOpen.substring(0, closeIdx);
    const after = afterOpen.substring(closeIdx + matchedTag.close.length);

    // ── Flush "before" text ────────────────────────────────────────────────
    // Split `before` into complete lines. The last segment (after the last \n)
    // may sit on the same line as the open-tag; it becomes its own para.
    // Crucially: these paras go to bodyToks in convertText, but header block
    // types (title, subtitle, byline, manuscript) are pulled into headerToks.
    // Text that appears *before* a header tag on the same physical line should
    // still be treated as a body para (it renders before the header area in
    // document flow), which is exactly what happens here — we flush it as a
    // normal para token and the renderer places it in story-body order.
    if (before.length > 0) {
      flushLines(before.split('\n'));
    }

    // ── Emit the block token ───────────────────────────────────────────────
    emitBlockToken(matchedTag, body);

    // ── Handle text after the close-tag ───────────────────────────────────
    // Strip at most one leading newline so we don't manufacture a blank line.
    remaining = after.startsWith('\n') ? after.substring(1) : after;
  }

  return tokens;
}

function countBodyWords(tokens) {
  const proseTypes = new Set(['para','pullquote','aside','epigraph','mono']);
  let words = 0;
  for (const tok of tokens) {
    if (proseTypes.has(tok.type) && tok.content) {
      const plain = tok.content.replace(/\[[^\]]*\]/g, '').trim();
      if (plain) words += plain.split(/\s+/).length;
    }
  }
  return Math.round(words / 100) * 100;
}

function buildFnMap(tokens) {
  const map = {};
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
  let wcDisplay;
  const rawWc = tok.wordcount;

  const isZeroWordcount = rawWc === '0' || rawWc === 0;

  if (isZeroWordcount) {
    wcDisplay = '';
  } else if (!rawWc || rawWc === 'auto') {
    if (wordCount === 0) {
      wcDisplay = '';
    } else {
      const formatted = wordCount.toLocaleString('en-US');
      wcDisplay = `about ${formatted} words`;
    }
  } else {
    const stripped = rawWc.replace(/,/g, '').trim();
    const asNum = parseInt(stripped, 10);
    if (!isNaN(asNum)) {
      const formatted = asNum.toLocaleString('en-US');
      wcDisplay = `about ${formatted} words`;
    } else {
      wcDisplay = rawWc;
    }
  }

  const leftLines = [];
  if (tok.name)    leftLines.push(`<span class="ms-name">${escHtml(tok.name)}</span>`);
  if (tok.address) leftLines.push(escHtml(tok.address));
  if (tok.city)    leftLines.push(escHtml(tok.city));
  if (tok.phone)   leftLines.push(escHtml(tok.phone));
  if (tok.email)   leftLines.push(`<a href="mailto:${escAttr(tok.email)}" class="ms-email">${escHtml(tok.email)}</a>`);

  const firstLine = leftLines.shift() || '';
  const restLines = leftLines.map(l => `<p class="ms-line">${l}</p>`).join('\n    ');

  const wordcountSpan = wcDisplay ? `<span class="ms-wordcount" aria-label="Approximate word count">${escHtml(wcDisplay)}</span>` : '';

  return [
    `  <div class="manuscript-header" role="group" aria-label="Manuscript submission header">`,
    `    <p class="ms-line ms-first-line">`,
    `      <span class="ms-contact">${firstLine}</span>`,
    wordcountSpan,
    `    </p>`,
    restLines ? `    ${restLines}` : '',
    `  </div>`,
  ].filter(l => l.trim() !== '').join('\n');
}

function renderEpigraph(tok, fnMap) {
  const lines = tok.content.split('\n');
  let attrLine = null;
  let quoteLines = lines;

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
  let isBoldGlobal = false;
  let isItalicGlobal = false;

  const rows = tok.content.split('\n').map(l => {
    if (l.trim() === '') return `    <p class="block-spacer"></p>`;

    let lineText = processInlineMono(l, fnMap);
    lineText = lineText.replace(/&gt;/g, '>');

    const hasOpenBold = lineText.includes('&lt;b&gt;') || lineText.includes('[b]');
    const hasCloseBold = lineText.includes('&lt;/b&gt;') || lineText.includes('[/b]');
    const hasOpenItalic = lineText.includes('&lt;i&gt;') || lineText.includes('[i]');
    const hasCloseItalic = lineText.includes('&lt;/i&gt;') || lineText.includes('[/i]');

    if (isBoldGlobal || hasOpenBold) {
      lineText = lineText.replace(/\[b\]/g, '').replace(/\[\/b\]/g, '');
    }
    if (isItalicGlobal || hasOpenItalic) {
      lineText = lineText.replace(/\[i\]/g, '').replace(/\[\/i\]/g, '');
    }

    if (hasOpenBold && !hasCloseBold) isBoldGlobal = true;
    if (hasOpenItalic && !hasCloseItalic) isItalicGlobal = true;

    if (isItalicGlobal || (hasOpenItalic && !hasCloseItalic)) {
      if (!lineText.startsWith('<em>')) lineText = `<em>${lineText}</em>`;
    }
    if (isBoldGlobal || (hasOpenBold && !hasCloseBold)) {
      if (!lineText.startsWith('<strong>')) lineText = `<strong>${lineText}</strong>`;
    }

    if (hasCloseBold && !hasOpenBold) isBoldGlobal = false;
    if (hasCloseItalic && !hasOpenItalic) isItalicGlobal = false;

    return `    <p class="mono-line">${lineText}</p>`;
  }).join('\n');

  return `  <div class="literary-mono" role="region" aria-label="Monospace text">\n${rows}\n  </div>`;
}

function processInlineMono(str, fnMap) {
  let rawText = escHtml(str)
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
  return applyInlineMarkup(rawText, fnMap);
}

function renderSection(tok, fnMap) {
  return `  <h2 class="section-heading">${processInline(tok.content, fnMap)}</h2>`;
}

function renderSubsection(tok, fnMap) {
  return `  <h3 class="subsection-heading">${processInline(tok.content, fnMap)}</h3>`;
}

function renderSubsubsection(tok, fnMap) {
  return `  <h4 class="subsubsection-heading">${processInline(tok.content, fnMap)}</h4>`;
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
    let rawBlock = codeLines.join('\n')
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");
      
    let highlighted;
    try { highlighted = Prism.highlight(rawBlock, grammar, lang); }
    catch(e) { highlighted = escHtml(rawBlock); }
    const hlLines = highlighted.split('\n');
    rowsHtml = hlLines.map((l, idx) =>
      `<span class="code-row"><span class="line-number" aria-hidden="true">${idx + 1}</span><code>${l || '\u200b'}</code></span>`
    ).join('\n');
  } else {
    rowsHtml = codeLines.map((l, idx) => {
      let cleanLine = l.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
      return `<span class="code-row"><span class="line-number" aria-hidden="true">${idx + 1}</span><code>${escHtml(cleanLine) || '\u200b'}</code></span>`;
    }).join('\n');
  }

  const langLabel = lang ? `<span class="code-lang-label" aria-hidden="true">${lang}</span>` : '';
  const langAttr  = lang ? ` aria-label="Code block: ${lang}"` : ' aria-label="Code block"';
  return `  <div class="code-block-wrap"${langAttr}>\n  ${langLabel}<button type="button" class="code-copy-btn" aria-label="Copy code" title="Copy code"><i class="fa-regular fa-copy" aria-hidden="true"></i></button>\n  <pre class="line-numbered-code">${rowsHtml}</pre>\n  </div>`;
}

function renderList(tok, fnMap) {
  const rootTag   = tok.type === 'bullet' ? 'ul' : 'ol';
  const rootClass = tok.type === 'alpha'  ? ' class="list-alpha"' : '';
  const rawLines  = tok.rawLines || tok.items;

  function depth(line) {
    const m = line.match(/^([ \t]*)/);
    if (!m) return 0;
    return m[1].replace(/\t/g, '  ').length;
  }

  function buildList(lines, baseDepth, pad) {
    const items = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      const d = depth(line);
      if (d < baseDepth) break;

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
  const reverseMap = {};
  for (const [ref, num] of Object.entries(fnMap)) reverseMap[num] = ref;

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
  return `  <section class="citations-section" aria-labelledby="citations-heading">\n    <h2 id="citations-heading" class="citations-heading">${escHtml(heading)}</h2>\n    <ol class="citations-list">\n${items}\n    </ol>\n  </section>`;
}

function checkAltWarnings(html) {
  const hasWarn = html.includes('data-a11y-warn="missing-alt"');
  const existing = document.getElementById('altWarning');
  if (hasWarn && !existing) {
    const warn = document.createElement('div');
    warn.id = 'altWarning';
    warn.className = 'alt-warning';
    warn.setAttribute('role', 'alert');
    warn.innerHTML = '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> One or more images are missing alt text — add an <code>alt:</code> field for accessibility.';
    const anchor = document.getElementById('editorActionBar');
    if (anchor) anchor.insertAdjacentElement('beforebegin', warn);
  } else if (!hasWarn && existing) {
    existing.remove();
  }
}

let lastAnnouncement = '';
let lastAnnouncementTime = 0;
let statusTimer = null;

function announcePreviewUpdate(paraCount) {
  const statusEl = document.getElementById('previewStatus');
  
  if (statusEl) {
    statusEl.innerHTML = '<i class="fa-solid fa-rotate-right" aria-hidden="true"></i>';
    statusEl.classList.add('visible', 'spinning');
    
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusEl.classList.remove('visible', 'spinning');
      statusEl.innerHTML = '';
    }, 600);
  }
  
  livePreview.setAttribute('aria-label', `Formatted story preview. Updated.`);
  
  let announcer = document.getElementById('liveAnnouncer');
  if (!announcer) {
    announcer = document.createElement('div');
    announcer.id = 'liveAnnouncer';
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');
    announcer.className = 'visually-hidden';
    document.body.appendChild(announcer);
  }
  const now = Date.now();
  if (!announcer._lastAnnounce || (now - announcer._lastAnnounce) > 2000) {
    announcer._lastAnnounce = now;
    announcer.textContent = 'Preview updated';
  }
}

function convertText() {
  const raw = inputText.value;
  if (!raw.trim()) {
    outputHtml.value = '';
    livePreview.innerHTML = '';
    checkAltWarnings('');
    announcePreviewUpdate(0);
    return;
  }

  const dropcap = getRadio('dropcap');
  const indent  = getRadio('indent');
  const endhr   = getRadio('endhr');
  const spacing = getRadio('linespacing');

  const tokens = tokenize(raw);
  const fnMap     = buildFnMap(tokens);
  const wordCount = countBodyWords(tokens);

  const HEADER_TYPES = new Set(['title', 'subtitle', 'byline', 'manuscript']);
  const BLOCK_TYPES  = new Set(['pullquote','aside','epigraph','mono','code','image',
                                 'bullet','num','alpha','section','subsection',
                                 'subsubsection','citations','manuscript']);

  // ── Para metadata pass (body paras only, in document order) ───────────────
  // We need to know each para's position relative to breaks and blocks so we
  // can apply drop-cap and indent classes correctly.  Header tokens don't
  // participate in this numbering.
  let paraIndex = 0;
  let nextAfterBreak = false;
  const paraMap = [];
  let afterBlock = false;

  for (const tok of tokens) {
    if (HEADER_TYPES.has(tok.type)) continue; // headers don't affect para flow
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
    } else if (BLOCK_TYPES.has(tok.type)) {
      afterBlock = true;
    }
  }

  const lsClass  = spacing === '1' ? ' ls-1' : spacing === '2' ? ' ls-2' : ' ls-1-5';
  const hasTitle = tokens.some(t => t.type === 'title');
  const labelAttr = hasTitle ? ' aria-labelledby="story-title"' : '';

  const out = [];
  out.push(`<article class="story-content${lsClass}"${labelAttr}>`);

  // ── Single-pass render in document order ──────────────────────────────────
  // We open <header> lazily when we first hit a header token, and close it
  // (and open <main>) when we transition to a non-header token.
  let inHeader = false;
  let mainOpen = false;
  let anyHeaderSeen = false;
  let pIdx = 0;

  // manuscript is rendered first inside the header if present anywhere in
  // the header cluster, so we find it ahead of time.
  const msTok = tokens.find(t => t.type === 'manuscript');

  function ensureHeader() {
    if (!inHeader) {
      out.push(`  <header class="story-header">`);
      if (msTok) out.push(renderManuscript(msTok, wordCount));
      inHeader = true;
      anyHeaderSeen = true;
    }
  }

  function closeHeaderOpenMain() {
    if (inHeader) {
      out.push(`  <hr class="title-rule" aria-hidden="true">`);
      out.push(`  </header>`);
      inHeader = false;
    }
    if (!mainOpen) {
      out.push(`  <main class="story-body">`);
      mainOpen = true;
    }
  }

  for (const tok of tokens) {
    // ── Header tokens ────────────────────────────────────────────────────────
    if (tok.type === 'manuscript') {
      // already rendered inside ensureHeader(); skip here
      ensureHeader();
      continue;
    }
    if (HEADER_TYPES.has(tok.type)) {
      ensureHeader();
      const brokenContent = tok.content.split('\n').map(l => processInline(l, fnMap)).join('<br />');
      if (tok.type === 'title') {
        out.push(`  <h1 class="story-title" id="story-title">${brokenContent}</h1>`);
      } else if (tok.type === 'subtitle') {
        out.push(`  <p class="story-subtitle">${brokenContent}</p>`);
      } else if (tok.type === 'byline') {
        out.push(`  <p class="story-byline" role="doc-byline">${brokenContent}</p>`);
      }
      continue;
    }

    // ── Body tokens — close header / open main first if needed ───────────────
    closeHeaderOpenMain();

    if (tok.type === 'break') {
      out.push(`  <hr class="fleuron-break" aria-label="Section break">`);
      continue;
    }
    if (tok.type === 'ending') {
      if (tok.content) out.push(`  <p class="story-end">${processInline(tok.content, fnMap)}</p>`);
      if (endhr === 'yes') out.push(`  <hr class="fleuron-end" aria-hidden="true">`);
      continue;
    }
    if (tok.type === 'pullquote')     { out.push(renderPullquote(tok, fnMap));     continue; }
    if (tok.type === 'aside')         { out.push(renderAside(tok, fnMap));         continue; }
    if (tok.type === 'epigraph')      { out.push(renderEpigraph(tok, fnMap));      continue; }
    if (tok.type === 'mono')          { out.push(renderMono(tok, fnMap));          continue; }
    if (tok.type === 'code')          { out.push(renderCode(tok));                 continue; }
    if (tok.type === 'section')       { out.push(renderSection(tok, fnMap));       continue; }
    if (tok.type === 'subsection')    { out.push(renderSubsection(tok, fnMap));    continue; }
    if (tok.type === 'subsubsection') { out.push(renderSubsubsection(tok, fnMap)); continue; }
    if (tok.type === 'citations')     { out.push(renderCitations(tok, fnMap));     continue; }
    if (['bullet','num','alpha'].includes(tok.type)) { out.push(renderList(tok, fnMap)); continue; }
    if (tok.type === 'image')         { out.push(renderImage(tok));                continue; }

    // ── Paragraph ────────────────────────────────────────────────────────────
    const { afterBreak, isFirst, afterBlock: ab } = paraMap[pIdx++];
    const content = processInline(tok.content, fnMap);
    const classes = [];

    if (dropcap === 'first' && isFirst) classes.push('dropcap-paragraph');
    else if (dropcap === 'sections' && afterBreak) classes.push('dropcap-paragraph');

    const hasDrop = classes.includes('dropcap-paragraph');
    if (indent === 'none') {
      if (!hasDrop) classes.push('no-indent');
    } else if (indent === 'all') {
      if (!hasDrop) classes.push('continues');
    } else if (indent === 'section-only') {
      if (!hasDrop && (isFirst || afterBreak)) classes.push('no-indent');
      else if (!hasDrop && ab) classes.push('continues');
    }

    const classAttr = classes.length ? ` class="${classes.join(' ')}"` : '';
    out.push(`  <p${classAttr}>${content}</p>`);
  }

  // Close any still-open sections
  if (inHeader) {
    out.push(`  <hr class="title-rule" aria-hidden="true">`);
    out.push(`  </header>`);
  }
  if (!mainOpen) out.push(`  <main class="story-body">`);
  out.push(`  </main>`);
  out.push(`</article>`);

  const html = out.join('\n');
  outputHtml.value = html;
  checkAltWarnings(html);
  
  const paraCount = (html.match(/<p/g) || []).length;
  announcePreviewUpdate(paraCount);
  
  updatePreview(html, lsClass);
}

function updatePreview(html, lsClass) {
  livePreview.className = 'story-content preview-body' + lsClass;
  livePreview.innerHTML = html
    .replace(/^<article class="story-content[^"]*">\n/, '')
    .replace(/\n<\/article>$/, '');
  wireCopyButtons(livePreview);
  wireFootnoteLinks(livePreview);
}

function getCleanHtml() {
  return outputHtml.value
    .replace(/^<article class="story-content[^"]*">\n/, '')
    .replace(/\n<\/article>$/, '');
}

let debounceTimer;
let autosaveTimer;

function scheduleConvert() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(convertText, 300);
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autosaveToLocalStorage, 1000);
}

inputText.addEventListener('input', () => {
  scheduleConvert();
  scheduleAutosave();
});

document.querySelectorAll('input[type="radio"]').forEach(r => r.addEventListener('change', convertText));

async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`${label} copied!`);
  } catch {
    outputHtml.select();
    showToast('Press Ctrl+C / ⌘+C to copy manually');
  }
}

function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function getDocTitle() {
  const titleEl = livePreview.querySelector('h1.story-title');
  return titleEl ? titleEl.textContent.trim() : null;
}

function getDownloadFilename(type) {
  const title = getDocTitle();
  if (title) {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `${slug}-${type}.html`;
  }
  return `story-${type}.html`;
}

function getStandaloneHtml() {
  const title = getDocTitle() || 'Story';
  const storyFooter = `<footer class="wf-credit" aria-label="Formatted by Written &amp; Formatted">
  <p>Page formatted by <a href="https://samoff.com/written/app" target="_blank" rel="noopener">Written &amp; Formatted</a>. &copy; Tim Samoff.</p>
</footer>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
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
${storyFooter}
</body>
</html>`;
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

function insertTextWithUndo(textarea, text) {
  textarea.focus();
  const ok = document.execCommand('insertText', false, text);
  if (!ok) {
    const s = textarea.selectionStart;
    const e = textarea.selectionEnd;
    const v = textarea.value;
    textarea.value = v.substring(0, s) + text + v.substring(e);
    textarea.setSelectionRange(s + text.length, s + text.length);
  }
}

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
    inputText.setSelectionRange(start - pre.length < 0 ? 0 : start, end);
    replaceRangeWithUndo(inputText, Math.max(0, start - (pre ? 0 : 0)), end, replacement);
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
  scheduleAutosave();
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
  scheduleAutosave();
}

function insertFn() {
  const start   = inputText.selectionStart;
  const end     = inputText.selectionEnd;
  const sel     = inputText.value.substring(start, end).trim();
  const existing = (inputText.value.match(/\[fn\]/gi) || []).length + 1;
  const ref     = sel || String(existing);
  const tag     = `[fn]${ref}[/fn]`;
  const before  = inputText.value.substring(0, start);
  const after   = inputText.value.substring(end);
  replaceRangeWithUndo(inputText, start, end, tag);
  inputText.setSelectionRange(before.length + tag.length, before.length + tag.length);
  inputText.focus();
  scheduleConvert();
  scheduleAutosave();
}

function indentLines(direction) {
  const start  = inputText.selectionStart;
  const end    = inputText.selectionEnd;
  const val    = inputText.value;

  const lineStart = val.lastIndexOf('\n', start - 1) + 1;
  const lineEnd   = val.indexOf('\n', end);
  const blockEnd  = lineEnd === -1 ? val.length : lineEnd;
  const block     = val.substring(lineStart, blockEnd);

  const modified = block.split('\n').map(line => {
    if (direction === 'in') return '  ' + line;
    return line.replace(/^  /, '');
  }).join('\n');

  inputText.value = val.substring(0, lineStart) + modified + val.substring(blockEnd);
  inputText.setSelectionRange(lineStart, lineStart + modified.length);
  inputText.focus();
  scheduleConvert();
  scheduleAutosave();
}

function insertCitations() {
  const start  = inputText.selectionStart;
  const before = inputText.value.substring(0, start);
  const after  = inputText.value.substring(start);
  const pre    = (before.length > 0 && !before.endsWith('\n')) ? '\n' : '';
  const post   = (after.length  > 0 && !after.startsWith('\n')) ? '\n' : '';
  const block  = `${pre}[citations]\nheading: Notes\n1. \n[/citations]${post}`;
  replaceRangeWithUndo(inputText, start, start, block);
  const cursorPos = before.length + pre.length + '[citations]\nheading: Notes\n1. '.length;
  inputText.setSelectionRange(cursorPos, cursorPos);
  inputText.focus();
  scheduleConvert();
  scheduleAutosave();
}

const TOOLBAR_BUTTONS = [
  { label: 'Manuscript', title: 'Insert [manuscript] submission header', action: () => openManuscriptModal() },
  { label: 'Title',      title: 'Insert [title] block',      action: () => wrapSelection('[title]',      '[/title]',      true) },
  { label: 'Subtitle',   title: 'Insert [subtitle] block',   action: () => wrapSelection('[subtitle]',   '[/subtitle]',   true) },
  { label: 'Byline',     title: 'Insert [byline] block',     action: () => wrapSelection('[byline]',     '[/byline]',     true) },
  { label: 'Section',       title: 'Insert [section] heading',       action: () => wrapSelection('[section]',       '[/section]',       true) },
  { label: 'Subsection',   title: 'Insert [subsection] heading',    action: () => wrapSelection('[subsection]',    '[/subsection]',    true) },
  { label: 'Sub-sub',      title: 'Insert [subsubsection] heading', action: () => wrapSelection('[subsubsection]', '[/subsubsection]', true) },
  { label: '⇗ Link',     title: 'Insert [link]',             action: () => openLinkModal() },
  { label: 'Pullquote',  title: 'Insert [pullquote] block',  action: () => wrapSelection('[pullquote]',  '[/pullquote]',  true) },
  { label: 'Aside',      title: 'Insert [aside] block',      action: () => wrapSelection('[aside]',      '[/aside]',      true) },
  { label: 'Epigraph',   title: 'Insert [epigraph] block',   action: () => wrapSelection('[epigraph]',   '[/epigraph]',   true) },
  { label: 'Mono',       title: 'Insert [mono] block',       action: () => wrapSelection('[mono]',       '[/mono]',       true) },
  { label: 'Code',       title: 'Insert [code] block',       action: () => wrapSelection('[code]',       '[/code]',       true) },
  { label: '⊞ Image',   title: 'Insert [image] block',      action: () => openImageModal() },
  { label: 'B',          title: 'Bold [b]',                  action: () => wrapSelection('[b]', '[/b]'),  bold: true },
  { label: 'I',          title: 'Italic [i]',                action: () => wrapSelection('[i]', '[/i]'),  italic: true },
  { label: '• List',     title: 'Insert [bullet] list',      action: () => insertList('bullet') },
  { label: '1. List',    title: 'Insert [num] list',         action: () => insertList('num') },
  { label: 'a. List',    title: 'Insert [alpha] list',       action: () => insertList('alpha') },
  { label: '→ Indent',   title: 'Indent selected lines (nest list items)', action: () => indentLines('in') },
  { label: '← Dedent',   title: 'Dedent selected lines',    action: () => indentLines('out') },
  { label: 'Footnote',   title: 'Insert [fn] footnote ref',  action: () => insertFn() },
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
    
    if (def.label === 'B') btn.setAttribute('aria-label', 'Bold');
    else if (def.label === 'I') btn.setAttribute('aria-label', 'Italic');
    else if (def.label === '• List') btn.setAttribute('aria-label', 'Bullet list');
    else if (def.label === '1. List') btn.setAttribute('aria-label', 'Numbered list');
    else if (def.label === 'a. List') btn.setAttribute('aria-label', 'Alphabetical list');
    else if (def.label === '→ Indent') btn.setAttribute('aria-label', 'Indent lines');
    else if (def.label === '← Dedent') btn.setAttribute('aria-label', 'Dedent lines');
    else if (def.label === '⇗ Link') btn.setAttribute('aria-label', 'Insert link');
    else if (def.label === '⊞ Image') btn.setAttribute('aria-label', 'Insert image');
    else if (def.label === '❦ End') btn.setAttribute('aria-label', 'Insert end block');
    else btn.setAttribute('aria-label', `Insert ${def.label}`);
    
    if (def.bold)   btn.style.fontWeight = '700';
    if (def.italic) btn.style.fontStyle  = 'italic';
    btn.addEventListener('click', def.action);
    toolbar.appendChild(btn);
  });
}

let mainContentElement = null;

function setBackgroundInert(isInert) {
  if (!mainContentElement) {
    mainContentElement = document.querySelector('main') || document.getElementById('main-content');
    const header = document.querySelector('.site-header');
    const footer = document.querySelector('.site-footer');
    if (header) header.setAttribute('aria-hidden', isInert);
    if (footer) footer.setAttribute('aria-hidden', isInert);
  }
  
  if (mainContentElement) {
    mainContentElement.setAttribute('aria-hidden', isInert);
  }
}

function openModalWithFocus(modal) {
  modal.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
  setBackgroundInert(true);
  
  const focusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusable) {
    setTimeout(() => focusable.focus(), 10);
  }
  
  const trapHandler = (e) => trapFocus(modal, e);
  modal.addEventListener('keydown', trapHandler);
  modal._trapHandler = trapHandler;
}

function closeModalWithFocus(modal) {
  modal.setAttribute('hidden', '');
  document.body.style.overflow = '';
  
  const anyOpenModal = Array.from(document.querySelectorAll('.modal-overlay, .preview-modal-overlay'))
    .some(m => !m.hasAttribute('hidden'));
  
  if (!anyOpenModal) {
    setBackgroundInert(false);
  }
  
  if (modal._trapHandler) {
    modal.removeEventListener('keydown', modal._trapHandler);
    delete modal._trapHandler;
  }
  inputText.focus();
}

function trapFocus(element, event) {
  const focusable = element.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  const firstFocusable = focusable[0];
  const lastFocusable = focusable[focusable.length - 1];
  
  if (event.key === 'Tab') {
    if (event.shiftKey) {
      if (document.activeElement === firstFocusable) {
        lastFocusable.focus();
        event.preventDefault();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        firstFocusable.focus();
        event.preventDefault();
      }
    }
  }
}

function openLinkModal() {
  const selStart = inputText.selectionStart;
  const selEnd   = inputText.selectionEnd;
  const selText  = inputText.value.substring(selStart, selEnd);
  const modal    = document.getElementById('linkModal');
  document.getElementById('linkText').value = selText || '';
  document.getElementById('linkUrl').value  = '';
  modal._selStart = selStart;
  modal._selEnd   = selEnd;
  openModalWithFocus(modal);
  document.getElementById('linkText').focus();
}

function closeLinkModal() {
  closeModalWithFocus(document.getElementById('linkModal'));
}

function confirmLink() {
  const modal = document.getElementById('linkModal');
  const text  = document.getElementById('linkText').value.trim();
  const url   = document.getElementById('linkUrl').value.trim();
  if (!url) { showToast('Please enter a URL'); return; }
  const displayText = text || url;
  const tag  = `[link]${displayText} -> ${url}[/link]`;
  const insertPoint = modal._selStart;
  
  replaceRangeWithUndo(inputText, insertPoint, modal._selEnd, tag);
  
  const newCursorPos = insertPoint + tag.length;
  inputText.setSelectionRange(newCursorPos, newCursorPos);
  
  closeLinkModal();
  scheduleConvert();
  scheduleAutosave();
  inputText.focus();
  setTimeout(() => syncPreviewToInputLineImmediate(), 100);
}

function openImageModal() {
  ['imgSource','imgAlt','imgCaption','imgCredit'].forEach(id => {
    document.getElementById(id).value = '';
  });
  const modal = document.getElementById('imageModal');
  modal._insertionPoint = inputText.selectionStart;
  openModalWithFocus(modal);
  document.getElementById('imgSource').focus();
}

function closeImageModal() {
  closeModalWithFocus(document.getElementById('imageModal'));
}

function confirmImage() {
  const source  = document.getElementById('imgSource').value.trim();
  const alt     = document.getElementById('imgAlt').value.trim();
  const caption = document.getElementById('imgCaption').value.trim();
  const credit  = document.getElementById('imgCredit').value.trim();
  
  if (!source) {
    showToast('Please enter an image source URL or path');
    document.getElementById('imgSource').focus();
    return;
  }
  
  const lines = [
    '[image]',
    `source: ${source}`,
    `alt: ${alt}`,
    `caption: ${caption}`,
    `credit: ${credit}`,
    '[/image]'
  ];
  const tag = lines.join('\n');
  const modal = document.getElementById('imageModal');
  const insertPoint = modal._insertionPoint !== undefined ? modal._insertionPoint : inputText.selectionStart;
  const before = inputText.value.substring(0, insertPoint);
  const after = inputText.value.substring(insertPoint);
  const pre = (before.length > 0 && !before.endsWith('\n')) ? '\n' : '';
  const post = (after.length > 0 && !after.startsWith('\n')) ? '\n' : '';
  const fullTag = pre + tag + post;
  
  replaceRangeWithUndo(inputText, insertPoint, insertPoint, fullTag);
  
  const newCursorPos = insertPoint + fullTag.length;
  inputText.setSelectionRange(newCursorPos, newCursorPos);
  
  closeImageModal();
  scheduleConvert();
  scheduleAutosave();
  inputText.focus();
  setTimeout(() => syncPreviewToInputLineImmediate(), 100);
}

function openManuscriptModal() {
  ['msName','msAddress','msCity','msPhone','msEmail','msWordcount'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('msWordcount').placeholder = 'auto (calculated from text)';
  
  const modal = document.getElementById('manuscriptModal');
  modal._insertionPoint = inputText.selectionStart;
  
  openModalWithFocus(modal);
  document.getElementById('msName').focus();
}

function closeManuscriptModal() {
  closeModalWithFocus(document.getElementById('manuscriptModal'));
}

function confirmManuscript() {
  const modal = document.getElementById('manuscriptModal');
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
  lines.push(`wordcount: ${wordcount}`);
  lines.push('[/manuscript]');

  const tag = lines.join('\n');
  const insertPoint = modal._insertionPoint !== undefined ? modal._insertionPoint : inputText.selectionStart;
  const before = inputText.value.substring(0, insertPoint);
  const after = inputText.value.substring(insertPoint);
  const pre = (before.length > 0 && !before.endsWith('\n')) ? '\n' : '';
  const post = (after.length > 0 && !after.startsWith('\n')) ? '\n' : '';
  const fullTag = pre + tag + post;
  
  replaceRangeWithUndo(inputText, insertPoint, insertPoint, fullTag);
  
  const newCursorPos = insertPoint + fullTag.length;
  inputText.setSelectionRange(newCursorPos, newCursorPos);
  
  closeManuscriptModal();
  scheduleConvert();
  scheduleAutosave();
  inputText.focus();
  setTimeout(() => syncPreviewToInputLineImmediate(), 100);
}

function setupModals() {
  const linkModal = document.getElementById('linkModal');
  const linkClose = document.getElementById('linkModalClose');
  const linkCancel = document.getElementById('linkModalCancel');
  const linkConfirm = document.getElementById('linkModalConfirm');
  
  if (linkClose) linkClose.addEventListener('click', closeLinkModal);
  if (linkCancel) linkCancel.addEventListener('click', closeLinkModal);
  if (linkConfirm) {
    const newLinkConfirm = linkConfirm.cloneNode(true);
    linkConfirm.parentNode.replaceChild(newLinkConfirm, linkConfirm);
    newLinkConfirm.addEventListener('click', confirmLink);
  }
  
  const linkText = document.getElementById('linkText');
  const linkUrl = document.getElementById('linkUrl');
  const handleLinkEnter = (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmLink(); } };
  if (linkText) linkText.addEventListener('keypress', handleLinkEnter);
  if (linkUrl) linkUrl.addEventListener('keypress', handleLinkEnter);
  
  const msModal = document.getElementById('manuscriptModal');
  const msClose = document.getElementById('manuscriptModalClose');
  const msCancel = document.getElementById('manuscriptModalCancel');
  const msConfirm = document.getElementById('manuscriptModalConfirm');
  
  if (msClose) msClose.addEventListener('click', closeManuscriptModal);
  if (msCancel) msCancel.addEventListener('click', closeManuscriptModal);
  if (msConfirm) {
    const newMsConfirm = msConfirm.cloneNode(true);
    msConfirm.parentNode.replaceChild(newMsConfirm, msConfirm);
    newMsConfirm.addEventListener('click', confirmManuscript);
  }
  
  const msFields = ['msName', 'msAddress', 'msCity', 'msPhone', 'msEmail', 'msWordcount'];
  const handleMsEnter = (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmManuscript(); } };
  msFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) field.addEventListener('keypress', handleMsEnter);
  });
  
  const imgModal = document.getElementById('imageModal');
  const imgClose = document.getElementById('imageModalClose');
  const imgCancel = document.getElementById('imageModalCancel');
  const imgConfirm = document.getElementById('imageModalConfirm');
  
  if (imgClose) imgClose.addEventListener('click', closeImageModal);
  if (imgCancel) imgCancel.addEventListener('click', closeImageModal);
  if (imgConfirm) {
    const newImgConfirm = imgConfirm.cloneNode(true);
    imgConfirm.parentNode.replaceChild(newImgConfirm, imgConfirm);
    newImgConfirm.addEventListener('click', confirmImage);
  }
  
  const imgFields = ['imgSource', 'imgAlt', 'imgCaption', 'imgCredit'];
  const handleImgEnter = (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmImage(); } };
  imgFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) field.addEventListener('keypress', handleImgEnter);
  });
  
  const modals = [linkModal, msModal, imgModal];
  modals.forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          if (modal.id === 'linkModal') closeLinkModal();
          if (modal.id === 'manuscriptModal') closeManuscriptModal();
          if (modal.id === 'imageModal') closeImageModal();
        }
      });
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (linkModal && !linkModal.hasAttribute('hidden')) closeLinkModal();
      if (msModal && !msModal.hasAttribute('hidden')) closeManuscriptModal();
      if (imgModal && !imgModal.hasAttribute('hidden')) closeImageModal();
    }
  });
}

function setupPreviewModal() {
  const expandBtn = document.getElementById('previewExpandBtn');
  const modal     = document.getElementById('previewModal');
  const closeBtn  = document.getElementById('previewModalClose');
  const modalBody = document.getElementById('previewModalBody');

  function open() {
    modalBody.innerHTML = livePreview.innerHTML;
    modalBody.className = livePreview.className + ' preview-modal-body';
    openModalWithFocus(modal);
    closeBtn.focus();
    wireCopyButtons(modalBody);
    wireFootnoteLinks(modalBody);
  }

  function close() {
    closeModalWithFocus(modal);
    expandBtn.focus();
  }

  expandBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.hasAttribute('hidden')) close();
  });
}

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
        const originalHtml = fresh.innerHTML;
        fresh.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
        fresh.setAttribute('aria-label', 'Code copied!');
        setTimeout(() => { 
          fresh.innerHTML = originalHtml;
          fresh.setAttribute('aria-label', 'Copy code');
        }, 1800);
      }).catch(() => showToast('Copy failed'));
    });
  });
}

function getEmbedHtml() {
  const creditDiv = `<div class="wf-credit" aria-label="Formatted by Written &amp; Formatted">
  <p>Page formatted by <a href="https://samoff.com/written/app" target="_blank" rel="noopener">Written &amp; Formatted</a>. &copy; Tim Samoff.</p>
</div>`;
  return outputHtml.value + '\n' + creditDiv;
}

function openViewModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  if (modalId === 'viewStandaloneModal') {
    document.getElementById('viewStandaloneContent').value = getStandaloneHtml();
  } else if (modalId === 'viewEmbedModal') {
    document.getElementById('viewEmbedContent').value = getEmbedHtml();
  } else if (modalId === 'viewCssModal') {
    document.getElementById('viewCssContent').value = BASE_CSS_TEXT;
  }
  openModalWithFocus(modal);
}

function closeViewModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  closeModalWithFocus(modal);
}

function setupViewModals() {
  const modals = [
    { id: 'viewStandaloneModal', copyId: 'viewStandaloneCopy', dlId: 'viewStandaloneDl', getContent: () => document.getElementById('viewStandaloneContent').value, getFilename: () => getDownloadFilename('standalone'), dlType: 'text/html' },
    { id: 'viewEmbedModal',      copyId: 'viewEmbedCopy',      dlId: 'viewEmbedDl',      getContent: () => document.getElementById('viewEmbedContent').value,      getFilename: () => getDownloadFilename('embed'),      dlType: 'text/html' },
    { id: 'viewCssModal',        copyId: 'viewCssCopy',        dlId: 'viewCssDl',        getContent: () => document.getElementById('viewCssContent').value,         getFilename: () => 'story-base.css',                 dlType: 'text/css'  },
  ];

  modals.forEach(({ id, copyId, dlId, getContent, getFilename, dlType }) => {
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
      a.href = url; a.download = getFilename();
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    });
  });

  document.getElementById('viewStandaloneBtn')?.addEventListener('click', () => {
    if (!outputHtml.value.trim()) { showToast('Nothing to view — type some text first'); return; }
    openViewModal('viewStandaloneModal');
  });
  document.getElementById('viewEmbedBtn')?.addEventListener('click', () => {
    if (!outputHtml.value.trim()) { showToast('Nothing to view — type some text first'); return; }
    openViewModal('viewEmbedModal');
  });
  document.getElementById('viewCssBtn')?.addEventListener('click', () => openViewModal('viewCssModal'));
  document.getElementById('saveTextBtn')?.addEventListener('click', () => {
    const text = inputText.value;
    if (!text.trim()) { showToast('Nothing to save — type some text first'); return; }
    const title = getDocTitle();
    const slug  = title
      ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      : 'story';
    const filename = `${slug}.txt`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast('Text saved!');
  });
  document.getElementById('openTextBtn')?.addEventListener('click', () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.txt,text/plain';
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        inputText.value = e.target.result;
        scheduleConvert();
        showToast(`Opened: ${file.name}`);
      };
      reader.onerror = () => showToast('Could not read file');
      reader.readAsText(file, 'utf-8');
    });
    fileInput.click();
  });
  document.getElementById('clearBtn')?.addEventListener('click', () => {
    if (inputText.value.trim() && !confirm('Clear all text? This cannot be undone.')) return;
    inputText.value = '';
    localStorage.removeItem(AUTOSAVE_KEY);
    outputHtml.value = '';
    livePreview.innerHTML = '';
    checkAltWarnings('');
    announcePreviewUpdate(0);
    inputText.focus();
  });
}

function setupHelpModal() {
  const modal    = document.getElementById('helpModal');
  const closeBtn = document.getElementById('helpModalClose');
  const doneBtn  = document.getElementById('helpModalDone');

  function open() {
    openModalWithFocus(modal);
    closeBtn.focus();
  }

  function close() {
    closeModalWithFocus(modal);
    helpBtn.focus();
  }

  if (helpBtn)  helpBtn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (doneBtn)  doneBtn.addEventListener('click', close);
  if (modal)    modal.addEventListener('click', e => { if (e.target === modal) close(); });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) close();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  buildToolbar();
  setupModals();
  setupPreviewModal();
  setupViewModals();
  setupHelpModal();
  loadFromLocalStorage();
  
  // Fix cursor position when tabbing into textarea without scrolling
  inputText.addEventListener('focus', () => {
    window._programmaticFocus = true;
    
    // Store current scroll position
    const currentScrollTop = inputText.scrollTop;
    const currentScrollLeft = inputText.scrollLeft;
    
    // Set cursor to beginning
    inputText.setSelectionRange(0, 0);
    
    // Restore scroll position immediately
    inputText.scrollTop = currentScrollTop;
    inputText.scrollLeft = currentScrollLeft;
    
    setTimeout(() => {
      window._programmaticFocus = false;
    }, 200);
  });
  
  // Prevent any automatic scrolling when cursor is moved programmatically
  inputText.addEventListener('scroll', (e) => {
    if (window._programmaticFocus) {
      e.preventDefault();
      // Keep scroll at top during programmatic focus
      if (inputText.scrollTop !== 0) {
        inputText.scrollTop = 0;
      }
    }
  }, { passive: false });
  
  // Skip link handler
  const skipLink = document.querySelector('.skip-link');
  if (skipLink) {
    skipLink.addEventListener('click', (e) => {
      e.preventDefault();
      window._skipLinkActive = true;
      window._programmaticFocus = true;
      inputText.focus();
      inputText.setSelectionRange(0, 0);
      inputText.scrollTop = 0;
      setTimeout(() => {
        window._skipLinkActive = false;
        window._programmaticFocus = false;
      }, 200);
    });
  }
});

const BASE_CSS_TEXT = `/* ==========================================================================
   Written & Formatted — Base Stylesheet
   Generated by https://samoff.com/written/app

   NOTE: For [code] syntax highlighting, also include Prism.js:
   <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css" />
   <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"><\/script>
   ========================================================================== */

/* ==========================================================================
   CUSTOMIZATION — edit the variables below to retheme the page.
   All colors and fonts flow from this one block; nothing else needs changing.
   ========================================================================== */

:root {
  --wf-bg:          #f2f1ef;
  --wf-text:        #2a1f1c;
  --wf-text-muted:  #6b4e41;
  --wf-accent:      #8b5a4a;
  --wf-accent-inline: #6b3a2a;
  --wf-border:      #d9d2cc;
  --wf-font-body:   'EB Garamond', Georgia, serif;
  --wf-font-mono:   'Source Code Pro', Consolas, monospace;
}

body {
  background-color: var(--wf-bg);
  margin: 0;
  padding: 0;
}

.story-content {
  max-width: 660px;
  margin: 0 auto;
  padding: 40px 20px;
  font-family: var(--wf-font-body);
  font-size: 1.15rem;
  line-height: 1.65;
  color: var(--wf-text);
}

.story-content.ls-1   { line-height: 1.4; }
.story-content.ls-1-5 { line-height: 1.65; }
.story-content.ls-2   { line-height: 2.0; }

/* ==========================================================================
   Links — REQUIRED for all hyperlinks in content
   ========================================================================== */

.story-content a {
  color: var(--wf-accent-inline);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.2em;
  transition: color 0.2s ease, text-decoration-thickness 0.2s ease;
}

.story-content a:hover {
  color: var(--wf-accent);
  text-decoration-thickness: 2px;
}

/* ==========================================================================
   Manuscript Header
   ========================================================================== */

.story-content .manuscript-header {
  font-family: var(--wf-font-body);
  font-size: 0.88rem;
  color: var(--wf-text);
  margin-bottom: 4rem;
  line-height: 1.7;
}

.story-content .ms-line {
  margin: 0;
  text-indent: 0 !important;
  text-align: left !important;
}

.story-content .ms-first-line {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: nowrap;
}

.story-content .ms-contact { font-weight: 600; }

.story-content .ms-wordcount {
  font-size: 0.85rem;
  color: var(--wf-text-muted);
  white-space: nowrap;
  padding-left: 3rem;
}

.story-content .ms-email {
  color: var(--wf-accent);
  text-decoration: none;
}
.story-content .ms-email:hover { text-decoration: underline; }

.story-content .manuscript-header ~ h1.story-title { margin-top: 4rem; }

/* ==========================================================================
   Typography
   ========================================================================== */

.story-content h1.story-title {
  text-align: center; font-size: 2.25rem; font-weight: 600;
  line-height: 1.2; margin: 0 0 0.25em 0; color: var(--wf-text);
}
.story-content p.story-subtitle {
  text-align: center; font-size: 1.35rem; font-weight: 400;
  font-style: italic; color: var(--wf-text-muted);
  margin: 0 0 0.5em 0; line-height: 1.3; text-indent: 0 !important;
}
.story-content p.story-byline {
  text-align: center; font-size: 1rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--wf-text-muted); margin: 0 0 1.5em 0; text-indent: 0 !important;
}
.story-content hr.title-rule {
  border: none; border-top: 1px solid var(--wf-border);
  margin: 0 auto 2.5rem auto; width: 80px;
}

.story-content h2.section-heading {
  font-size: 1.25rem; font-weight: 600; margin: 2.5rem 0 0.75rem 0;
  color: var(--wf-text); letter-spacing: 0.01em;
}
.story-content h3.subsection-heading {
  font-size: 1.1rem; font-weight: 600; font-style: italic;
  margin: 2rem 0 0.5rem 0; color: var(--wf-text); letter-spacing: 0.01em;
}
.story-content h4.subsubsection-heading {
  font-size: 1rem; font-weight: 600; margin: 1.5rem 0 0.4rem 0;
  color: var(--wf-text); letter-spacing: 0.01em;
}

.story-content p {
  margin: 0 0 0.5em 0; text-align: justify; text-justify: inter-word;
}
.story-content p + p { text-indent: 1.5rem; }
.story-content p.no-indent { text-indent: 0 !important; }
.story-content p.continues  { text-indent: 1.4rem; }
.story-content p.dropcap-paragraph { text-indent: 0; }
.story-content p.dropcap-paragraph::first-letter {
  font-size: 4.5rem; float: left; line-height: 0.75;
  margin: 0.1em 0.1rem 0 0;
  color: var(--wf-accent);
}

.story-content blockquote.epigraph {
  margin: 2rem 2rem 2rem 3rem;
  font-style: italic; color: var(--wf-text-muted);
  border: none; padding: 0;
}
.story-content .epigraph p { text-indent: 0 !important; margin-bottom: 0.4em; }
.story-content .epigraph footer.epigraph-attribution {
  font-size: 0.9rem; font-style: normal; margin-top: 0.5em;
}

.story-content aside.pullquote {
  border-left: 4px solid var(--wf-accent);
  padding: 0.5rem 1.5rem; margin: 2rem 0;
  font-size: 1.2rem; font-style: italic; color: var(--wf-text);
}
.story-content .pullquote p { text-indent: 0 !important; margin-bottom: 0.4em; }

.story-content aside.editorial-aside {
  border: 1px solid var(--wf-border);
  border-radius: 6px; padding: 1rem 1.25rem; margin: 2rem 0;
  font-size: 0.95rem; color: var(--wf-text);
}
.story-content .editorial-aside p { text-indent: 0 !important; margin-bottom: 0.4em; }

.story-content .literary-mono {
  font-family: var(--wf-font-mono);
  font-size: 0.9rem; margin: 2rem 0;
}
.story-content .literary-mono p {
  text-indent: 0 !important; padding-left: 1.4rem;
  margin-bottom: 0.65em; line-height: 1.6;
}

.story-content .code-block-wrap {
  background: #1e1e1e; border-radius: 8px; margin: 2rem 0;
  overflow: hidden; position: relative;
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
  font-family: var(--wf-font-mono);
  font-size: 0.85rem; white-space: pre; color: #e0e0e0;
  background: transparent; padding: 0;
}

.story-content ul, .story-content ol {
  margin: 1.5rem 0; padding-left: 2rem; text-indent: 0;
}
.story-content ol.list-alpha { list-style-type: lower-alpha; }
.story-content li { margin-bottom: 6px; }

.story-content figure.editorial-figure { margin: 2.5rem 0; display: flex; flex-direction: column; gap: 8px; }
.story-content .editorial-image { width: 100%; height: auto; border-radius: 8px; display: block; }
.story-content .editorial-caption { font-size: 0.88rem; color: var(--wf-text-muted); line-height: 1.4; padding: 0 4px; }
.story-content .caption-credit { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--wf-accent); margin-left: 6px; }

.story-content hr.fleuron-break {
  border: none; height: 1px; background: var(--wf-border);
  width: 33%; margin: 3rem auto; position: relative; overflow: visible;
}
.story-content hr.fleuron-break::after {
  content: "✦"; font-size: 0.6rem; color: var(--wf-accent);
  background-color: var(--wf-bg);
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%); padding: 0 1rem;
}

.story-content p.story-end {
  text-align: center; font-style: italic; color: var(--wf-text-muted);
  margin: 3rem 0; text-indent: 0 !important;
}
.story-content hr.fleuron-end {
  border: none; height: 1px; background: var(--wf-border);
  width: 10%; margin: 5rem auto; position: relative; overflow: visible;
}
.story-content hr.fleuron-end::after {
  content: "✦ ✦ ✦"; font-size: 0.6rem; letter-spacing: 0.5em;
  color: var(--wf-accent); background-color: var(--wf-bg);
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%); padding: 0 1rem; white-space: nowrap;
}

.story-content a.fn-ref {
  text-decoration: none; color: var(--wf-accent); font-size: 0.75em;
  vertical-align: super; line-height: 0;
}
.story-content a.fn-ref:hover { text-decoration: underline; }
.story-content .citations-section {
  margin-top: 3rem; border-top: 1px solid var(--wf-border); padding-top: 1.5rem;
}
.story-content .citations-heading {
  font-size: 0.9rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--wf-text-muted); margin: 0 0 1rem 0;
}
.story-content .citations-list { padding-left: 1.5rem; margin: 0; }
.story-content .citation-entry {
  font-size: 0.9rem; color: var(--wf-text); margin-bottom: 0.5em; line-height: 1.5;
}
.story-content a.fn-return {
  font-size: 0.8rem; color: var(--wf-accent); text-decoration: none; margin-left: 4px;
}
.story-content a.fn-return:hover { text-decoration: underline; }

footer.wf-credit, div.wf-credit {
  max-width: 660px;
  margin: 3rem auto 0 auto;
  padding: 1rem 20px 2rem 20px;
  border-top: 1px solid var(--wf-border);
  font-family: var(--wf-font-body);
  font-size: 0.78rem;
  color: var(--wf-text-muted);
  text-align: left;
}
footer.wf-credit p, div.wf-credit p {
  margin: 0; text-indent: 0 !important;
}
footer.wf-credit a, div.wf-credit a {
  color: var(--wf-accent) !important; text-decoration: none;
}
footer.wf-credit a:hover, div.wf-credit a:hover { color: var(--wf-accent) !important; text-decoration: underline; }
`;

downloadCssBtn?.addEventListener('click', () => {
  const blob = new Blob([BASE_CSS_TEXT], { type: 'text/css;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'story-base.css';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
});

document.addEventListener('DOMContentLoaded', () => {
  const formattingOptions = ['dropcap', 'indent', 'linespacing', 'endhr'];

  formattingOptions.forEach(optionName => {
    const savedValue = localStorage.getItem(`wf_opt_${optionName}`);
    
    if (savedValue) {
      const targetRadio = document.querySelector(`input[name="${optionName}"][value="${savedValue}"]`);
      if (targetRadio) {
        targetRadio.checked = true;
        targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    const radios = document.querySelectorAll(`input[name="${optionName}"]`);
    radios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          localStorage.setItem(`wf_opt_${optionName}`, e.target.value);
        }
      });
    });
  });
});

document.addEventListener('DOMContentLoaded', () => {
  const inputPane = document.getElementById('inputText');
  const previewPane = document.getElementById('livePreview');

  if (!inputPane || !previewPane) return;

  let scrollTimeout;

  function syncPreviewToInputLineImmediate() {
    const text = inputPane.value;
    const cursorIdx = inputPane.selectionStart;
    
    if (!text || cursorIdx === undefined) return;

    const lines = text.split('\n');
    const lineIndex = text.substring(0, cursorIdx).split('\n').length - 1;
    const currentLineText = lines[lineIndex] || '';
    const trimmedLine = currentLineText.trim();
    
    const totalLines = lines.length;
    const isLastLine = lineIndex >= totalLines - 1;
    const isMarkupLine = /^\[\/?[a-z]+\]$/i.test(trimmedLine) || 
                         trimmedLine === '' ||
                         /^\[\/?[a-z]+=/.test(trimmedLine);
    
    const cleanTarget = trimmedLine
      .replace(/\[\/?[a-z]+\]/gi, '')
      .replace(/\[\/?[a-z]+=.*?\]/gi, '')
      .trim();
    
    const elements = previewPane.querySelectorAll('p, h1, h2, h3, h4, blockquote, aside, pre, li, figure, .manuscript-header, .story-title, .story-subtitle, .story-byline, .story-end');
    let bestMatch = null;
    let bestMatchScore = 0;

    elements.forEach(el => {
      const textContent = el.textContent || '';
      
      const isHeader = el.classList?.contains('story-title') || 
                       el.classList?.contains('story-subtitle') || 
                       el.classList?.contains('story-byline') ||
                       el.classList?.contains('manuscript-header');
      
      if (cleanTarget.length > 0 && textContent.includes(cleanTarget.substring(0, 30))) {
        const score = Math.min(cleanTarget.length, textContent.length);
        if (score > bestMatchScore) {
          bestMatchScore = score;
          bestMatch = el;
        }
      } else if (isHeader && lineIndex < 10 && cleanTarget.length < 10) {
        bestMatch = el;
        bestMatchScore = 1;
      }
    });

    if (bestMatch) {
      const elementRect = bestMatch.getBoundingClientRect();
      const previewRect = previewPane.getBoundingClientRect();
      const currentScroll = previewPane.scrollTop;
      const offsetFromTop = 20;
      const targetScroll = currentScroll + elementRect.top - previewRect.top - offsetFromTop;
      
      previewPane.scrollTo({ 
        top: Math.max(0, targetScroll), 
        behavior: 'smooth' 
      });
    } else if (lineIndex === 0 || (lineIndex < 5 && isMarkupLine)) {
      previewPane.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (isLastLine || lineIndex >= totalLines - 2) {
      previewPane.scrollTo({ top: previewPane.scrollHeight, behavior: 'smooth' });
    }
  }

  function syncPreviewToInputLine() {
  clearTimeout(scrollTimeout);
  
  scrollTimeout = setTimeout(() => {
    if (window._skipLinkActive) {
      return;
    }

    const text = inputPane.value;
    const cursorIdx = inputPane.selectionStart;
    
    if (!text || cursorIdx === undefined) return;

    const lines = text.split('\n');
    const lineIndex = text.substring(0, cursorIdx).split('\n').length - 1;
    const currentLineText = lines[lineIndex] || '';
    const trimmedLine = currentLineText.trim();
    
    const isAtEnd = cursorIdx >= text.length - 1;
    const totalLines = lines.length;
    const isLastLine = lineIndex >= totalLines - 1;
    
    const isMarkupLine = /^\[\/?[a-z]+\]$/i.test(trimmedLine) || 
                         trimmedLine === '' ||
                         /^\[\/?[a-z]+=/.test(trimmedLine);
    
    // Handle markup lines (tags only)
    if (isMarkupLine) {
      // Find the next non-markup line to scroll to
      let nextContentLine = lineIndex + 1;
      while (nextContentLine < lines.length) {
        const nextLine = lines[nextContentLine].trim();
        const isNextMarkup = /^\[\/?[a-z]+\]$/i.test(nextLine) || nextLine === '';
        if (!isNextMarkup && nextLine.length > 0) {
          break;
        }
        nextContentLine++;
      }
      
      // Also check previous content line
      let prevContentLine = lineIndex - 1;
      while (prevContentLine >= 0) {
        const prevLine = lines[prevContentLine].trim();
        const isPrevMarkup = /^\[\/?[a-z]+\]$/i.test(prevLine) || prevLine === '';
        if (!isPrevMarkup && prevLine.length > 0) {
          break;
        }
        prevContentLine--;
      }
      
      // Try to match the content before or after the tag
      let targetLine = -1;
      if (nextContentLine < lines.length) {
        targetLine = nextContentLine;
      } else if (prevContentLine >= 0) {
        targetLine = prevContentLine;
      }
      
      if (targetLine !== -1) {
        const targetText = lines[targetLine].trim();
        const cleanTarget = targetText
          .replace(/\[\/?[a-z]+\]/gi, '')
          .replace(/\[\/?[a-z]+=.*?\]/gi, '')
          .trim();
        
        if (cleanTarget) {
          const elements = previewPane.querySelectorAll('p, h1, h2, h3, h4, blockquote, aside, pre, li, figure, .manuscript-header, .story-title, .story-subtitle, .story-byline, .story-end');
          let bestMatch = null;
          
          for (const el of elements) {
            const textContent = el.textContent || '';
            if (textContent.includes(cleanTarget.substring(0, 30))) {
              bestMatch = el;
              break;
            }
          }
          
          if (bestMatch) {
            const elementRect = bestMatch.getBoundingClientRect();
            const previewRect = previewPane.getBoundingClientRect();
            const currentScroll = previewPane.scrollTop;
            const offsetFromTop = 20;
            const targetScroll = currentScroll + elementRect.top - previewRect.top - offsetFromTop;
            previewPane.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
            return;
          }
        }
      }
      
      // If no content found, scroll to a reasonable position based on line index
      const scrollRatio = Math.min(0.95, Math.max(0, lineIndex / totalLines));
      const targetScroll = (previewPane.scrollHeight - previewPane.clientHeight) * scrollRatio;
      previewPane.scrollTo({ top: targetScroll, behavior: 'smooth' });
      return;
    }
    
    if (isAtEnd || (isLastLine && isMarkupLine)) {
      previewPane.scrollTo({ top: previewPane.scrollHeight, behavior: 'smooth' });
      return;
    }
    
    if (lineIndex === 0 && isMarkupLine) {
      let firstContentLine = 0;
      while (firstContentLine < lines.length) {
        const line = lines[firstContentLine].trim();
        const isMarkup = /^\[\/?[a-z]+\]$/i.test(line) || line === '';
        if (!isMarkup && line.length > 0) {
          break;
        }
        firstContentLine++;
      }
      
      if (firstContentLine < lines.length) {
        previewPane.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        previewPane.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }
    
    const cleanTarget = trimmedLine
      .replace(/\[\/?[a-z]+\]/gi, '')
      .replace(/\[\/?[a-z]+=.*?\]/gi, '')
      .trim();
    
    const elements = previewPane.querySelectorAll('p, h1, h2, h3, h4, blockquote, aside, pre, li, figure, .manuscript-header, .story-title, .story-subtitle, .story-byline, .story-end');
    let bestMatch = null;
    let bestMatchScore = 0;

    elements.forEach(el => {
      const textContent = el.textContent || '';
      
      const isEndElement = el.classList?.contains('story-end') || 
                          (el.tagName === 'HR' && el.classList?.contains('fleuron-end'));
      
      if (isEndElement && isLastLine) {
        bestMatch = el;
        bestMatchScore = Infinity;
        return;
      }
      
      const isHeader = el.classList?.contains('story-title') || 
                       el.classList?.contains('story-subtitle') || 
                       el.classList?.contains('story-byline') ||
                       el.classList?.contains('manuscript-header');
      
      if (cleanTarget.length > 0 && textContent.includes(cleanTarget.substring(0, 30))) {
        const score = Math.min(cleanTarget.length, textContent.length);
        if (score > bestMatchScore) {
          bestMatchScore = score;
          bestMatch = el;
        }
      } else if (isHeader && lineIndex < 10 && cleanTarget.length < 10) {
        bestMatch = null;
      }
    });

    if (!bestMatch && trimmedLine.length > 0) {
      const scrollRatio = Math.min(0.95, Math.max(0, lineIndex / totalLines));
      const targetScroll = (previewPane.scrollHeight - previewPane.clientHeight) * scrollRatio;
      previewPane.scrollTo({ top: targetScroll, behavior: 'smooth' });
    } else if (bestMatch) {
      const elementRect = bestMatch.getBoundingClientRect();
      const previewRect = previewPane.getBoundingClientRect();
      const currentScroll = previewPane.scrollTop;
      const offsetFromTop = 20;
      const targetScroll = currentScroll + elementRect.top - previewRect.top - offsetFromTop;
      
      previewPane.scrollTo({ 
        top: Math.max(0, targetScroll), 
        behavior: 'smooth' 
      });
    } else if (lineIndex === 0 || (lineIndex < 5 && isMarkupLine)) {
      previewPane.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (isLastLine || lineIndex >= totalLines - 2) {
      previewPane.scrollTo({ top: previewPane.scrollHeight, behavior: 'smooth' });
    }
  }, 80);
}

  inputPane.addEventListener('click', syncPreviewToInputLine);
  inputPane.addEventListener('keyup', (e) => {
    if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key === 'Backspace' || e.key === 'Enter') {
      syncPreviewToInputLine();
    }
  });
});
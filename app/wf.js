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
  const src = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const tokens = [];

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
    { open: '[c]',              close: '[/c]',              type: 'center'         },
  ];

  const tagByOpen  = {};
  const tagByClose = {};
  for (const bt of BLOCK_TAGS) {
    tagByOpen[bt.open.toLowerCase()]   = bt;
    tagByClose[bt.close.toLowerCase()] = bt;
  }

  function flushLines(lines) {
    let i = 0;
    while (i < lines.length) {
      const t  = lines[i].trim();
      if (t === '') {
        let blanks = 0;
        while (i < lines.length && lines[i].trim() === '') { blanks++; i++; }
        if (blanks >= 3) tokens.push({ type: 'break', content: '' });
        continue;
      }
      if (isSectionBreak(t)) { tokens.push({ type: 'break', content: t }); i++; continue; }

      const isBulletLine = /^[*\-+] \S/.test(t);
      const isNumLine    = /^\d+\. \S/.test(t);
      if (isBulletLine || isNumLine) {
        const listType = isNumLine ? 'num' : 'bullet';
        const items = [];
        while (i < lines.length) {
          const lt = lines[i].trim();
          if (/^[*\-+] \S/.test(lt)) {
            items.push(lt.replace(/^[*\-+] /, ''));
            i++;
          } else if (/^\d+\. \S/.test(lt)) {
            items.push(lt.replace(/^\d+\. /, ''));
            i++;
          } else if (lt === '') {
            if (i + 1 < lines.length && lines[i + 1].trim() === '') break;
            i++;
          } else {
            break;
          }
        }
        tokens.push({ type: listType, rawLines: items, items, centered: false });
        continue;
      }

      tokens.push({ type: 'para', content: t });
      i++;
    }
  }

  function emitBlockToken(bt, body) {
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
      const centerResult = extractCenter(content);
      const listContent = centerResult.centered ? centerResult.content : content;
      const rawLines = listContent.split('\n').filter(l => l.trim() !== '' || /^[ \t]/.test(l));
      tokens.push({ type: bt.type, rawLines, items: rawLines.map(l => l.trim()).filter(Boolean), centered: centerResult.centered });
      return;
    }
    if (bt.type === 'code') {
      tokens.push({ type: 'code', content });
      return;
    }
    tokens.push({ type: bt.type, content: content.trim() });
  }

  const INLINE_OPEN_RE  = /\[(?:b|i|fn|link)\]/gi;
  const INLINE_CLOSE_RE = /\[\/(?:b|i|fn|link)\]/gi;

  function isInsideInlineTag(str, pos) {
    const prefix = str.substring(0, pos);
    const opens  = (prefix.match(INLINE_OPEN_RE)  || []).length;
    const closes = (prefix.match(INLINE_CLOSE_RE) || []).length;
    return opens > closes;
  }

  let remaining = src;

  while (remaining.length > 0) {
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
          break;
        }
        searchFrom = idx + bt.open.length;
      }
    }

    if (earliestIdx === -1) {
      flushLines(remaining.split('\n'));
      break;
    }

    const before = remaining.substring(0, earliestIdx);
    const afterOpen   = remaining.substring(earliestIdx + matchedTag.open.length);
    const closeTagLow = matchedTag.close.toLowerCase();
    const closeIdx    = afterOpen.toLowerCase().indexOf(closeTagLow);

    if (closeIdx === -1) {
      flushLines(remaining.split('\n'));
      break;
    }

    const body  = afterOpen.substring(0, closeIdx);
    const after = afterOpen.substring(closeIdx + matchedTag.close.length);

    if (before.length > 0) {
      flushLines(before.split('\n'));
    }

    emitBlockToken(matchedTag, body);
    remaining = after.startsWith('\n') ? after.substring(1) : after;
  }

  return tokens;
}

function countBodyWords(tokens) {
  const proseTypes = new Set(['para','pullquote','aside','epigraph','mono','center']);
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

function extractCenter(raw) {
  const trimmed = raw.trim();
  const match = trimmed.match(/^\[c\]([\s\S]*?)\[\/c\]$/i);
  if (match) {
    return { centered: true, content: match[1].trim() };
  }
  return { centered: false, content: raw };
}

function renderBlockLines(content, fnMap, extraClass) {
  return content.split('\n').map(l => {
    if (l.trim() === '') return `    <p class="block-spacer"></p>`;
    const cls = extraClass ? ` class="${extraClass}"` : '';
    return `    <p${cls}>${processInline(l, fnMap)}</p>`;
  }).join('\n');
}

function renderPullquote(tok, fnMap) {
  const { centered, content } = extractCenter(tok.content);
  const cls = centered ? ' text-center' : '';
  const rows = renderBlockLines(content, fnMap, centered ? 'text-center' : null);
  return `  <aside class="pullquote${cls}" role="note" aria-label="Pull quote">\n${rows}\n  </aside>`;
}

function renderAside(tok, fnMap) {
  const { centered, content } = extractCenter(tok.content);
  const rows = renderBlockLines(content, fnMap, centered ? 'text-center' : null);
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
  const { centered, content } = extractCenter(tok.content);
  const pCls = centered ? ' class="text-center"' : '';
  const lines = content.split('\n');
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
    .map(l => `    <p${pCls}>${processInline(l, fnMap)}</p>`)
    .join('\n');
  const attrHtml = attrLine
    ? `\n    <footer class="epigraph-attribution"><cite>${processInline(attrLine, fnMap)}</cite></footer>`
    : '';

  return `  <blockquote class="epigraph">\n${quoteHtml}${attrHtml}\n  </blockquote>`;
}

function renderMono(tok, fnMap) {
  const { centered, content } = extractCenter(tok.content);
  let isBoldGlobal = false;
  let isItalicGlobal = false;

  const rows = content.split('\n').map(l => {
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

    const cls = centered ? 'mono-line text-center' : 'mono-line';
    return `    <p class="${cls}">${lineText}</p>`;
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
  const { centered, content } = extractCenter(tok.content);
  const cls = centered ? 'section-heading text-center' : 'section-heading';
  return `  <h2 class="${cls}">${processInline(content, fnMap)}</h2>`;
}

function renderSubsection(tok, fnMap) {
  const { centered, content } = extractCenter(tok.content);
  const cls = centered ? 'subsection-heading text-center' : 'subsection-heading';
  return `  <h3 class="${cls}">${processInline(content, fnMap)}</h3>`;
}

function renderSubsubsection(tok, fnMap) {
  const { centered, content } = extractCenter(tok.content);
  const cls = centered ? 'subsubsection-heading text-center' : 'subsubsection-heading';
  return `  <h4 class="${cls}">${processInline(content, fnMap)}</h4>`;
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
  const rootTag      = tok.type === 'bullet' ? 'ul' : 'ol';
  const centered     = !!tok.centered;
  const rawLines     = tok.rawLines || tok.items;

  const rootClasses  = [];
  if (tok.type === 'alpha') rootClasses.push('list-alpha');
  if (centered)             rootClasses.push('list-centered');
  const rootClass    = rootClasses.length ? ` class="${rootClasses.join(' ')}"` : '';

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

      const text    = line.trim();
      const liClass = centered ? ' class="text-center"' : '';
      if (children.length) {
        const childDepth = depth(children.find(l => l.trim()) || children[0]);
        const childHtml  = buildList(children, childDepth, pad + '  ');
        items.push(`${pad}  <li${liClass}>${processInline(text, fnMap)}\n${childHtml}\n${pad}  </li>`);
      } else {
        items.push(`${pad}  <li${liClass}>${processInline(text, fnMap)}</li>`);
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

// ── THEME SYSTEM (Token-based) ──────────────────────────────────────────────

// Base CSS - all structural rules (shared across all themes)
const BASE_CSS = `

body {
  margin: 0;
  padding: 0;
}

.story-content {
  background-color: var(--wf-bg);
  max-width: 660px;
  margin: 0 auto;
  padding: 40px 20px;
  font-family: var(--wf-font-body);
  font-size: var(--wf-font-size, 1.15rem);
  line-height: 1.65;
  color: var(--wf-text);
}

.preview-panel {
  background-color: var(--wf-bg);
}

#livePreview,
.preview-body {
  background-color: var(--wf-bg);
  min-height: 100%;
  height: 100%;
}

body.standalone {
  background-color: var(--wf-bg);
  min-height: 100vh;
}

.story-content.ls-1   { line-height: 1.4; }
.story-content.ls-1-5 { line-height: 1.65; }
.story-content.ls-2   { line-height: 2.0; }

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

.story-content h1.story-title {
  text-align: center;
  font-size: var(--wf-h1-size, 2.25rem);
  font-weight: 600;
  line-height: 1.2;
  margin: 0 0 0.25em 0;
  color: var(--wf-text);
}
.story-content p.story-subtitle {
  text-align: center;
  font-size: var(--wf-subtitle-size, 1.35rem);
  font-weight: 400;
  font-style: italic;
  color: var(--wf-text-muted);
  margin: 0 0 0.5em 0;
  line-height: 1.3;
  text-indent: 0 !important;
}
.story-content p.story-byline {
  text-align: center;
  font-size: 1rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--wf-text-muted);
  margin: 0 0 1.5em 0;
  text-indent: 0 !important;
}
.story-content hr.title-rule {
  display: none;
}

.story-content h2.section-heading {
  font-size: var(--wf-h2-size, 1.25rem);
  font-weight: 600;
  margin: 2.5rem 0 0.75rem 0;
  color: var(--wf-text);
  letter-spacing: 0.01em;
}
.story-content h3.subsection-heading {
  font-size: var(--wf-h3-size, 1.1rem);
  font-weight: 600;
  font-style: italic;
  margin: 2rem 0 0.5rem 0;
  color: var(--wf-text);
  letter-spacing: 0.01em;
}
.story-content h4.subsubsection-heading {
  font-size: var(--wf-h4-size, 1rem);
  font-weight: 600;
  margin: 1.5rem 0 0.4rem 0;
  color: var(--wf-text);
  letter-spacing: 0.01em;
}

.story-content p {
  margin: 0 0 0.5em 0;
  text-align: justify;
  text-justify: inter-word;
}
.story-content p + p { text-indent: 1.5rem; }
.story-content p.no-indent { text-indent: 0 !important; }
.story-content p.continues  { text-indent: 1.4rem; }
.story-content p.dropcap-paragraph { text-indent: 0; }
.story-content p.dropcap-paragraph::first-letter {
  font-size: var(--wf-dropcap-size, 4.5rem);
  float: left;
  line-height: 0.75;
  margin: 0.1em 0.1rem 0 0;
  color: var(--wf-accent);
  font-weight: var(--wf-dropcap-weight, 600);
  font-family: var(--wf-font-heading, var(--wf-font-body));
}

.story-content blockquote.epigraph {
  margin: 2rem 2rem 2rem 3rem;
  font-style: italic;
  color: var(--wf-text-muted);
  border: none;
  padding: 0;
}
.story-content .epigraph p { text-indent: 0 !important; margin-bottom: 0.4em; }
.story-content .epigraph footer.epigraph-attribution {
  font-size: 0.9rem;
  font-style: normal;
  margin-top: 0.5em;
}

.story-content aside.pullquote {
  border-left: 4px solid var(--wf-accent);
  padding: 0.5rem 1.5rem;
  margin: 2rem 0;
  font-size: var(--wf-pullquote-size, 1.2rem);
  font-style: italic;
  color: var(--wf-text);
}
.story-content .pullquote p { text-indent: 0 !important; margin-bottom: 0.4em; }

.story-content aside.editorial-aside {
  border: 1px solid var(--wf-border);
  border-radius: var(--wf-border-radius, 6px);
  padding: 1rem 1.25rem;
  margin: 2rem 0;
  font-size: 0.95rem;
  color: var(--wf-text);
}
.story-content .editorial-aside p { text-indent: 0 !important; margin-bottom: 0.4em; }

.story-content .literary-mono {
  font-family: var(--wf-font-mono);
  font-size: 0.9rem;
  margin: 2rem 0;
}
.story-content .literary-mono p {
  text-indent: 0 !important;
  padding-left: 1.4rem;
  margin-bottom: 0.65em;
  line-height: 1.6;
}

.story-content .code-block-wrap {
  background: #1e1e1e;
  border-radius: 8px;
  margin: 2rem 0;
  overflow: hidden;
  position: relative;
}
.story-content .code-lang-label {
  display: inline-block;
  font-family: monospace;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #888;
  padding: 6px 0 4px 1rem;
}
.story-content pre.line-numbered-code {
  display: flex;
  flex-direction: column;
  background: transparent;
  color: #e0e0e0;
  padding: 0.5rem 0 1rem 0;
  margin: 0;
  overflow-x: auto;
  white-space: pre;
  text-indent: 0;
}
.story-content .code-row { display: flex; align-items: baseline; min-height: 1.5em; line-height: 1.5; }
.story-content .line-number {
  flex-shrink: 0;
  width: 42px;
  text-align: right;
  padding-right: 12px;
  color: #555;
  user-select: none;
  border-right: 1px solid #333;
  margin-right: 12px;
  font-family: monospace;
  font-size: 0.78rem;
  line-height: 1.5;
}
.story-content .code-row code {
  font-family: var(--wf-font-mono);
  font-size: 0.85rem;
  white-space: pre;
  color: #e0e0e0;
  background: transparent;
  padding: 0;
}

.story-content ul, .story-content ol {
  margin: 1.5rem 0;
  padding-left: 2rem;
  text-indent: 0;
}
.story-content ol.list-alpha { list-style-type: lower-alpha; }
.story-content li { margin-bottom: 6px; }

.story-content figure.editorial-figure { margin: 2.5rem 0; display: flex; flex-direction: column; gap: 8px; }
.story-content .editorial-image { width: 100%; height: auto; border-radius: 8px; display: block; }
.story-content .editorial-caption { font-size: 0.88rem; color: var(--wf-text-muted); line-height: 1.4; padding: 0 4px; }
.story-content .caption-credit { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--wf-accent); margin-left: 6px; }

.story-content hr.fleuron-break {
  border: none;
  height: var(--wf-rule-thickness, 1px);
  background: var(--wf-border);
  width: 33%;
  margin: 3rem auto;
  position: relative;
  overflow: visible;
}
.story-content hr.fleuron-break::after {
  content: var(--wf-fleuron-char, "✦");
  font-size: 0.6rem;
  color: var(--wf-accent);
  background-color: var(--wf-bg);
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 0 1rem;
}

.story-content p.story-end {
  text-align: center;
  font-style: italic;
  color: var(--wf-text-muted);
  margin: 3rem 0;
  text-indent: 0 !important;
}

.story-content .text-center {
  text-align: center !important;
  text-indent: 0 !important;
}
.story-content ul.list-centered,
.story-content ol.list-centered {
  list-style-position: inside;
  padding-left: 0;
}
.story-content ul.list-centered li,
.story-content ol.list-centered li {
  text-align: center;
  list-style-position: inside;
}
.story-content ul.list-centered li ul,
.story-content ul.list-centered li ol,
.story-content ol.list-centered li ul,
.story-content ol.list-centered li ol {
  padding-left: 0;
}

.story-content hr.fleuron-end {
  border: none;
  height: var(--wf-rule-thickness, 1px);
  background: var(--wf-border);
  width: 10%;
  margin: 5rem auto;
  position: relative;
  overflow: visible;
}
.story-content hr.fleuron-end::after {
  content: var(--wf-end-fleuron-char, "✦ ✦ ✦");
  font-size: 0.6rem;
  letter-spacing: 0.5em;
  color: var(--wf-accent);
  background-color: var(--wf-bg);
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 0 1rem;
  white-space: nowrap;
}

.story-content a.fn-ref {
  text-decoration: none;
  color: var(--wf-accent);
  font-size: 0.75em;
  vertical-align: super;
  line-height: 0;
}
.story-content a.fn-ref:hover { text-decoration: underline; }
.story-content .citations-section {
  margin-top: 3rem;
  border-top: var(--wf-rule-thickness, 1px) solid var(--wf-border);
  padding-top: 1.5rem;
}
.story-content .citations-heading {
  font-size: 0.9rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--wf-text-muted);
  margin: 0 0 1rem 0;
}
.story-content .citations-list { padding-left: 1.5rem; margin: 0; }
.story-content .citation-entry {
  font-size: 0.9rem;
  color: var(--wf-text);
  margin-bottom: 0.5em;
  line-height: 1.5;
}
.story-content a.fn-return {
  font-size: 0.8rem;
  color: var(--wf-accent);
  text-decoration: none;
  margin-left: 4px;
}
.story-content a.fn-return:hover { text-decoration: underline; }

footer.wf-credit, div.wf-credit {
  max-width: 660px;
  margin: 3rem auto 0 auto;
  padding: 1rem 20px 2rem 20px;
  border-top: var(--wf-rule-thickness, 1px) solid var(--wf-border);
  font-family: var(--wf-font-body);
  font-size: 0.78rem;
  color: var(--wf-text-muted);
  text-align: left;
}
footer.wf-credit p, div.wf-credit p {
  margin: 0;
  text-indent: 0 !important;
}
footer.wf-credit a, div.wf-credit a {
  color: var(--wf-accent) !important;
  text-decoration: none;
}
footer.wf-credit a:hover, div.wf-credit a:hover {
  color: var(--wf-accent) !important;
  text-decoration: underline;
}

/* Theme overrides for specific elements that need special styling */
.story-content h1.story-title,
.story-content h2.section-heading,
.story-content h3.subsection-heading,
.story-content h4.subsubsection-heading {
  font-family: var(--wf-font-heading, var(--wf-font-body));
}`;

// Theme tokens - only the variables that change between themes
const THEME_TOKENS = {
  'wf-light': {
    name: 'Written & Formatted Light',
    font: {
      body: "'EB Garamond', Georgia, serif",
      heading: "'EB Garamond', Georgia, serif",
      mono: "'Source Code Pro', Consolas, monospace"
    },
    colors: {
      bg: '#f2f1ef',
      text: '#2a1f1c',
      'text-muted': '#6b4e41',
      accent: '#8b5a4a',
      'accent-inline': '#6b3a2a',
      border: '#d9d2cc'
    },
    sizing: {
      'h1-size': '2.25rem',
      'subtitle-size': '1.35rem',
      'h2-size': '1.25rem',
      'h3-size': '1.1rem',
      'h4-size': '1rem',
      'font-size': '1.15rem',
      'pullquote-size': '1.2rem',
      'dropcap-size': '4.5rem',
      'border-radius': '6px',
      'rule-thickness': '1px',
      'rule-width': '80px'
    },
    style: {
      'dropcap-weight': '600',
      'fleuron-char': '"✦"',
      'end-fleuron-char': '"✦ ✦ ✦"'
    }
  },
  
  'wf-dark': {
    name: 'Written & Formatted Dark',
    font: {
      body: "'EB Garamond', Georgia, serif",
      heading: "'EB Garamond', Georgia, serif",
      mono: "'Source Code Pro', Consolas, monospace"
    },
    colors: {
      bg: '#221714',
      text: '#f2f1ef',
      'text-muted': '#d9d2cc',
      accent: '#e8c4a8',
      'accent-inline': '#f2d3b7',
      border: '#4a3a35'
    },
    sizing: {
      'h1-size': '2.25rem',
      'subtitle-size': '1.35rem',
      'h2-size': '1.25rem',
      'h3-size': '1.1rem',
      'h4-size': '1rem',
      'font-size': '1.15rem',
      'pullquote-size': '1.2rem',
      'dropcap-size': '4.5rem',
      'border-radius': '6px',
      'rule-thickness': '1px',
      'rule-width': '80px'
    },
    style: {
      'dropcap-weight': '600',
      'fleuron-char': '"✦"',
      'end-fleuron-char': '"✦ ✦ ✦"'
    }
  },
  
  'modern-light': {
    name: 'Modern Light',
    font: {
      body: "'Plus Jakarta Sans', 'Inter', 'Helvetica Neue', sans-serif",
      heading: "'Plus Jakarta Sans', 'Inter', 'Helvetica Neue', sans-serif",
      mono: "'Source Code Pro', Consolas, monospace"
    },
    colors: {
      bg: '#f8f6f4',
      text: '#2d2d2d',
      'text-muted': '#6b6b6b',
      accent: '#4a7c8c',
      'accent-inline': '#3a6a7a',
      border: '#e0ddd8'
    },
    sizing: {
      'h1-size': '2.2rem',
      'subtitle-size': '1.25rem',
      'h2-size': '1.2rem',
      'h3-size': '1.05rem',
      'h4-size': '0.95rem',
      'font-size': '1.05rem',
      'pullquote-size': '1.1rem',
      'dropcap-size': '4.2rem',
      'border-radius': '8px',
      'rule-thickness': '2px',
      'rule-width': '60px'
    },
    style: {
      'dropcap-weight': '700',
      'fleuron-char': '"◆"',
      'end-fleuron-char': '"◆ ◆ ◆"'
    }
  },
  
  'modern-dark': {
    name: 'Modern Dark',
    font: {
      body: "'Plus Jakarta Sans', 'Inter', 'Helvetica Neue', sans-serif",
      heading: "'Plus Jakarta Sans', 'Inter', 'Helvetica Neue', sans-serif",
      mono: "'Source Code Pro', Consolas, monospace"
    },
    colors: {
      bg: '#1a1a1a',
      text: '#e8e8e8',
      'text-muted': '#a0a0a0',
      accent: '#5a8a9a',
      'accent-inline': '#7aaaba',
      border: '#333333'
    },
    sizing: {
      'h1-size': '2.2rem',
      'subtitle-size': '1.25rem',
      'h2-size': '1.2rem',
      'h3-size': '1.05rem',
      'h4-size': '0.95rem',
      'font-size': '1.05rem',
      'pullquote-size': '1.1rem',
      'dropcap-size': '4.2rem',
      'border-radius': '8px',
      'rule-thickness': '2px',
      'rule-width': '60px'
    },
    style: {
      'dropcap-weight': '700',
      'fleuron-char': '"◆"',
      'end-fleuron-char': '"◆ ◆ ◆"'
    }
  }
};

// Build a complete theme CSS from tokens
function buildThemeCss(themeId) {
  const tokens = THEME_TOKENS[themeId];
  if (!tokens) return buildThemeCss('wf-light');
  
  const { colors, font, sizing, style } = tokens;
  
  // Build variable string
  const vars = [
    // Colors
    `  --wf-bg: ${colors.bg};`,
    `  --wf-text: ${colors.text};`,
    `  --wf-text-muted: ${colors['text-muted']};`,
    `  --wf-accent: ${colors.accent};`,
    `  --wf-accent-inline: ${colors['accent-inline']};`,
    `  --wf-border: ${colors.border};`,
    // Fonts
    `  --wf-font-body: ${font.body};`,
    `  --wf-font-heading: ${font.heading};`,
    `  --wf-font-mono: ${font.mono};`,
    // Sizing
    `  --wf-h1-size: ${sizing['h1-size']};`,
    `  --wf-subtitle-size: ${sizing['subtitle-size']};`,
    `  --wf-h2-size: ${sizing['h2-size']};`,
    `  --wf-h3-size: ${sizing['h3-size']};`,
    `  --wf-h4-size: ${sizing['h4-size']};`,
    `  --wf-font-size: ${sizing['font-size']};`,
    `  --wf-pullquote-size: ${sizing['pullquote-size']};`,
    `  --wf-dropcap-size: ${sizing['dropcap-size']};`,
    `  --wf-border-radius: ${sizing['border-radius']};`,
    `  --wf-rule-thickness: ${sizing['rule-thickness']};`,
    `  --wf-rule-width: ${sizing['rule-width']};`,
    // Style
    `  --wf-dropcap-weight: ${style['dropcap-weight']};`,
    `  --wf-fleuron-char: ${style['fleuron-char']};`,
    `  --wf-end-fleuron-char: ${style['end-fleuron-char']};`
  ].join('\n');
  
  // Return: Instructions + Variables + Base CSS
  return `/* ==========================================================================
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

:root {\n${vars}\n}\n\n${BASE_CSS}`;
}

// ── Style Selector ────────────────────────────────────────────────────────────

const STYLE_KEY = 'written-formatter-style';

function getSelectedStyle() {
  const saved = localStorage.getItem(STYLE_KEY);
  if (saved && THEME_TOKENS[saved]) {
    return saved;
  }
  // Default fallback
  return 'wf-light';
}

function setSelectedStyle(styleId) {
  // Validate the style exists
  if (!THEME_TOKENS[styleId]) {
    styleId = 'wf-light';
  }
  
  // Save to localStorage
  localStorage.setItem(STYLE_KEY, styleId);
  
  // Update the select element if it exists
  const select = document.getElementById('previewStyleSelect');
  if (select) {
    select.value = styleId;
  }
  
  // Update the preview
  convertText();
}

function buildStyleSelector() {
  const select = document.getElementById('previewStyleSelect');
  if (!select) {
    console.warn('Style selector not found in DOM');
    return;
  }

  // Get saved style from localStorage
  const savedStyle = localStorage.getItem(STYLE_KEY);
  let currentStyle = 'wf-light';
  
  // Validate the saved style exists in THEME_TOKENS
  if (savedStyle && THEME_TOKENS[savedStyle]) {
    currentStyle = savedStyle;
  }

  // Set the select value directly
  select.value = currentStyle;

  // Remove any existing listeners by removing and re-adding
  const changeHandler = function(e) {
    const styleId = this.value;
    if (THEME_TOKENS[styleId]) {
      localStorage.setItem(STYLE_KEY, styleId);
      // Update the preview
      convertText();
      showToast(`Style: ${THEME_TOKENS[styleId].name}`);
    }
  };
  
  // Remove old listeners
  select.removeEventListener('change', select._changeHandler);
  select._changeHandler = changeHandler;
  select.addEventListener('change', changeHandler);
}

function getStyleCss(styleId) {
  return buildThemeCss(styleId);
}

// ── convertText (updated to use style) ──────────────────────────────────────

function convertText() {
  const raw = inputText.value;
  if (!raw.trim()) {
    outputHtml.value = '';
    livePreview.innerHTML = '';
    checkAltWarnings('');
    announcePreviewUpdate(0);
    // Remove preview style when empty
    const existingStyle = document.getElementById('preview-style');
    if (existingStyle) existingStyle.remove();
    // Also remove any leftover preview content
    livePreview.className = 'story-content preview-body';
    return;
  }

  const dropcap = getRadio('dropcap');
  const indent  = getRadio('indent');
  const endhr   = getRadio('endhr');
  const spacing = getRadio('linespacing');
  const styleId = getSelectedStyle();

  const tokens = tokenize(raw);
  const fnMap     = buildFnMap(tokens);
  const wordCount = countBodyWords(tokens);

  const HEADER_TYPES = new Set(['title', 'subtitle', 'byline', 'manuscript']);
  const BLOCK_TYPES  = new Set(['pullquote','aside','epigraph','mono','code','image',
                                 'bullet','num','alpha','section','subsection',
                                 'subsubsection','citations','manuscript','center']);

  let paraIndex = 0;
  let nextAfterBreak = false;
  const paraMap = [];
  let afterBlock = false;

  for (const tok of tokens) {
    if (HEADER_TYPES.has(tok.type)) continue;
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

  let inHeader = false;
  let mainOpen = false;
  let pIdx = 0;

  const msTok = tokens.find(t => t.type === 'manuscript');

  function ensureHeader() {
    if (!inHeader) {
      out.push(`  <header class="story-header">`);
      if (msTok) out.push(renderManuscript(msTok, wordCount));
      inHeader = true;
    }
  }

  function closeHeaderOpenMain() {
    if (inHeader) {
      out.push(`  </header>`);
      inHeader = false;
    }
    if (!mainOpen) {
      out.push(`  <main class="story-body">`);
      mainOpen = true;
    }
  }

  for (const tok of tokens) {
    if (tok.type === 'manuscript') {
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

    closeHeaderOpenMain();

    if (tok.type === 'break') {
      out.push(`  <hr class="fleuron-break" aria-label="Section break">`);
      continue;
    }
    if (tok.type === 'ending') {
      if (tok.content) {
        const { centered, content: endContent } = extractCenter(tok.content);
        const endCls = centered ? 'story-end text-center' : 'story-end';
        out.push(`  <p class="${endCls}">${processInline(endContent, fnMap)}</p>`);
      }
      if (endhr === 'yes') out.push(`  <hr class="fleuron-end" aria-hidden="true">`);
      continue;
    }
    if (tok.type === 'center') {
      const lines = tok.content.split('\n');
      const rendered = lines.map(l => {
        if (l.trim() === '') return `  <p class="block-spacer"></p>`;
        return `  <p class="text-center no-indent">${processInline(l.trim(), fnMap)}</p>`;
      }).join('\n');
      out.push(rendered);
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
  
  updatePreview(html, lsClass, styleId);
}

function updatePreview(html, lsClass, styleId) {
  const styleCss = buildThemeCss(styleId);
  
  // Remove existing preview style if it exists
  let existingStyle = document.getElementById('preview-style');
  if (existingStyle) {
    existingStyle.remove();
  }
  
  // Create and inject the new style
  const styleEl = document.createElement('style');
  styleEl.id = 'preview-style';
  styleEl.textContent = styleCss;
  document.head.appendChild(styleEl);
  
  // Override preview-specific styles
  const previewOverride = document.createElement('style');
  previewOverride.id = 'preview-override';
  previewOverride.textContent = `
    #livePreview.story-content {
      max-width: 100% !important;
      margin: 0 !important;
      padding: var(--space-md) !important;
      background-color: var(--wf-bg);
    }
  `;
  document.head.appendChild(previewOverride);
  
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

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

inputText.addEventListener('input', () => {
  scheduleConvert();
  scheduleAutosave();
});

document.querySelectorAll('input[type="radio"]').forEach(r => r.addEventListener('change', convertText));

// ── Toolbar ──────────────────────────────────────────────────────────────────

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
  { label: 'Center',    title: 'Insert [c] centered block', action: () => wrapSelection('[c]',          '[/c]',          true) },
  { label: 'Code',       title: 'Insert [code] block',       action: () => wrapSelection('[code]',       '[/code]',       true) },
  { label: '⊞ Image',   title: 'Insert [image] block',      action: () => openImageModal() },
  { label: '• List',     title: 'Insert [bullet] list',      action: () => insertList('bullet') },
  { label: '1. List',    title: 'Insert [num] list',         action: () => insertList('num') },
  { label: 'a. List',    title: 'Insert [alpha] list',       action: () => insertList('alpha') },
  { label: '→ Indent',   title: 'Indent selected lines (nest list items)', action: () => indentLines('in') },
  { label: '← Dedent',   title: 'Dedent selected lines',    action: () => indentLines('out') },
  { label: 'B',          title: 'Bold [b]',                  action: () => wrapSelection('[b]', '[/b]'),  bold: true },
  { label: 'I',          title: 'Italic [i]',                action: () => wrapSelection('[i]', '[/i]'),  italic: true },
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

// ── Modal Management ─────────────────────────────────────────────────────────

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

// ── Link Modal ──────────────────────────────────────────────────────────────

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

// ── Image Modal ─────────────────────────────────────────────────────────────

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

// ── Manuscript Modal ────────────────────────────────────────────────────────

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

// ── Modal Setup ─────────────────────────────────────────────────────────────

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

// ── View Modals ─────────────────────────────────────────────────────────────

function getDocTitle() {
  const titleEl = livePreview.querySelector('h1.story-title');
  return titleEl ? titleEl.textContent.trim() : null;
}

function getDocSubtitle() {
  const subEl = livePreview.querySelector('p.story-subtitle');
  return subEl ? subEl.textContent.trim() : null;
}

function getFirstImageSrc() {
  const imgEl = livePreview.querySelector('img.editorial-image[src]:not([src=""])');
  return imgEl ? imgEl.getAttribute('src') : null;
}

function getDownloadFilename(type) {
  const title = getDocTitle();
  if (title) {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `${slug}-${type}.html`;
  }
  return `story-${type}.html`;
}

function getEmbedHtml() {
  const creditDiv = `<div class="wf-credit" aria-label="Formatted by Written &amp; Formatted">
  <p>Page formatted by <a href="https://samoff.com/written/app" target="_blank" rel="noopener">Written &amp; Formatted</a>. &copy; Tim Samoff.</p>
</div>`;
  return outputHtml.value + '\n' + creditDiv;
}

function getStandaloneHtml() {
  const title       = getDocTitle() || 'Story';
  const subtitle    = getDocSubtitle();
  const imageSrc    = getFirstImageSrc();
  const siteName    = 'Written & Formatted';
  const description = subtitle || title;
  const styleId     = getSelectedStyle();
  const styleCss    = buildThemeCss(styleId);
  const styleName   = THEME_TOKENS[styleId]?.name || 'Written & Formatted Light';

  const ogImage = imageSrc
    ? `\n  <meta property="og:image" content="${escAttr(imageSrc)}">
  <meta name="twitter:image" content="${escAttr(imageSrc)}">`
    : '';

  const storyFooter = `<footer class="wf-credit" aria-label="Formatted by Written &amp; Formatted">
  <p>Page formatted by <a href="https://samoff.com/written/app" target="_blank" rel="noopener">Written &amp; Formatted</a> &bull; ${styleName} &bull; &copy; Tim Samoff.</p>
</footer>`;

  const fontLink = styleId.startsWith('modern') 
    ? `<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">`
    : `<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap" rel="stylesheet">`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escAttr(description)}">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escAttr(title)}">
  <meta property="og:description" content="${escAttr(description)}">
  <meta property="og:site_name" content="${escAttr(siteName)}">${ogImage}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="${imageSrc ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${escAttr(title)}">
  <meta name="twitter:description" content="${escAttr(description)}">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  ${fontLink}
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css">
  <style>
${styleCss}
  </style>
</head>
<body class="standalone">
${outputHtml.value}
${storyFooter}
</body>
</html>`;
}

function openViewModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  if (modalId === 'viewStandaloneModal') {
    document.getElementById('viewStandaloneContent').value = getStandaloneHtml();
  } else if (modalId === 'viewEmbedModal') {
    document.getElementById('viewEmbedContent').value = getEmbedHtml();
  } else if (modalId === 'viewCssModal') {
    document.getElementById('viewCssContent').value = buildThemeCss(getSelectedStyle());
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

// ── Markdown Conversion Functions ──────────────────────────────────────────

function markdownToWF(raw) {
  raw = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw.split('\n');
  const out   = [];
  let i = 0;

  function convertInline(str) {
    str = str.replace(/\*\*(.+?)\*\*/g,  '[b]$1[/b]');
    str = str.replace(/__(.+?)__/g,       '[b]$1[/b]');
    str = str.replace(/\*(.+?)\*/g,       '[i]$1[/i]');
    str = str.replace(/_(.+?)_/g,         '[i]$1[/i]');
    str = str.replace(/`([^`]+)`/g,       '$1');
    str = str.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) =>
      `\n[image]\nsource: ${src}\nalt: ${alt}\n[/image]\n`
    );
    str = str.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '[link]$1 -> $2[/link]');
    return str;
  }

  function listMatch(line) {
    const bullet = line.match(/^([ \t]*)[*\-+] (.*)$/);
    if (bullet) return { type: 'bullet', depth: bullet[1].replace(/\t/g, '  ').length, text: bullet[2] };
    const num    = line.match(/^([ \t]*)\d+\. (.*)$/);
    if (num)    return { type: 'num',    depth: num[1].replace(/\t/g, '  ').length,    text: num[2] };
    return null;
  }

  function consumeList() {
    const items  = [];
    let listType = null;
    while (i < lines.length) {
      const m = listMatch(lines[i]);
      if (!m) break;
      if (!listType) listType = m.type;
      items.push(' '.repeat(m.depth) + convertInline(m.text.trim()));
      i++;
    }
    const tag = listType === 'num' ? 'num' : 'bullet';
    return `[${tag}]\n${items.join('\n')}\n[/${tag}]`;
  }

  function consumeBlockquote() {
    const bqLines = [];
    while (i < lines.length && /^> ?/.test(lines[i])) {
      bqLines.push(convertInline(lines[i].replace(/^> ?/, '')));
      i++;
    }
    return `[aside]\n${bqLines.join('\n')}\n[/aside]`;
  }

  function consumeCodeFence(fence) {
    const lang = fence.replace(/^`{3,}/, '').trim();
    i++;
    const codeLines = [];
    while (i < lines.length && !/^`{3,}/.test(lines[i])) {
      codeLines.push(lines[i]);
      i++;
    }
    if (i < lines.length) i++;
    const langHint = lang ? `// lang: ${lang}\n` : '';
    return `[code]\n${langHint}${codeLines.join('\n')}\n[/code]`;
  }

  function consumeTable() {
    const tableLines = [];
    while (i < lines.length && /\|/.test(lines[i])) {
      const row = lines[i];
      if (/^\|?[\s\-:|]+\|/.test(row)) { i++; continue; }
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length) tableLines.push(cells.join('  '));
      i++;
    }
    return tableLines.join('\n');
  }

  while (i < lines.length) {
    const line    = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') { out.push(''); i++; continue; }

    if (/^`{3,}/.test(trimmed)) { out.push(consumeCodeFence(trimmed)); continue; }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text  = convertInline(heading[2]);
      if      (level === 1) out.push(`[title]\n${text}\n[/title]`);
      else if (level === 2) out.push(`[section]\n${text}\n[/section]`);
      else if (level === 3) out.push(`[subsection]\n${text}\n[/subsection]`);
      else                  out.push(`[subsubsection]\n${text}\n[/subsubsection]`);
      i++; continue;
    }

    if (i + 1 < lines.length) {
      const next = lines[i + 1];
      if (/^=+\s*$/.test(next)) {
        out.push(`[title]\n${convertInline(trimmed)}\n[/title]`);
        i += 2; continue;
      }
      if (/^-+\s*$/.test(next) && trimmed.length > 0 && !listMatch(line)) {
        out.push(`[section]\n${convertInline(trimmed)}\n[/section]`);
        i += 2; continue;
      }
    }

    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed.replace(/\s/g, ''))) {
      out.push('[break]'); i++; continue;
    }

    if (/^> ?/.test(trimmed)) { out.push(consumeBlockquote()); continue; }

    if (/\|/.test(trimmed)) { out.push(consumeTable()); continue; }

    if (listMatch(line)) { out.push(consumeList()); continue; }

    if (/^!/.test(trimmed)) {
      const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
      if (imgMatch) {
        const alt = imgMatch[1];
        const src = imgMatch[2];
        let caption = '';
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === '') j++;
        if (j < lines.length) {
          const nextLine = lines[j].trim();
          const capMatch = nextLine.match(/^\*([^*]+)\*$/) || nextLine.match(/^_([^_]+)_$/);
          if (capMatch) { caption = capMatch[1]; i = j; }
        }
        const captionLine = caption ? `\ncaption: ${caption}` : '';
        out.push(`[image]\nsource: ${src}\nalt: ${alt}${captionLine}\n[/image]`);
        i++; continue;
      }
    }

    out.push(convertInline(trimmed));
    i++;
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function wrapLooseBullets(text) {
  const lines = text.split('\n');
  const out   = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t    = line.trim();
    const isBullet = /^[*\-+] \S/.test(t);
    const isNum    = /^\d+\. \S/.test(t);
    if (isBullet || isNum) {
      const tag   = isNum ? 'num' : 'bullet';
      const items = [];
      while (i < lines.length) {
        const lt = lines[i].trim();
        if (/^[*\-+] \S/.test(lt)) { items.push(lt.replace(/^[*\-+] /, '')); i++; }
        else if (/^\d+\. \S/.test(lt)) { items.push(lt.replace(/^\d+\. /, '')); i++; }
        else if (lt === '' && i + 1 < lines.length && /^[*\-+] \S|^\d+\. \S/.test(lines[i + 1].trim())) { i++; }
        else break;
      }
      out.push(`[${tag}]\n${items.join('\n')}\n[/${tag}]`);
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join('\n');
}

function looksLikeMarkdown(text) {
  return (
    /^#{1,4} /m.test(text)          ||
    /^[*\-+] \S/m.test(text)        ||
    /^\d+\. \S/m.test(text)         ||
    /\*\*[^*]+\*\*/.test(text)      ||
    /^> /m.test(text)               ||
    /^`{3}/m.test(text)             ||
    /\[.+\]\(.+\)/.test(text)
  );
}

function stripAIPreamble(text) {
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n');
  let firstContentLine = -1;

  const contentStart = /^\[(title|subtitle|byline|section|subsection|subsubsection|pullquote|aside|epigraph|mono|center|code|image|bullet|num|alpha|end|break|manuscript|citations)\]/i;
  const mdHeading    = /^#{1,4} /;

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (contentStart.test(t) || mdHeading.test(t)) {
      if (/^\[break\]$/i.test(t)) {
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === '') j++;
        if (j < lines.length && /^\[title\]/i.test(lines[j].trim())) {
          firstContentLine = j;
          break;
        }
      }
      firstContentLine = i;
      break;
    }
  }

  if (firstContentLine <= 0) return { cleaned: text, stripped: false };

  const preamble = lines.slice(0, firstContentLine).join('\n');
  if (/\[\/?(b|i|fn|link)\]/i.test(preamble)) return { cleaned: text, stripped: false };

  return {
    cleaned: lines.slice(firstContentLine).join('\n').replace(/^\n+/, ''),
    stripped: true,
  };
}

// ── Setup ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  buildToolbar();
  setupModals();
  setupPreviewModal();
  setupViewModals();
  setupHelpModal();
  buildStyleSelector();
  loadFromLocalStorage();
  
  // Fix cursor position when tabbing into textarea without scrolling
  inputText.addEventListener('focus', () => {
    window._programmaticFocus = true;
    const currentScrollTop = inputText.scrollTop;
    inputText.setSelectionRange(0, 0);
    inputText.scrollTop = currentScrollTop;
    setTimeout(() => {
      window._programmaticFocus = false;
    }, 200);
  });
  
  inputText.addEventListener('scroll', (e) => {
    if (window._programmaticFocus) {
      e.preventDefault();
      if (inputText.scrollTop !== 0) {
        inputText.scrollTop = 0;
      }
    }
  }, { passive: false });
  
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

// ── localStorage for options ──────────────────────────────────────────────────

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

// ── Preview scroll sync ──────────────────────────────────────────────────────

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
      
      if (isMarkupLine) {
        let nextContentLine = lineIndex + 1;
        while (nextContentLine < lines.length) {
          const nextLine = lines[nextContentLine].trim();
          const isNextMarkup = /^\[\/?[a-z]+\]$/i.test(nextLine) || nextLine === '';
          if (!isNextMarkup && nextLine.length > 0) {
            break;
          }
          nextContentLine++;
        }
        
        let prevContentLine = lineIndex - 1;
        while (prevContentLine >= 0) {
          const prevLine = lines[prevContentLine].trim();
          const isPrevMarkup = /^\[\/?[a-z]+\]$/i.test(prevLine) || prevLine === '';
          if (!isPrevMarkup && prevLine.length > 0) {
            break;
          }
          prevContentLine--;
        }
        
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

      function normalizeForMatch(str) {
        return str
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      }

      const normalizedTarget = normalizeForMatch(cleanTarget);
      const targetWords = normalizedTarget.split(/\s+/).filter(w => w.length > 3);

      const elements = previewPane.querySelectorAll('p, h1, h2, h3, h4, blockquote, aside, pre, li, figure, .manuscript-header, .story-title, .story-subtitle, .story-byline, .story-end');
      let bestMatch = null;
      let bestMatchScore = 0;

      elements.forEach(el => {
        const textContent = el.textContent || '';
        const normalizedContent = normalizeForMatch(textContent);
        
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
        
        if (cleanTarget.length > 0) {
          if (normalizedContent.includes(normalizedTarget) && normalizedTarget.length > 0) {
            const score = normalizedTarget.length;
            if (score > bestMatchScore) {
              bestMatchScore = score;
              bestMatch = el;
            }
          } else if (targetWords.length > 0) {
            let matchCount = 0;
            for (const word of targetWords) {
              if (normalizedContent.includes(word)) {
                matchCount++;
              }
            }
            const score = matchCount / targetWords.length;
            if (score > bestMatchScore && score > 0.3) {
              bestMatchScore = score;
              bestMatch = el;
            }
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

// ── Markdown / AI-preamble paste interception ─────────────────────────────

inputText.addEventListener('paste', (e) => {
  let raw = e.clipboardData && e.clipboardData.getData('text/plain');
  if (raw) raw = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (!raw || !raw.trim()) {
    const html = e.clipboardData && e.clipboardData.getData('text/html');
    if (html && html.trim()) {
      const tmp = document.createElement('div');
      tmp.innerHTML = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n')
        .replace(/<\/blockquote>/gi, '\n')
        .replace(/<\/pre>/gi, '\n');
      raw = tmp.textContent || tmp.innerText || '';
    }
  }

  if (!raw || !raw.trim()) return;

  const { cleaned, stripped } = stripAIPreamble(raw);
  const needsConversion = looksLikeMarkdown(cleaned);
  if (!stripped && !needsConversion) return;

  e.preventDefault();
  e.stopImmediatePropagation();

  const result = needsConversion ? wrapLooseBullets(markdownToWF(cleaned)) : wrapLooseBullets(cleaned);

  const start = inputText.selectionStart;
  const end   = inputText.selectionEnd;
  const before = inputText.value.substring(0, start);
  const after  = inputText.value.substring(end);
  inputText.value = before + result + after;
  const newCursor = start + result.length;
  inputText.setSelectionRange(newCursor, newCursor);

  inputText.dispatchEvent(new Event('input'));
  scheduleAutosave();

  let msg;
  if (stripped && needsConversion)  msg = 'Markdown converted to WF syntax';
  else if (stripped)                 msg = 'AI preamble removed from pasted text';
  else                               msg = 'Markdown converted to WF syntax';
  showToast(msg);
}, true);

// ── Copy and Download Button Listeners ─────────────────────────────────────

copyBtn?.addEventListener('click', () => {
  copyToClipboard(outputHtml.value, 'HTML');
});

copyCleanBtn?.addEventListener('click', () => {
  copyToClipboard(getCleanHtml(), 'Clean HTML');
});

downloadBtn?.addEventListener('click', () => {
  triggerDownload(outputHtml.value, 'story.html');
});

downloadCleanBtn?.addEventListener('click', () => {
  triggerDownload(getCleanHtml(), 'story-clean.html');
});

downloadCssBtn?.addEventListener('click', () => {
  const css = buildThemeCss(getSelectedStyle());
  triggerDownload(css, 'story-base.css');
});
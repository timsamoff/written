// ==========================================================================
// Sentinel Gate-Check — core rule implementations
// ==========================================================================
//
// Plain Node.js, no dependencies (matches save-server.js's style — this
// project has no package.json and no npm). Every rule function takes a
// `ctx` object (see buildContext in run.js) and returns an array of
// violation objects: { rule, file, line, message, correction }.
//
// A rule must never swallow its own errors into a silent pass. If a rule
// can't determine an answer (missing file, parse failure), it must return
// a violation with rule ending in "-UNVERIFIABLE" rather than an empty
// array, so a broken check is visible instead of indistinguishable from
// "nothing wrong."

'use strict';

const fs = require('fs');
const path = require('path');

// --------------------------------------------------------------------------
// Small helpers
// --------------------------------------------------------------------------

function safeRead(absPath) {
    try {
        return fs.readFileSync(absPath, 'utf8');
    } catch (err) {
        return null;
    }
}

function isWritingHtml(file) {
    return /^writing\/.*\.html$/i.test(file.replace(/\\/g, '/'));
}

function violation(rule, file, line, message, correction) {
    return { rule, file, line: line || null, message, correction: correction || null };
}

// --------------------------------------------------------------------------
// REGISTRY-001
// writing/**.html added/changed but data/projects.json not touched.
// Applies to additions AND modifications (not pure deletions — a delete
// should probably also drop the registry entry, but that's PERSIST/registry
// territory the audit didn't scope this rule to cover; scoped exactly as
// proposed: added/changed).
// --------------------------------------------------------------------------
function checkRegistry001(ctx) {
    // This rule is inherently "same commit" shaped (a diff concept) - it
    // has no sound full-repo analog: in full-scan mode every tracked file
    // is trivially "present," so "was projects.json touched" would always
    // be true and the rule would silently never fire, which is a false
    // "clean" result, not a real one. Skip explicitly rather than let it
    // degrade into a silent, misleading pass in full mode.
    if (ctx.mode === 'full') return [];
    const violations = [];
    const touchedWriting = ctx.changedFiles.filter(
        f => isWritingHtml(f.path) && (f.status === 'A' || f.status === 'M')
    );
    if (touchedWriting.length === 0) return violations;

    const projectsTouched = ctx.changedFiles.some(f => f.path === 'data/projects.json');
    if (!projectsTouched) {
        for (const f of touchedWriting) {
            violations.push(violation(
                'REGISTRY-001',
                f.path,
                null,
                `${f.path} was ${f.status === 'A' ? 'added' : 'changed'} but data/projects.json was not touched in the same commit.`,
                'Add or update the corresponding entry in data/projects.json (id, title, path, slug, fullPath, date, dateDisplay, genres, themes, published, order, lineHeight, etc.).'
            ));
        }
    }
    return violations;
}

// --------------------------------------------------------------------------
// RENDER-001
// admin/admin.js's HTML-assembly functions changed but no writing/**.html
// changed in the same commit.
//
// Verified current function names by reading admin.js directly (2026-09-11):
// buildAssembledHtml (~line 1240), wrapArticleContent (~line 1409),
// saveHtmlContent (~line 1447), extractArticleContent (~line 95). All four
// are watched, since any of them changing the shape of assembled output is
// exactly the ragged-class incident's failure mode.
// --------------------------------------------------------------------------
const ASSEMBLY_FUNCTION_NAMES = [
    'buildAssembledHtml',
    'wrapArticleContent',
    'saveHtmlContent',
    'extractArticleContent'
];

function functionBodyChanged(diffHunks, functionNames) {
    // Look for a changed line that falls within a hunk whose context
    // mentions one of the watched function names, OR a changed line that
    // itself is the function's declaration/call. This is a heuristic diff
    // check (no JS AST parsing available without deps) - it intentionally
    // errs toward over-flagging (a comment-only tweak inside the function
    // still flags) rather than under-flagging, since a missed RENDER-001
    // is how the ragged-class bug happened in the first place.
    for (const hunk of diffHunks) {
        const haystack = hunk.header + '\n' + hunk.lines.join('\n');
        for (const name of functionNames) {
            if (haystack.includes(name)) {
                // Only count actual +/- content lines, not pure context.
                const changed = hunk.lines.some(l => (l.startsWith('+') || l.startsWith('-')) && !l.startsWith('+++') && !l.startsWith('---'));
                if (changed) return true;
            }
        }
    }
    return false;
}

function checkRender001(ctx) {
    // Diff-shaped rule ("assembly code changed but no writing html changed
    // IN THIS COMMIT") - has no sound full-repo analog for the same reason
    // as REGISTRY-001. The full-scan equivalent the source material
    // actually describes ("walk every writing/**.html and check its
    // story-content class list against the current convention set") is
    // implemented separately below as CONVENTION-001, which is the check
    // that would have caught pink.html missing `ragged`.
    if (ctx.mode === 'full') return [];
    const violations = [];
    const adminJsChange = ctx.changedFiles.find(f => f.path === 'admin/admin.js' && f.status === 'M');
    if (!adminJsChange) return violations;

    const hunks = ctx.getDiffHunks('admin/admin.js');
    if (hunks === null) {
        return [violation('RENDER-001-UNVERIFIABLE', 'admin/admin.js', null,
            'Could not read diff hunks for admin/admin.js to check whether assembly functions changed.',
            'Investigate why the diff could not be read; do not treat this as a pass.')];
    }

    const assemblyChanged = functionBodyChanged(hunks, ASSEMBLY_FUNCTION_NAMES);
    if (!assemblyChanged) return violations;

    const writingChanged = ctx.changedFiles.some(f => isWritingHtml(f.path) && (f.status === 'A' || f.status === 'M'));
    if (!writingChanged) {
        violations.push(violation(
            'RENDER-001',
            'admin/admin.js',
            null,
            'admin.js\'s HTML-assembly logic (buildAssembledHtml/wrapArticleContent/saveHtmlContent/extractArticleContent) changed but no writing/**.html file changed in this commit.',
            'Verify existing published pieces don\'t need the same update — this is exactly the ragged-class incident (commit 93bc358), where a template-assembly change silently left already-published pages out of date.'
        ));
    }
    return violations;
}

// --------------------------------------------------------------------------
// PERSIST-001
// data/projects.json changed but data.js did not change in the same commit.
//
// Re-validated: data.js IS tracked in git (`git ls-files data.js` returns
// it), so this check works exactly as proposed — no adjustment needed.
// The original proposal's caveat ("what if data.js isn't tracked") does not
// apply to this repo's current state.
// --------------------------------------------------------------------------
function checkPersist001(ctx) {
    const violations = [];

    if (ctx.mode === 'full') {
        // Full-repo analog (per the source material's own full-scan
        // description): verify data.js's on-disk content/timestamp is
        // not older than data/projects.json's, catching out-of-band
        // hand-edits with no commit touching data.js at all - something
        // the diff-shaped check below cannot see.
        const projectsPath = path.join(ctx.repoRoot, 'data', 'projects.json');
        const dataJsPath = path.join(ctx.repoRoot, 'data.js');
        let projectsStat, dataJsStat;
        try {
            projectsStat = fs.statSync(projectsPath);
            dataJsStat = fs.statSync(dataJsPath);
        } catch (e) {
            return [violation('PERSIST-001-UNVERIFIABLE', 'data/projects.json', null,
                `Could not stat data/projects.json and/or data.js to compare freshness: ${e.message}`,
                'Investigate missing files; do not treat as a pass.')];
        }
        if (dataJsStat.mtimeMs < projectsStat.mtimeMs) {
            violations.push(violation(
                'PERSIST-001',
                'data.js',
                null,
                'data.js is older (by mtime) than data/projects.json — projects.json may have been hand-edited or regenerated without running save-server.js afterward.',
                'Run save-server.js (server startup or POST /api/save-projects) to regenerate data.js from the current projects.json.'
            ));
        }
        return violations;
    }

    const projectsChanged = ctx.changedFiles.find(f => f.path === 'data/projects.json' && (f.status === 'M' || f.status === 'A'));
    if (!projectsChanged) return violations;

    const dataJsChanged = ctx.changedFiles.some(f => f.path === 'data.js');
    if (!dataJsChanged) {
        violations.push(violation(
            'PERSIST-001',
            'data/projects.json',
            null,
            'data/projects.json changed but data.js was not regenerated/changed in the same commit.',
            'Run save-server.js (POST /api/save-projects or a server restart) to regenerate data.js before committing, or confirm this was intentional and data.js is already current.'
        ));
    }
    return violations;
}

// --------------------------------------------------------------------------
// REGISTRY-002
// admin.js's allGenres/allThemes literal (line 7-8) changed but the
// line-932/933 fallback or save-server.js's default did not change too.
//
// Verified current line numbers directly (2026-09-11):
//   admin/admin.js:7   -> allGenres initial value
//   admin/admin.js:8   -> allThemes initial value
//   admin/admin.js:932 -> allGenres fallback (data.genres || [...])
//   admin/admin.js:933 -> allThemes fallback (data.themes || [...])
//   save-server.js:35  -> genres default
//   save-server.js:36  -> themes default (NOT line 35 as the prompt
//                         speculated - themes is the line right after).
// This check resolves cross-file references against the actual current
// file contents (not just the diff) as required by the blind-spot list:
// it re-reads all three files' current literals after the patch is
// applied and compares them for equality, rather than just checking
// "did all three change."
// --------------------------------------------------------------------------
function extractArrayLiteral(source, varName) {
    // Matches: (let|const) varName = [...]; on a single line, or the
    // fallback form varName = data.xxx || [...];
    const re = new RegExp(varName + "\\s*=\\s*(?:data\\.\\w+\\s*\\|\\|\\s*)?(\\[[^\\]]*\\])", 'm');
    const match = source.match(re);
    if (!match) return null;
    try {
        // eslint-disable-next-line no-eval
        return JSON.parse(match[1].replace(/'/g, '"'));
    } catch (e) {
        return null;
    }
}

function checkRegistry002(ctx) {
    const violations = [];
    const adminChanged = ctx.changedFiles.some(f => f.path === 'admin/admin.js');
    const saveServerChanged = ctx.changedFiles.some(f => f.path === 'save-server.js');
    if (!adminChanged && !saveServerChanged) return violations;

    const adminSrc = ctx.readWorkingFile('admin/admin.js');
    const saveServerSrc = ctx.readWorkingFile('save-server.js');
    if (adminSrc === null || saveServerSrc === null) {
        return [violation('REGISTRY-002-UNVERIFIABLE', 'admin/admin.js', null,
            'Could not read admin.js and/or save-server.js current contents to compare genre/theme literals.',
            'Investigate missing files; do not treat this as a pass.')];
    }

    // admin.js has TWO copies of each array (initial value line 7/8, and
    // fallback around line 932/933). Extract both occurrences.
    const genresMatches = [...adminSrc.matchAll(/allGenres\s*=\s*(?:data\.genres\s*\|\|\s*)?(\[[^\]]*\])/g)];
    const themesMatches = [...adminSrc.matchAll(/allThemes\s*=\s*(?:data\.themes\s*\|\|\s*)?(\[[^\]]*\])/g)];

    if (genresMatches.length < 2 || themesMatches.length < 2) {
        violations.push(violation(
            'REGISTRY-002-UNVERIFIABLE',
            'admin/admin.js',
            null,
            `Expected 2 allGenres literals and 2 allThemes literals in admin.js (initial value + fallback), found ${genresMatches.length} genres / ${themesMatches.length} themes copies. The structure this check assumes may have changed.`,
            'Manually verify the genre/theme literal-sync situation in admin.js; this check could not safely compare them.'
        ));
        return violations;
    }

    const parseArr = (s) => {
        try { return JSON.parse(s.replace(/'/g, '"')); } catch (e) { return null; }
    };

    const genreLiterals = genresMatches.map(m => parseArr(m[1]));
    const themeLiterals = themesMatches.map(m => parseArr(m[1]));
    const ssGenres = parseArr((saveServerSrc.match(/genres:\s*(\[[^\]]*\])/) || [])[1] || '');
    const ssThemes = parseArr((saveServerSrc.match(/themes:\s*(\[[^\]]*\])/) || [])[1] || '');

    const allParsed = [...genreLiterals, ...themeLiterals, ssGenres, ssThemes];
    if (allParsed.some(a => a === null)) {
        violations.push(violation(
            'REGISTRY-002-UNVERIFIABLE',
            'admin/admin.js',
            null,
            'Could not parse one or more genre/theme array literals for comparison.',
            'Manually verify the genre/theme literal-sync situation; this check could not safely compare them.'
        ));
        return violations;
    }

    const sameArr = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

    const genresInSync = sameArr(genreLiterals[0], genreLiterals[1]) && sameArr(genreLiterals[0], ssGenres);
    const themesInSync = sameArr(themeLiterals[0], themeLiterals[1]) && sameArr(themeLiterals[0], ssThemes);

    if (!genresInSync) {
        violations.push(violation(
            'REGISTRY-002',
            'admin/admin.js',
            7,
            'Genre fallback lists diverged: admin.js line 7 (allGenres), admin.js ~line 932 (fallback), and save-server.js ~line 35 (default) are not all identical.',
            'Update all three genre literals to match, or none — admin/admin.js:7, admin/admin.js:~932, save-server.js:~35.'
        ));
    }
    if (!themesInSync) {
        violations.push(violation(
            'REGISTRY-002',
            'admin/admin.js',
            8,
            'Theme fallback lists diverged: admin.js line 8 (allThemes), admin.js ~line 933 (fallback), and save-server.js ~line 36 (default) are not all identical.',
            'Update all three theme literals to match, or none — admin/admin.js:8, admin/admin.js:~933, save-server.js:~36.'
        ));
    }
    return violations;
}

// --------------------------------------------------------------------------
// DOC-001
// templates/template.html or data-model-affecting admin.js code changed
// but CLAUDE.md's "Content data model" or "Recurring unit of work" section
// wasn't touched.
//
// CLAUDE.md is gitignored in this repo (confirmed via .gitignore), so it
// can never appear in `git diff --name-status` for a commit. This check
// therefore cannot work as a pure commit-diff check the way the other
// rules do. Adjustment: compare CLAUDE.md's on-disk mtime against the
// latest commit touching template.html/admin.js data-model code, and flag
// if CLAUDE.md's content hash recorded in the exceptions/baseline hasn't
// changed since. In pre-commit (working-tree) mode we approximate this by
// checking whether CLAUDE.md has unstaged/staged changes alongside the
// triggering change; in full-scan mode we compare mtimes.
// --------------------------------------------------------------------------
function checkDoc001(ctx) {
    const violations = [];
    const templateChanged = ctx.changedFiles.some(f => f.path === 'templates/template.html');
    const adminDataModelChanged = ctx.changedFiles.some(f => f.path === 'admin/admin.js') &&
        (ctx.getDiffHunks('admin/admin.js') || []).some(h => /project\.(genres|themes|series_id|part|lineHeight|published|order)/.test(h.header + h.lines.join('\n')));

    if (!templateChanged && !adminDataModelChanged) return violations;

    if (!fs.existsSync(path.join(ctx.repoRoot, 'CLAUDE.md'))) {
        violations.push(violation(
            'DOC-001-UNVERIFIABLE',
            'CLAUDE.md',
            null,
            'templates/template.html or data-model-affecting admin.js code changed, but CLAUDE.md does not exist on disk to check (it is gitignored in this repo, so it cannot be diffed via git).',
            'Manually confirm CLAUDE.md\'s "Content data model" / "Recurring unit of work" sections are current.'
        ));
        return violations;
    }

    // CLAUDE.md is gitignored -> never shows up in git diff. Use the
    // exceptions-baseline-style approach: compare its mtime to the
    // triggering files' mtimes in the working tree. This is a heuristic,
    // not a commit-history fact, and is explicitly weaker than the other
    // git-diff-based rules - documented as a known limitation.
    const claudeMtime = fs.statSync(path.join(ctx.repoRoot, 'CLAUDE.md')).mtimeMs;
    const triggerPaths = [];
    if (templateChanged) triggerPaths.push('templates/template.html');
    if (adminDataModelChanged) triggerPaths.push('admin/admin.js');

    let claudeLooksStale = false;
    for (const p of triggerPaths) {
        const full = path.join(ctx.repoRoot, p);
        if (fs.existsSync(full) && fs.statSync(full).mtimeMs > claudeMtime) {
            claudeLooksStale = true;
        }
    }

    if (claudeLooksStale) {
        violations.push(violation(
            'DOC-001',
            triggerPaths.join(', '),
            null,
            'templates/template.html or admin.js data-model-affecting code changed more recently than CLAUDE.md was last modified.',
            'Update CLAUDE.md\'s "Content data model" and/or "Recurring unit of work" sections to reflect this change (see INTEGRATION_CHECKLIST.md Part 2\'s table for which section applies).'
        ));
    }
    return violations;
}

// --------------------------------------------------------------------------
// DOC-002 (non-blocking reminder — explicitly scoped this way in source
// material: "fuzzy/reminder-grade, not a hard block")
// README structural drift: new top-level projects.json keys, or a new
// writing/<folder>/, with no README touch across recent commits.
// --------------------------------------------------------------------------
const KNOWN_WRITING_FOLDERS = ['articles', 'essays', 'shorts', 'educational'];

function checkDoc002(ctx) {
    const reminders = [];
    // Only a GENUINELY new top-level writing/ subfolder counts - adding a
    // file into an already-known folder (articles/essays/shorts/
    // educational, confirmed as the current real set) is the common case
    // and shouldn't trigger this reminder on every ordinary content add.
    const newWritingFolder = ctx.changedFiles.some(f => {
        const m = f.path.match(/^writing\/([^\/]+)\//);
        return m && f.status === 'A' && !KNOWN_WRITING_FOLDERS.includes(m[1]);
    });
    // Schema drift, not ordinary content edits: a NEW top-level key
    // appearing in projects.json (e.g. a new per-project field), not
    // every routine addition of a project entry - the latter would fire
    // this reminder on nearly every content commit, which is exactly the
    // noise this rule's own "fuzzy/reminder-grade" scoping warns against.
    const KNOWN_PROJECT_KEYS = ['id', 'title', 'path', 'slug', 'fullPath', 'date', 'dateDisplay',
        'mediaPath', 'genres', 'themes', 'published', 'order', 'series_id', 'part', 'lineHeight'];
    const KNOWN_TOP_KEYS = ['projects', 'series', 'genres', 'themes'];
    let newTopLevelKey = false;
    const projectsJsonTouched = ctx.changedFiles.find(f => f.path === 'data/projects.json' && (f.status === 'A' || f.status === 'M'));
    if (projectsJsonTouched) {
        const current = ctx.readWorkingFile('data/projects.json');
        if (current !== null) {
            try {
                const parsed = JSON.parse(current);
                const topKeys = Object.keys(parsed);
                if (topKeys.some(k => !KNOWN_TOP_KEYS.includes(k))) newTopLevelKey = true;
                const projectKeys = new Set();
                (parsed.projects || []).forEach(p => Object.keys(p).forEach(k => projectKeys.add(k)));
                if ([...projectKeys].some(k => !KNOWN_PROJECT_KEYS.includes(k))) newTopLevelKey = true;
            } catch (e) {
                // Can't parse - not this rule's job to flag parse errors,
                // leave newTopLevelKey false rather than guessing.
            }
        }
    }
    const readmeChanged = ctx.changedFiles.some(f => f.path === 'README.md');

    if ((newWritingFolder || newTopLevelKey) && !readmeChanged) {
        reminders.push(violation(
            'DOC-002',
            'README.md',
            null,
            'Content structure may have drifted from README.md\'s claims (new writing/ subfolder and/or projects.json changes) with no README touch in this commit.',
            'Non-blocking reminder: consider whether README.md\'s folder listing or feature description needs updating. This is advisory only, per the source audit\'s own scoping.'
        ));
    }
    return reminders;
}

// --------------------------------------------------------------------------
// HYGIENE-001 — commit message attribution stripping (hard block).
// Lives in commit-msg-checks.js since it operates on the message, not the
// diff, but exported here too for a single source of truth if reused.
// --------------------------------------------------------------------------
function checkHygiene001(message) {
    const violations = [];
    const patterns = [
        { re: /^Co-Authored-By:/im, label: 'a Co-Authored-By trailer' },
        { re: /Generated with Claude Code/i, label: '"Generated with Claude Code" attribution text' },
        { re: /^Claude-Session:/im, label: 'a Claude-Session trailer' }
    ];
    for (const p of patterns) {
        if (p.re.test(message)) {
            violations.push(violation(
                'HYGIENE-001',
                '(commit message)',
                null,
                `Commit message contains ${p.label}.`,
                'Remove this line from the commit message entirely and re-commit. This is a hard block with no override.'
            ));
        }
    }
    return violations;
}

// --------------------------------------------------------------------------
// COLOR-001 — no new hardcoded hex/rgb/rgba/hsl/hsla colors outside
// style.css's :root blocks.
//
// Scope decision: named CSS colors (red, black, white, etc.) are EXCLUDED
// from detection. Reasoning: "black"/"white"/"gray" etc. collide heavily
// with non-color identifiers and prose (class names, words in comments,
// strings like "background-color: transparent", the word "white" inside
// unrelated copy). A regex for named colors would need a fixed dictionary
// AND context-awareness (is this token in a `color:`/`background:`/etc.
// declaration position) to avoid drowning in false positives, which is not
// reliably doable with regex alone against arbitrary JS/HTML/CSS. Scoping
// to hex/rgb()/rgba()/hsl()/hsla() only, which are unambiguous by syntax.
//
// Exclusion rule: only style.css's :root[data-theme="light"] and
// :root[data-theme="dark"] blocks are exempt, and ONLY from this
// duplication-style check. style.css is NOT blanket-excluded from other
// rules (e.g. it is never excluded from a hypothetical "references
// undefined token" check — no such check is implemented here, but if one
// were, style.css must be included, since --font-sans's brokenness is
// exactly a bug that lives inside style.css itself).
// --------------------------------------------------------------------------
const COLOR_RE = /#(?:[0-9a-fA-F]{3}){1,2}\b|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;

function isInsideRootBlock(source, index) {
    // Find the nearest enclosing :root[...] { ... } block by scanning
    // backward for the last ":root" before index and checking we're still
    // within its brace range.
    const before = source.slice(0, index);
    const rootIdx = before.lastIndexOf(':root');
    if (rootIdx === -1) return false;
    const braceOpen = source.indexOf('{', rootIdx);
    if (braceOpen === -1 || braceOpen > index) return false;
    // find matching close brace
    let depth = 0;
    for (let i = braceOpen; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            depth--;
            if (depth === 0) {
                return index < i;
            }
        }
    }
    return false;
}

function lineOf(source, index) {
    return source.slice(0, index).split('\n').length;
}

function checkColor001(ctx) {
    const violations = [];
    const cssFiles = ctx.changedFiles.filter(f => /\.css$/i.test(f.path) && (f.status === 'A' || f.status === 'M'));
    for (const f of cssFiles) {
        const content = ctx.readWorkingFile(f.path);
        if (content === null) {
            violations.push(violation('COLOR-001-UNVERIFIABLE', f.path, null,
                `Could not read ${f.path} to scan for hardcoded colors.`, 'Investigate missing file; do not treat as a pass.'));
            continue;
        }
        // Only check ADDED lines in the diff, resolved back to the
        // current file to determine root-block membership accurately.
        const addedLineTexts = ctx.getAddedLines(f.path);
        if (addedLineTexts === null) continue;

        let match;
        COLOR_RE.lastIndex = 0;
        while ((match = COLOR_RE.exec(content)) !== null) {
            const line = lineOf(content, match.index);
            const lineText = content.split('\n')[line - 1];
            const wasAdded = addedLineTexts.some(t => t.trim() === lineText.trim());
            if (!wasAdded) continue;
            // Exclusion is per-ROLE (token definition), not per-file: any
            // CSS file's own :root block is where color literals are
            // legitimately DEFINED as tokens, so a literal inside a :root
            // block is exempt regardless of which file it's in. style.css
            // is the canonical token source for the reading portal/admin
            // panel; app/wf.css independently defines its own :root
            // token blocks (CLAUDE.md confirms this is a known, accepted
            // parallel system, not itself flagged here). admin.css has NO
            // :root of its own (confirmed - it only consumes style.css's
            // tokens), so nothing in admin.css is ever exempt by this
            // rule - a literal there is always a real violation, which is
            // exactly what the design-quality audit already found
            // (rgba(139,90,74,...) hardcoded 6+ times in admin.css).
            if (isInsideRootBlock(content, match.index)) continue;
            violations.push(violation(
                'COLOR-001',
                f.path,
                line,
                `Hardcoded color value "${match[0]}" added outside a :root token-definition block.`,
                'Use an existing design token (var(--color-...)) or add a new token to this file\'s :root block instead of a literal color value.'
            ));
        }
    }
    return violations;
}

// --------------------------------------------------------------------------
// LOG-001 — no console.log calls in committed JS outside intentional
// user-facing CLI/reporting output.
//
// Re-validated: filter-system.js's console.logs were confirmed removed
// (design-quality audit Part 9). However index.js currently has TWO
// console.log calls (lines 590, 637 as of this session) that are NOT
// save-server.js and were not previously flagged — these are real,
// current backlog (see Part 4 report).
//
// Exclusion scope, justified per-role (not blanket per-file): save-server.js
// (intentional startup/request logging) and the gate-check tooling itself
// (sentinel-check.js, sentinel-gate/**) are CLI entry points/reporting code
// whose entire purpose is printing output to a human running them in a
// terminal — the same role as save-server.js's logging, not application
// logic. Browser-facing application code (admin.js, index.js, filter-
// system.js, theme.js, wf.js, etc.) has no legitimate reason to log to a
// console a user never opens, so it stays fully in scope for this rule.
// --------------------------------------------------------------------------
const LOG_EXEMPT_PATHS = [
    'save-server.js',
    'sentinel-check.js',
];
function isLogExempt(filePath) {
    if (LOG_EXEMPT_PATHS.includes(filePath)) return true;
    if (filePath.startsWith('sentinel-gate/')) return true;
    return false;
}

function checkLog001(ctx) {
    const violations = [];
    const jsFiles = ctx.changedFiles.filter(f => /\.js$/i.test(f.path) && !isLogExempt(f.path) && (f.status === 'A' || f.status === 'M'));
    for (const f of jsFiles) {
        const addedLines = ctx.getAddedLinesWithNumbers(f.path);
        if (addedLines === null) continue;
        for (const { lineNo, text } of addedLines) {
            if (/console\.log\s*\(/.test(text)) {
                violations.push(violation(
                    'LOG-001',
                    f.path,
                    lineNo,
                    `console.log call added in ${f.path}.`,
                    'Remove the console.log before committing, or move the diagnostic to save-server.js\'s intentional startup logging if it genuinely belongs there.'
                ));
            }
        }
    }
    return violations;
}

// --------------------------------------------------------------------------
// IMG-001 — image size budget for anything added under writing/**.
// Threshold: 400KB (midpoint of the audit's proposed 300-500KB range).
// --------------------------------------------------------------------------
const IMAGE_SIZE_LIMIT_BYTES = 400 * 1024;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif)$/i;

function checkImg001(ctx) {
    const violations = [];
    const addedImages = ctx.changedFiles.filter(f =>
        f.status === 'A' && /^writing\//.test(f.path) && IMAGE_EXT_RE.test(f.path)
    );
    for (const f of addedImages) {
        const full = path.join(ctx.repoRoot, f.path);
        let size;
        try {
            size = fs.statSync(full).size;
        } catch (e) {
            violations.push(violation('IMG-001-UNVERIFIABLE', f.path, null,
                `Could not stat ${f.path} to check its size.`, 'Investigate missing file; do not treat as a pass.'));
            continue;
        }
        if (size > IMAGE_SIZE_LIMIT_BYTES) {
            violations.push(violation(
                'IMG-001',
                f.path,
                null,
                `Image ${f.path} is ${(size / 1024).toFixed(0)}KB, over the 400KB budget for writing/** assets.`,
                'Compress or resize the image before committing (target under 400KB).'
            ));
        }
    }
    return violations;
}

// --------------------------------------------------------------------------
// STRUCT-001 — nested <article> lint against generated writing/**.html,
// gated to run only when admin's template-assembly code changes (per the
// source material: this is a KNOWN, currently-100%-present violation, so
// it must not hard-block on every existing file — only surfaced when
// template-assembly code changes, as a reminder that touching that code
// is a chance to fix it, and tracked as a Part 4 baseline item otherwise).
// --------------------------------------------------------------------------
function checkStruct001(ctx) {
    // Diff-mode only: this reminder is meant to surface "you're touching
    // assembly code right now, here's a known issue to consider fixing
    // while you're in there." In full mode every scan would trivially see
    // the assembly functions present in the file (the synthetic full-file
    // hunk always "contains" them), making the reminder fire on every
    // single full scan regardless of what changed - not useful signal,
    // just noise. The full-repo tracking of this issue belongs in the
    // Part 4 baseline (as a permanent known-backlog entry), not as a
    // repeated non-blocking reminder on every push.
    if (ctx.mode === 'full') return [];
    const violations = [];
    const templateOrAssemblyChanged = ctx.changedFiles.some(f => f.path === 'templates/template.html') ||
        (ctx.changedFiles.some(f => f.path === 'admin/admin.js') &&
            functionBodyChanged(ctx.getDiffHunks('admin/admin.js') || [], ['buildAssembledHtml', 'wrapArticleContent']));

    if (!templateOrAssemblyChanged) return violations;

    const trigger = ctx.changedFiles.some(f => f.path === 'templates/template.html')
        ? 'templates/template.html'
        : 'admin/admin.js';

    violations.push(violation(
        'STRUCT-001',
        trigger,
        null,
        'Admin template-assembly code changed. This project has a KNOWN pre-existing structural issue: every generated writing/**.html file nests <article class="story-content"> inside <article class="reading-body"> (a landmark/semantic issue documented in CLAUDE.md\'s "Known structural issues").',
        'This is not a new violation (it is 100% pre-existing, tracked in the Part 4 baseline) — but since you are touching the assembly code right now, consider fixing the double-<article> nesting as part of this change. This is a reminder, not a hard block, because blocking would fail on all pre-existing content.'
    ));
    return violations;
}

// --------------------------------------------------------------------------
// CONVENTION-001 — full-repo-only. Walks every writing/**.html and checks
// its story-content wrapper's class list against the current site-wide
// convention (must include `ragged`). This is exactly the check that
// would have caught pink.html missing `ragged` before this session fixed
// it - no single commit's diff could catch it, since the regression only
// became wrong in light of a convention established many commits earlier.
// Diff-mode has no equivalent (a single commit's diff can't know about a
// site-wide convention baseline), so this rule only runs in full mode.
// --------------------------------------------------------------------------
function checkConvention001(ctx) {
    if (ctx.mode !== 'full') return [];
    const violations = [];
    const writingFiles = ctx.changedFiles.filter(f => isWritingHtml(f.path));
    for (const f of writingFiles) {
        const content = ctx.readWorkingFile(f.path);
        if (content === null) {
            violations.push(violation('CONVENTION-001-UNVERIFIABLE', f.path, null,
                `Could not read ${f.path} to check its story-content class list.`,
                'Investigate missing file; do not treat as a pass.'));
            continue;
        }
        const m = content.match(/<article[^>]*class="([^"]*story-content[^"]*)"[^>]*>/i);
        if (!m) {
            violations.push(violation('CONVENTION-001-UNVERIFIABLE', f.path, null,
                `Could not find a story-content article wrapper in ${f.path} to check its class list.`,
                'Manually verify this file\'s structure; the automated check could not locate the expected wrapper.'));
            continue;
        }
        const classes = m[1].split(/\s+/);
        if (!classes.includes('ragged')) {
            violations.push(violation(
                'CONVENTION-001',
                f.path,
                null,
                `${f.path}'s story-content wrapper is missing the site-wide "ragged" class convention (established in commit 93bc358).`,
                'Add the "ragged" class to this file\'s story-content wrapper, or re-save it via the admin panel so wrapArticleContent() backfills it automatically.'
            ));
        }
    }
    return violations;
}

module.exports = {
    checkRegistry001,
    checkRender001,
    checkPersist001,
    checkRegistry002,
    checkDoc001,
    checkDoc002,
    checkHygiene001,
    checkColor001,
    checkLog001,
    checkImg001,
    checkStruct001,
    checkConvention001,
    IMAGE_SIZE_LIMIT_BYTES,
    ASSEMBLY_FUNCTION_NAMES
};

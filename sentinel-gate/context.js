// ==========================================================================
// Sentinel Gate-Check — shared context builder
// ==========================================================================
// Builds the `ctx` object every check function receives: the list of
// changed files (with git status codes), diff hunk access, working-tree
// file reads, and exceptions handling. Shared between the diff-scoped mode
// (pre-commit / default manual command) and the full-repo scan mode
// (pre-push / --full).

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function git(args, opts) {
    return execFileSync('git', args, Object.assign({ encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 }, opts || {}));
}

function findRepoRoot() {
    return git(['rev-parse', '--show-toplevel']).trim().replace(/\//g, path.sep);
}

// --------------------------------------------------------------------------
// Diff parsing: turn `git diff -U0 --no-color <ref-range> -- <path>` output
// into hunks of { header, lines[] } so checks can inspect changed regions
// without a full diff library dependency (none exists, no npm).
// --------------------------------------------------------------------------
function parseUnifiedDiff(diffText) {
    const hunks = [];
    if (!diffText) return hunks;
    const lines = diffText.split('\n');
    let current = null;
    for (const line of lines) {
        if (line.startsWith('@@')) {
            if (current) hunks.push(current);
            current = { header: line, lines: [] };
        } else if (current) {
            current.lines.push(line);
        }
    }
    if (current) hunks.push(current);
    return hunks;
}

// --------------------------------------------------------------------------
// buildContext(mode, opts)
//   mode: 'diff' (staged/working-tree changes) or 'full' (whole repo)
// --------------------------------------------------------------------------
function buildContext(mode, opts) {
    opts = opts || {};
    const repoRoot = findRepoRoot();

    let changedFiles = [];
    // diffRange: what `git diff` range to use for hunk/line lookups.
    let diffRangeArgs = [];

    if (mode === 'diff') {
        // Staged changes are what a commit-msg/pre-commit hook actually
        // sees. If nothing is staged (e.g. manual command run with a
        // clean index but dirty working tree), fall back to working-tree
        // changes vs HEAD so `sentinel-check` is still useful standalone.
        let raw = git(['diff', '--cached', '--name-status'], { cwd: repoRoot }).trim();
        diffRangeArgs = ['diff', '--cached'];
        if (!raw) {
            raw = git(['diff', '--name-status'], { cwd: repoRoot }).trim();
            diffRangeArgs = ['diff'];
        }
        changedFiles = parseNameStatus(raw);
    } else if (mode === 'full') {
        const raw = git(['ls-files'], { cwd: repoRoot }).trim();
        changedFiles = raw ? raw.split('\n').map(p => ({ path: p, status: 'A' })) : [];
        // full scan has no "diff range" - checks that need diff hunks
        // (RENDER-001 etc.) are interpreted as "does the CURRENT file
        // reference the assembly functions at all" in full mode via a
        // synthetic hunk containing the whole file — see getDiffHunks.
    } else {
        throw new Error('buildContext: unknown mode ' + mode);
    }

    const hunkCache = {};
    const addedLinesCache = {};

    function getDiffHunks(filePath) {
        if (mode === 'full') {
            const content = readWorkingFile(filePath);
            if (content === null) return null;
            return [{ header: '@@ full-scan @@', lines: content.split('\n').map(l => '+' + l) }];
        }
        if (hunkCache[filePath] !== undefined) return hunkCache[filePath];
        try {
            const out = git([...diffRangeArgs, '-U0', '--no-color', '--', filePath], { cwd: repoRoot });
            hunkCache[filePath] = parseUnifiedDiff(out);
        } catch (e) {
            hunkCache[filePath] = null;
        }
        return hunkCache[filePath];
    }

    function getAddedLines(filePath) {
        const hunks = getDiffHunks(filePath);
        if (hunks === null) return null;
        const added = [];
        for (const h of hunks) {
            for (const l of h.lines) {
                if (l.startsWith('+') && !l.startsWith('+++')) added.push(l.slice(1));
            }
        }
        return added;
    }

    function getAddedLinesWithNumbers(filePath) {
        const hunks = getDiffHunks(filePath);
        if (hunks === null) return null;
        const result = [];
        for (const h of hunks) {
            // @@ -a,b +c,d @@ -> new-file start line is c
            const m = h.header.match(/\+(\d+)/);
            let lineNo = m ? parseInt(m[1], 10) : 1;
            for (const l of h.lines) {
                if (l.startsWith('+') && !l.startsWith('+++')) {
                    result.push({ lineNo, text: l.slice(1) });
                    lineNo++;
                } else if (!l.startsWith('-') || l.startsWith('---')) {
                    // context line in -U0 diffs shouldn't normally appear,
                    // but guard anyway
                    lineNo++;
                }
            }
        }
        return result;
    }

    function readWorkingFile(filePath) {
        try {
            return fs.readFileSync(path.join(repoRoot, filePath), 'utf8');
        } catch (e) {
            return null;
        }
    }

    return {
        mode,
        repoRoot,
        changedFiles,
        getDiffHunks,
        getAddedLines,
        getAddedLinesWithNumbers,
        readWorkingFile
    };
}

function parseNameStatus(raw) {
    if (!raw) return [];
    return raw.split('\n').filter(Boolean).map(line => {
        const parts = line.split('\t');
        const statusRaw = parts[0];
        const status = statusRaw[0]; // A, M, D, R100, etc -> take first char
        // Renames: "R100\told\tnew" - use the new path.
        const filePath = parts.length > 2 ? parts[2] : parts[1];
        return { path: filePath.replace(/\\/g, '/'), status: status === 'R' ? 'M' : status };
    });
}

module.exports = { buildContext, git, findRepoRoot, parseUnifiedDiff };

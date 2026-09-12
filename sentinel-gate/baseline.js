// ==========================================================================
// Sentinel Gate-Check — baseline (pre-existing violation) tracking
// ==========================================================================
// The full-repo scan mode (pre-push) must not fail on violations that
// already existed before these checks were implemented (Part 4). This
// module reads/writes sentinel-baseline.json, a flat list of
// { rule, file, line, message } fingerprints considered "already known
// backlog."
//
// A violation is baseline-matched by (rule, file, message) - not by line
// number. Line numbers drift whenever anything earlier in the same file
// changes (an insertion above a flagged line shifts it down with no
// change to the violation itself), which would otherwise make an
// unrelated, unconnected edit elsewhere in the file falsely present a
// pre-existing violation as new. The violation's message already embeds
// the actual offending value (e.g. the literal hex/rgb string for
// COLOR-001), so matching on it still distinguishes a genuinely new
// violation (a different color/value) from a pre-existing one that only
// moved - without needing line numbers to stay stable across unrelated
// edits.

'use strict';

const fs = require('fs');
const path = require('path');

const BASELINE_FILENAME = 'sentinel-baseline.json';

function baselinePath(repoRoot) {
    return path.join(repoRoot, BASELINE_FILENAME);
}

function loadBaseline(repoRoot) {
    const p = baselinePath(repoRoot);
    if (!fs.existsSync(p)) {
        // No baseline yet is a valid state (first run before Part 4 pass
        // has been recorded) - full scan then blocks on everything, which
        // is correct: an empty/missing baseline means nothing is exempted.
        return { generatedAt: null, entries: [] };
    }
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
        throw new Error(`${BASELINE_FILENAME} exists but is not valid JSON: ${e.message}. A broken baseline file must fail loudly, not silently act as "everything is baseline" or "nothing is baseline."`);
    }
    if (!parsed || !Array.isArray(parsed.entries)) {
        throw new Error(`${BASELINE_FILENAME} must be an object with an "entries" array.`);
    }
    return parsed;
}

function saveBaseline(repoRoot, violations) {
    const entries = violations.map(v => ({ rule: v.rule, file: v.file, line: v.line || null, message: v.message }));
    const data = { generatedAt: new Date().toISOString(), entries };
    fs.writeFileSync(baselinePath(repoRoot), JSON.stringify(data, null, 2) + '\n', 'utf8');
    return data;
}

// Matches by (rule, file, message). A genuinely new violation in an
// already-flagged file (e.g. a second, different hardcoded color added to
// a file that already has one baseline color) still has a different
// message - the specific value is embedded in it - so it is correctly
// treated as new, not baseline-covered. A pre-existing violation whose
// line number merely shifted because of an unrelated earlier edit in the
// same file keeps the same message and stays correctly matched.
function isInBaseline(violation, baseline) {
    return baseline.entries.some(e =>
        e.rule === violation.rule &&
        e.file === violation.file &&
        e.message === violation.message
    );
}

// Splits violations into { newViolations, baselineViolations }.
function partitionAgainstBaseline(violations, baseline) {
    const newViolations = [];
    const baselineViolations = [];
    for (const v of violations) {
        if (isInBaseline(v, baseline)) baselineViolations.push(v);
        else newViolations.push(v);
    }
    return { newViolations, baselineViolations };
}

module.exports = { loadBaseline, saveBaseline, isInBaseline, partitionAgainstBaseline, BASELINE_FILENAME };

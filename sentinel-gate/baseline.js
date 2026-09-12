// ==========================================================================
// Sentinel Gate-Check — baseline (pre-existing violation) tracking
// ==========================================================================
// The full-repo scan mode (pre-push) must not fail on violations that
// already existed before these checks were implemented (Part 4). This
// module reads/writes sentinel-baseline.json, a flat list of
// { rule, file } fingerprints considered "already known backlog."
//
// A violation is baseline-matched by (rule, file) only - not by exact
// message text, since messages can be reworded without changing whether
// the underlying violation is "the same known issue."

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

// Matches by (rule, file, line). Line-level rules (COLOR-001, LOG-001)
// carry a real line number, so a NEW violation at a different line in an
// already-flagged file is correctly treated as new, not baseline-covered
// - matching by (rule, file) alone would have silently let a second,
// unrelated hardcoded-color addition in an already-noisy file slip past
// the pre-push gate. File-level rules (IMG-001, PERSIST-001, DOC-001)
// have line === null on both sides, so they still match on (rule, file)
// as intended.
function isInBaseline(violation, baseline) {
    return baseline.entries.some(e =>
        e.rule === violation.rule &&
        e.file === violation.file &&
        (e.line || null) === (violation.line || null)
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

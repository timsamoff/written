// ==========================================================================
// Sentinel Gate-Check — exceptions file handling
// ==========================================================================
// Reads sentinel-exceptions.json from the repo root. Each entry:
//   { rule, scope, reason, owner, reviewBy }
// - rule: exact rule ID (e.g. "REGISTRY-001") - never a vague description.
// - scope: a single file path or a narrow glob (no bare "**" or directory
//   wildcard - rejected as too broad at load time).
// - reason: non-empty string.
// - owner: non-empty string (not hardcoded to any particular name).
// - reviewBy: ISO date string. Once passed, the entry is treated exactly
//   as if it didn't exist - expired exceptions do NOT keep passing.
//
// Fails loudly: a malformed exceptions file is a thrown error, not a
// silently-empty exception list (which would make every prior exception
// disappear without anyone noticing).

'use strict';

const fs = require('fs');
const path = require('path');

const EXCEPTIONS_FILENAME = 'sentinel-exceptions.json';

function isTooBroadScope(scope) {
    if (typeof scope !== 'string' || scope.length === 0) return true;
    if (scope.includes('**')) return true;
    // A bare directory wildcard like "writing/*" or "writing/" or "*"
    if (/^\*+$/.test(scope)) return true;
    if (/\/\*$/.test(scope) && !scope.includes('.')) return true; // "dir/*" with no extension = likely a whole-dir wildcard
    return false;
}

function loadExceptions(repoRoot) {
    const filePath = path.join(repoRoot, EXCEPTIONS_FILENAME);
    if (!fs.existsSync(filePath)) {
        throw new Error(
            `sentinel-exceptions.json not found at ${filePath}. This file must exist (even as an empty array) for the exceptions mechanism to be checkable. Refusing to silently treat "missing file" as "no exceptions apply" vs "exceptions are broken" - create the file.`
        );
    }
    let raw;
    try {
        raw = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
        throw new Error(`Could not read ${EXCEPTIONS_FILENAME}: ${e.message}`);
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        throw new Error(`${EXCEPTIONS_FILENAME} is not valid JSON: ${e.message}. Fix the file - a broken exceptions file must fail loudly, not silently grant or deny all exceptions.`);
    }
    if (!Array.isArray(parsed)) {
        throw new Error(`${EXCEPTIONS_FILENAME} must be a JSON array of exception entries.`);
    }

    const now = new Date();
    const validated = [];
    for (const [i, entry] of parsed.entries()) {
        const problems = [];
        if (!entry || typeof entry !== 'object') { problems.push('entry is not an object'); }
        else {
            if (!entry.rule || typeof entry.rule !== 'string') problems.push('missing/invalid "rule"');
            if (isTooBroadScope(entry.scope)) problems.push(`"scope" is missing or too broad (no "**" or bare directory wildcards allowed): ${JSON.stringify(entry.scope)}`);
            if (!entry.reason || typeof entry.reason !== 'string' || entry.reason.trim() === '') problems.push('missing/empty "reason"');
            if (!entry.owner || typeof entry.owner !== 'string' || entry.owner.trim() === '') problems.push('missing/empty "owner"');
            if (!entry.reviewBy || isNaN(Date.parse(entry.reviewBy))) problems.push('missing/invalid "reviewBy" date');
        }
        if (problems.length > 0) {
            throw new Error(`${EXCEPTIONS_FILENAME} entry #${i} is invalid: ${problems.join('; ')}. Fix or remove this entry.`);
        }
        const expired = Date.parse(entry.reviewBy) < now.getTime();
        validated.push(Object.assign({}, entry, { expired }));
    }
    return validated;
}

function scopeMatches(scope, filePath) {
    // scope is a single file path or a narrow glob (one "*" segment max,
    // already validated as non-broad by isTooBroadScope). Support simple
    // "*" wildcard within a single path segment.
    if (scope === filePath) return true;
    if (!scope.includes('*')) return false;
    const re = new RegExp('^' + scope.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
    return re.test(filePath);
}

// Filters a list of violations, removing any covered by a valid
// (non-expired) exception. Returns { remaining, exempted }.
function applyExceptions(violations, exceptions) {
    const remaining = [];
    const exempted = [];
    for (const v of violations) {
        const match = exceptions.find(e => e.rule === v.rule && !e.expired && scopeMatches(e.scope, v.file));
        if (match) {
            exempted.push(Object.assign({}, v, { exception: match }));
        } else {
            remaining.push(v);
        }
    }
    return { remaining, exempted };
}

module.exports = { loadExceptions, applyExceptions, scopeMatches, EXCEPTIONS_FILENAME };

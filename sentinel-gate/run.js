// ==========================================================================
// Sentinel Gate-Check — shared runner
// ==========================================================================
// Runs the content checks (REGISTRY-001, RENDER-001, PERSIST-001,
// REGISTRY-002, DOC-001, DOC-002, COLOR-001, LOG-001, IMG-001, STRUCT-001)
// against a context (diff-scoped or full-repo), applies exceptions, and
// (for full mode) partitions against the baseline. Used by:
//   - .git/hooks/pre-commit          (mode: diff, blocking)
//   - .git/hooks/pre-push            (mode: full, blocking on non-baseline)
//   - sentinel-check.js              (mode: diff by default, --full flag)

'use strict';

const { buildContext } = require('./context');
const { loadExceptions, applyExceptions } = require('./exceptions');
const { loadBaseline, partitionAgainstBaseline } = require('./baseline');
const checks = require('./checks');

// Rules that are non-blocking reminders regardless of mode.
const NON_BLOCKING_RULES = new Set(['DOC-002', 'STRUCT-001']);
// Rules that only make sense / only run meaningfully in diff mode (they
// compare "this commit" against something) vs rules that are meaningful
// in both. All current rules work in both modes since context.getDiffHunks
// synthesizes a "whole file as one hunk" view for full mode.
const ALL_RULE_FNS = [
    checks.checkRegistry001,
    checks.checkRender001,
    checks.checkPersist001,
    checks.checkRegistry002,
    checks.checkDoc001,
    checks.checkDoc002,
    checks.checkColor001,
    checks.checkLog001,
    checks.checkImg001,
    checks.checkStruct001,
    checks.checkConvention001
];

function runAllChecks(ctx) {
    const violations = [];
    for (const fn of ALL_RULE_FNS) {
        let result;
        try {
            result = fn(ctx);
        } catch (err) {
            // Fail loudly: a thrown error inside a check becomes its own
            // violation, never a silently-skipped rule.
            result = [{
                rule: (fn.name || 'UNKNOWN') + '-CRASHED',
                file: '(check infrastructure)',
                line: null,
                message: `Check "${fn.name}" threw an error and could not complete: ${err.message}`,
                correction: 'Investigate and fix the check itself; this must not be treated as a pass.'
            }];
        }
        if (!Array.isArray(result)) {
            result = [{
                rule: (fn.name || 'UNKNOWN') + '-BADRESULT',
                file: '(check infrastructure)',
                line: null,
                message: `Check "${fn.name}" did not return an array of violations.`,
                correction: 'Investigate and fix the check itself; this must not be treated as a pass.'
            }];
        }
        violations.push(...result);
    }
    return violations;
}

function formatViolation(v) {
    const loc = v.line ? `${v.file}:${v.line}` : v.file;
    let out = `  [${v.rule}] ${loc}\n    ${v.message}`;
    if (v.correction) out += `\n    -> ${v.correction}`;
    return out;
}

// Runs the full check suite for the given mode ('diff' | 'full'), applies
// exceptions, and (for 'full' mode) splits results against the baseline.
// Returns a report object; does not itself decide process.exit - callers
// (hooks / CLI) do that so this stays testable in-process.
function runReport(mode) {
    const ctx = buildContext(mode);
    const rawViolations = runAllChecks(ctx);

    let exceptions;
    try {
        exceptions = loadExceptions(ctx.repoRoot);
    } catch (err) {
        return {
            ctx, mode,
            fatalError: `Exceptions file error: ${err.message}`,
            violations: [], blocking: [], nonBlocking: [], exempted: [], baselineViolations: []
        };
    }

    const { remaining, exempted } = applyExceptions(rawViolations, exceptions);

    const blocking = remaining.filter(v => !NON_BLOCKING_RULES.has(v.rule.replace(/-UNVERIFIABLE$/, '')));
    const nonBlocking = remaining.filter(v => NON_BLOCKING_RULES.has(v.rule.replace(/-UNVERIFIABLE$/, '')));

    let baselineViolations = [];
    let newBlocking = blocking;
    if (mode === 'full') {
        const baseline = loadBaseline(ctx.repoRoot);
        const partitioned = partitionAgainstBaseline(blocking, baseline);
        newBlocking = partitioned.newViolations;
        baselineViolations = partitioned.baselineViolations;
    }

    return {
        ctx, mode,
        fatalError: null,
        violations: remaining,
        blocking: newBlocking,
        nonBlocking,
        exempted,
        baselineViolations
    };
}

module.exports = { runAllChecks, runReport, formatViolation, NON_BLOCKING_RULES, ALL_RULE_FNS };

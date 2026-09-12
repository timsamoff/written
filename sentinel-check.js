#!/usr/bin/env node
// ==========================================================================
// Sentinel Gate-Check — standalone manual command
// ==========================================================================
// Usable independently of git hooks. Invoke directly with node (no npm/
// package manager needed, matching this project's no-build-tooling stack):
//
//   node sentinel-check.js            diff-scoped (staged changes, or
//                                      working-tree changes vs HEAD if
//                                      nothing is staged)
//   node sentinel-check.js --full     full-repo scan mode (same checks
//                                      run against every tracked file,
//                                      partitioned against the recorded
//                                      baseline of pre-existing violations)
//
// Exit code is 0 when there are no blocking violations, 1 otherwise -
// scriptable/CI-friendly even though no CI exists yet for this project.

'use strict';

const { runReport, formatViolation } = require('./sentinel-gate/run');

function main() {
    const full = process.argv.includes('--full');
    const mode = full ? 'full' : 'diff';

    console.log(`Sentinel gate-check — ${mode === 'full' ? 'full-repo scan' : 'diff-scoped'} mode\n`);

    let report;
    try {
        report = runReport(mode);
    } catch (err) {
        console.error('Sentinel gate-check crashed:', err.message);
        console.error(err.stack);
        process.exit(1);
        return;
    }

    if (report.fatalError) {
        console.error('FATAL:', report.fatalError);
        process.exit(1);
        return;
    }

    if (report.exempted.length > 0) {
        console.log(`${report.exempted.length} violation(s) covered by sentinel-exceptions.json:`);
        for (const v of report.exempted) {
            console.log(`  [${v.rule}] ${v.file} — exempted (owner: ${v.exception.owner}, reviewBy: ${v.exception.reviewBy})`);
        }
        console.log('');
    }

    if (report.nonBlocking.length > 0) {
        console.log('Non-blocking reminders:');
        for (const v of report.nonBlocking) console.log(formatViolation(v));
        console.log('');
    }

    if (mode === 'full' && report.baselineViolations.length > 0) {
        console.log(`${report.baselineViolations.length} violation(s) already tracked in sentinel-baseline.json (known backlog, not blocking):`);
        for (const v of report.baselineViolations) console.log(formatViolation(v));
        console.log('');
    }

    if (report.blocking.length > 0) {
        console.log(`${report.blocking.length} BLOCKING violation(s):\n`);
        for (const v of report.blocking) console.log(formatViolation(v) + '\n');
        process.exit(1);
        return;
    }

    console.log('No blocking violations found.');
    process.exit(0);
}

main();

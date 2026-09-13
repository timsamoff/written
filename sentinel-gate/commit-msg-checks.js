// ==========================================================================
// Sentinel Gate-Check — commit message structural checks
// ==========================================================================
// Caps (confirmed with the user, not to be re-asked):
//   - Subject line: single line, no wrapping, max 72 chars.
//   - Body: optional. If present, every logical bullet must start with a
//     real bullet marker ("- "). Max 5 bullets. A bullet may wrap onto ONE
//     indented continuation line (2 spaces, no "- " of its own) if the
//     first line alone isn't enough - combined bullet content (both lines,
//     marker excluded) is capped at 160 chars so wrapping still can't turn
//     into a paragraph.
//   - A commit with nothing more to say has NO body at all.
//   - A multi-paragraph/narrative body (no bullet markers) is a HARD BLOCK
//     with NO override available - this is a structural violation, not a
//     count violation, so Sentinel-Override cannot waive it.
//   - Exceeding the 5-bullet cap IS override-able via
//     `Sentinel-Override: <reason>` - but the failure message must lead
//     with the "does this commit bundle together several separate things?"
//     framing before mentioning the override.
//
// Structural-proxy note (per source material's blind-spot list): a length
// cap alone is satisfiable by wrapping a narrative so no single line
// exceeds the cap, or by writing several short unmarked declarative
// sentences with no blank-line separation. Both are still "prose," not
// "bullets." The continuation-line allowance below is narrower than that
// loophole: only ONE continuation line per bullet, it must be indented
// (distinguishing it from a fresh, unmarked sentence), and the combined
// length is still capped - so this closes the loophole while letting a
// single bullet's idea wrap once instead of being forced into an
// artificially terse one-liner or truncated mid-thought.

'use strict';

const SUBJECT_MAX = 72;
const BULLET_MAX = 160; // combined length of a bullet's marker line + continuation line
const BULLET_COUNT_MAX = 5;
const BULLET_RE = /^- (?!\s*$)/; // "- " followed by non-whitespace content
const CONTINUATION_RE = /^ {2}(?!\s*$)/; // exactly 2-space indent, non-whitespace content, no "- "

function parseTrailers(lines) {
    // Trailers are trailing "Key: value" lines - scan from the bottom.
    const trailers = [];
    let i = lines.length - 1;
    while (i >= 0 && /^[A-Za-z][A-Za-z0-9-]*:\s*.*/.test(lines[i])) {
        trailers.unshift(lines[i]);
        i--;
    }
    return { trailers, bodyEnd: i + 1 };
}

function getOverrideReason(message) {
    const m = message.match(/^Sentinel-Override:\s*(.+)$/im);
    return m ? m[1].trim() : null;
}

function checkCommitMessageStructure(rawMessage) {
    const violations = [];
    // Strip comment lines (git includes "# ..." helper lines in the
    // editor buffer, but commit-msg hooks receive the file post-comment
    // in COMMIT_EDITMSG - still strip defensively).
    const message = rawMessage.split('\n').filter(l => !l.startsWith('#')).join('\n');
    const lines = message.split('\n');

    const subject = lines[0] || '';
    if (subject.length > SUBJECT_MAX) {
        violations.push({
            rule: 'MSG-SUBJECT-LENGTH',
            overrideEligible: false,
            message: `Subject line is ${subject.length} chars, over the ${SUBJECT_MAX}-char cap.`,
            correction: `Shorten the subject line to ${SUBJECT_MAX} characters or fewer.`
        });
    }

    // A body (if any) MUST be separated from the subject by a real blank
    // line - this is not optional formatting, it is what makes `git log
    // --oneline` / `%s` / `%b` treat the subject as a one-line summary at
    // all. Without it, tools have no way to know where the "subject"
    // conceptually ends, and every git view that relies on that
    // convention (oneline log, %s/%b format strings) silently collapses
    // the whole message into one run-on line - exactly the failure mode
    // this check exists to prevent, not just a cosmetic preference.
    if (lines.length > 1 && lines[1].trim() !== '') {
        violations.push({
            rule: 'MSG-NO-BLANK-LINE-AFTER-SUBJECT',
            overrideEligible: false,
            message: 'No blank line between the subject and the body. Git (and this project\'s own commit-log tooling) treats everything up to the first blank line as the subject - without one, the whole message is read as a single run-on subject line, not a short summary plus bullets.',
            correction: 'Insert a blank line immediately after the subject line, before the first body bullet.'
        });
        return violations; // can't reliably parse body structure without a real boundary
    }

    // Body = everything after the first blank line following the subject.
    let bodyStart = 1;
    while (bodyStart < lines.length && lines[bodyStart].trim() === '') bodyStart++;

    const bodyLinesRaw = lines.slice(bodyStart).filter((l, idx, arr) => true);
    // Remove trailing blank lines
    while (bodyLinesRaw.length > 0 && bodyLinesRaw[bodyLinesRaw.length - 1].trim() === '') bodyLinesRaw.pop();

    if (bodyLinesRaw.length === 0) {
        return violations; // no body - fine, nothing more to check
    }

    // Separate out trailers (Sentinel-Override, Co-Authored-By, etc.) from
    // the narrative/bullet body - trailers are checked by HYGIENE-001 /
    // override logic elsewhere, not against bullet-structure rules.
    const { trailers, bodyEnd } = parseTrailers(bodyLinesRaw);
    const bodyLines = bodyLinesRaw.slice(0, bodyEnd).filter(l => l.trim() !== '');

    if (bodyLines.length === 0) {
        return violations; // only trailers, no real body content
    }

    // Group physical lines into logical bullets: a "- " line optionally
    // followed by exactly one indented (2-space) continuation line with no
    // "- " of its own. Anything else - a line that's neither a bullet
    // marker nor a valid continuation of the immediately preceding bullet -
    // is narrative shape and hard-blocks below.
    const bulletGroups = [];
    let narrativeLine = null;
    for (let i = 0; i < bodyLines.length; i++) {
        const line = bodyLines[i];
        if (BULLET_RE.test(line)) {
            bulletGroups.push({ lines: [line] });
        } else if (CONTINUATION_RE.test(line) && bulletGroups.length > 0 && bulletGroups[bulletGroups.length - 1].lines.length === 1) {
            bulletGroups[bulletGroups.length - 1].lines.push(line);
        } else {
            narrativeLine = line;
            break;
        }
    }

    if (narrativeLine !== null) {
        violations.push({
            rule: 'MSG-BODY-NARRATIVE',
            overrideEligible: false,
            message: `Commit body contains a line that isn't a bullet or a valid continuation: "${narrativeLine}". Every bullet must start with "- "; a bullet may wrap onto at most one continuation line, which must be indented exactly 2 spaces and not itself start with "- ". This includes narrative prose broken into short unmarked lines - that's still prose, not a bullet list.`,
            correction: 'Rewrite the body as bullet points, each starting with "- " (with at most one 2-space-indented continuation line per bullet), or remove the body entirely if there is nothing more to say. This is a hard block with no override.'
        });
        return violations; // structural violation supersedes count/length checks
    }

    if (bulletGroups.length > BULLET_COUNT_MAX) {
        violations.push({
            rule: 'MSG-BODY-BULLET-COUNT',
            overrideEligible: true,
            message: `does this commit bundle together several separate things? consider splitting it into multiple commits. (Body has ${bulletGroups.length} bullets, over the ${BULLET_COUNT_MAX}-bullet cap.)`,
            correction: `If this genuinely is one coherent unit of work, describe it with fewer, broader bullets rather than listing every touched file. If it truly can't be reduced, add a "Sentinel-Override: <reason>" trailer to this commit to proceed anyway.`
        });
    }

    for (const group of bulletGroups) {
        const combined = group.lines.join(' ').replace(/^- /, '').replace(/ {2}/, ' ');
        if (combined.length > BULLET_MAX) {
            violations.push({
                rule: 'MSG-BODY-BULLET-LENGTH',
                overrideEligible: false,
                message: `Bullet exceeds ${BULLET_MAX} combined chars: "${group.lines.join(' / ')}"`,
                correction: `Shorten this bullet (including its continuation line, if any) to ${BULLET_MAX} combined characters or fewer.`
            });
        }
    }

    return violations;
}

module.exports = { checkCommitMessageStructure, getOverrideReason, SUBJECT_MAX, BULLET_MAX, BULLET_COUNT_MAX, BULLET_RE };

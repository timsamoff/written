# Written & Formatted — v2 Design Doc & Upgrade Strategy

## About this document

This is the design doc and upgrade strategy for a v2 of the `app/` editor (Written & Formatted). It's kept separate from `docs/DESIGN.md` (the as-built overview of the current system) and `CLAUDE.md` (operational context for AI coding agents) because it describes a *proposed* future state, not the current one — where those two documents disagree with this one, they are correct about what exists today, and this document is correct about what's being proposed.

Sections marked **Decided** are settled and ready to scope into implementation work. Sections marked **Open** are real unresolved questions — recorded honestly as open rather than papered over with a forced answer. A full history of how each decision was reached (including reasoning that was later found to be wrong) lives in the Decision Log appendix at the end of this document, so nothing gets quietly revised away.

---

## 0. Immutable clause: semantic markup and accessibility

**This clause is non-negotiable and overrides any other section of this document if the two ever conflict.** The app must use strict semantic HTML markup and must be as close to 100% accessible as practically achievable, at every stage of this plan. No feature described below ships in a form that regresses this — a feature that can't be built accessibly gets redesigned, not shipped with a known accessibility gap and a note to fix it later.

**Starting point, so this clause has a real baseline to hold the plan to, not just a stated value:** `app/index.html` already reflects genuine accessibility investment — skip links (`.skip-links`), `role="banner"`/`role="main"`/`role="region"` landmarks, `aria-label`/`aria-labelledby`/`aria-describedby` throughout, `aria-live` regions on the toast and preview status, focus-trap handling in modals (`trapHandler`), and a visually-hidden live announcer (`#liveAnnouncer`). This is a real baseline already in place, described accurately (not aspirationally) in `docs/DESIGN.md`'s Part 6 findings and this doc's own Section 1.1. v2 must not regress any of it.

**What this means concretely for each section of this plan:**
- **Section 2.2 (focus-scoped tag reveal)** is the piece most at risk of quietly violating this clause, and needs explicit design attention, not an assumption that it'll be fine: a `contentEditable`-based single pane must still expose correct semantic structure to assistive technology (real heading elements for section headings, real `<em>`/`<strong>` for italic/bold, proper list markup for `[bullet]`/`[num]`/`[alpha]`, footnote references that remain correctly linked and announced) — not a visually-formatted `<div>` soup that merely *looks* like the Live Preview does today. Screen-reader behavior when tags reveal/hide on focus also needs explicit verification — a sighted-only interaction model is not acceptable here.
- **Section 3 (tiered tag vocabulary)** must keep the "advanced" tier fully reachable via keyboard and assistive tech, not just visually de-emphasized — tiering is a simplicity aid, not a way to make less-common functionality harder to reach for someone who needs it.
- **Section 4 (reworked Help)** must keep the same or better semantic/ARIA structure as the current Help modal, which already does this reasonably well.
- **Section 6 (keyboard shortcuts)** directly serves accessibility as well as convenience — a hotkey system, done correctly, is itself an accessibility feature for anyone who navigates primarily by keyboard. Any new shortcut must not collide with or break existing assistive-technology keyboard conventions (e.g. screen reader browse-mode single-letter navigation).
- **Section 5 (synced scrolling)** and **Section 2.3 (dual-pane opt-in)** must preserve the existing `aria-live="polite"` behavior on the preview region rather than introducing scroll-triggered updates that spam or starve screen-reader announcements.
- **Section 6a.1 (word/character count)** must be exposed as more than a visual-only number — a screen-reader user needs a way to query it (e.g. an `aria-label`-described element a screen reader can navigate to on demand) without it being read aloud on every keystroke, which a naive `aria-live` region would do and which would be actively harmful, not helpful.
- **Section 6a.2 (find/replace)**, if built, must be a fully keyboard-operable, properly labeled dialog (matching the existing modal pattern's `role="dialog"`/`aria-modal`/focus-trap conventions already used elsewhere in `app/index.html`) — not a lightweight unlabeled overlay bolted on separately from how every other dialog in this app already works.

**Verification expectation:** before any v2 feature in this document is considered done, it needs an explicit accessibility check as part of its own definition of done — not deferred to a general "accessibility pass" at the end. Automated tooling (e.g. axe, Lighthouse) plus actual keyboard-only and screen-reader walkthroughs, matching the rigor already implied by `app/index.html`'s existing markup.

---

## 0a. Immutable clause: static hosting only (GitHub Pages-compatible)

**This clause is non-negotiable, on the same footing as Section 0.** `app/`, like the rest of this project, is a static HTML/CSS/JS surface with no build step and no server-side component — deployable as-is to GitHub Pages or an equivalent static host. This was true of v1 and remains a hard constraint for v2, not a default that quietly stops applying once the plan gets more ambitious. It is documented explicitly here — not left implicit — precisely because several pieces of this plan (a `contentEditable`-based editing model, autosave, find/replace, undo/redo) are exactly the kind of feature that, in a general context, tempts a design toward "just add a small backend for this." None of that is available or acceptable here.

**What this rules out, concretely, for this specific plan:**
- No server-side persistence of any kind for anything in this document. Autosave (Section 6a.3) must remain `localStorage`-based, including any rotating-snapshot extension — never a network call to save state.
- No server-side rendering, processing, or generation step for the single-pane focus-scoped reveal mechanism (Section 2.2), the tiered toolbar (Section 3), or any other feature — everything runs entirely in the browser, exactly as today.
- No dependency introduced by any feature in this document that requires `npm install`, a bundler, a transpiler, or any build step before the files can be served directly. Whatever JavaScript is added for `contentEditable` handling, undo/redo, or find/replace must be plain, directly-servable JS, consistent with the rest of `app/wf.js` today.
- No assumption that a future version of this plan could "just" add a lightweight backend if a static-only implementation of some feature turns out to be hard. If a feature in this document cannot be built statically, the feature gets redesigned or dropped — the same non-negotiable posture as Section 0's accessibility clause.

**Where this interacts with specific sections:**
- **Section 2.2** (`contentEditable` reveal mechanism) — must be pure client-side DOM manipulation, matching the rest of `app/wf.js`'s existing browser-only conversion pipeline.
- **Section 6a.3** (autosave visibility / rotating snapshots) — stays `localStorage`-scoped; explicitly not a reason to introduce any server-side save endpoint, even an optional one.
- **Section 6a.2** (find/replace) — a pure client-side text-search feature against the in-browser document state; no server involvement of any kind is implied or needed.

This clause is what keeps this whole plan consistent with the standing assessment in Section 1.1 — part of why the app is worth building at all is that it has "no material ongoing cost or dependency risk (no framework, no build step, no server cost beyond static hosting)." A v2 that quietly introduced a server dependency to solve a hard problem would undermine that exact justification, not just violate an arbitrary rule.

---

## 1. Why a v2, and why now

### 1.1 Standing assessment: is this app (and the site) worth the effort?

Evaluated against the actual goal — **simple for writers, with some technical options available, not feature-parity with the broader editor market** — not against "does it compete with Google Docs/Notion/Ghost."

**Verdict: yes, confidently, on both counts (the app and the site).**

What the app already gets right against that bar:
- A genuinely narrow, literary-specific formatting vocabulary — drop caps, epigraphs, manuscript submission headers, pull quotes, footnotes with backlinking, section ornaments. No general-purpose tool (Google Docs, Notion, even Scrivener) offers manuscript-format headers or citation-backlinking without fighting the tool's own generality to get there.
- Auto-parsing is implemented well, not superficially: `smartenQuotes()` (`app/wf.js:87`) handles real edge cases (word-boundary apostrophes vs. opening quotes) rather than a naive find-replace; `isSectionBreak()` (`app/wf.js:137`) recognizes eight plain-text divider conventions people already type instinctively (`***`, `---`, `~~~`, etc.), with nothing new to learn.
- Three export shapes (standalone HTML, embeddable snippet, base CSS) map to the three real situations a self-publishing writer hits: read it alone, paste into a CMS, or theme it yourself. Complete and deliberately small — not a compromise version of something bigger.

Where it currently undercuts its own philosophy — this is where v2 effort actually belongs:
- The syntax reference shows ~25 tags at once with no signal of which 4-5 are used in a typical piece versus which are rare. For a non-technical writer, the intimidation point is the *size* of the vocabulary shown up front, not tags appearing in text.
- Help content explains the mechanism ("every tag follows `[tag]content[/tag]`") rather than leading with outcome ("want a pull quote? click here").
- Technical and non-technical users get an identical interface today. There's no actual lever for "some technical options" as a distinct tier from the default experience.

On whether the site is worth maintaining publicly at all: yes, and for a reason unrelated to feature-competitiveness. It's a personal publishing site with a coherent, deliberate design, no material ongoing cost or dependency risk (no framework, no build step, no server cost beyond static hosting), doing the one job it needs to do — publish this specific person's writing in a format shaped by his own conventions — better than any general tool would, because it isn't shaped by a vendor's assumptions.

**A sharper version of this same point (added 2026-09-14):** the app's real job was never "formatting text" — it's closer to a compiler. It takes messy external input (a Google Docs paste, ChatGPT-generated markdown, hand-typed prose) and transforms it into this project's exact, opinionated semantic HTML, matching this site's actual conventions (the `ragged` class, the specific document structure documented in `CLAUDE.md`), in this project's specific export shapes. No generic editor does that, because no generic editor knows what this project's conventions mean — even a very good WYSIWYG tool's output would still need exactly the cleanup pass this tool exists to make unnecessary. This is a different, sturdier justification than "the formatting vocabulary is narrow" (the original framing above): it's not that this tool does a narrower version of what a general editor does, it's that it does a fundamentally different job that no general editor is positioned to do at all. See Section 2.4 for how this reframes the core interaction-model question.

### 1.2 v2 mandate

Given the above, v2's mandate is narrow and specific: **make the simple path radically simpler for a non-technical writer, without removing any capability from a writer who wants the technical view.** Every decision below is evaluated against that, not against "what would a full editor rewrite look like."

---

## 2. Core interaction model — **Decided**

### 2.1 Single pane is the default interface

The default editing experience becomes **one pane**: a live-formatted view that a writer types directly into. No separate Live Preview panel is shown by default, and no visible bracket tags in the default state.

### 2.2 Tags stay real, and reveal on focus (Typora model)

The document's actual source is still the plain-text bracket-tag language — nothing changes about what's stored or exported. Tags are hidden by rendering, not deleted or transformed: the tag markup around the block your cursor is currently in becomes visible in place, then re-hides when focus moves elsewhere. This is the same mechanism used by Typora and Obsidian's Live Preview mode.

This was chosen over a whole-document mode switch (iA Writer/Gutenberg-style, toggle the entire view between raw and rendered) because the original constraint was never "hide tags from everyone" — it was "let a writer who doesn't want to see tags not have to, while hand-editing stays available, not demoted to a separate mode you have to deliberately switch into."

### 2.3 Dual-pane is an opt-in secondary view, with tags always visible — **Decided**

Today's two-pane layout (tag-source input + separate Live Preview) is not removed. It becomes an **optional view** a writer can turn on — the "technical option" tier this doc's mandate calls for.

**When dual-pane is enabled, the source pane always shows raw tags — no focus-scoped hiding.** A writer who has opted into the technical view has already signaled they want to see the markup plainly; inline-hiding would work against that intent. This applies only to the opt-in dual-pane mode — the single-pane default (2.2) still uses focus-scoped reveal.

This resolves cleanly rather than as a compromise: the comparative research behind this doc found that permanent two-pane source+preview specifically serves people who want continuous raw-text visibility (the audience for tools like StackEdit and HackMD), which is a real, legitimate way of working, not an inferior version of single-pane. Keeping it as an option rather than deleting it costs little — the existing two-pane implementation doesn't need to be rebuilt to ship the new default, it needs to stop being the only choice.

### 2.4 Why this isn't "just another WYSIWYG editor" — and why that's an acceptable answer

Mechanically, a single pane where you type and see (and edit against) formatted output *is* the core move of every WYSIWYG editor — Typora, Obsidian, iA Writer, and Ulysses are all arguably WYSIWYG in the loose sense, and that hasn't stopped them from being the right tool for exactly this kind of writer. This app's actual differentiator was never going to be the interaction mechanism; it's the same one true differentiator noted in 1.1 — a narrow, literary-specific formatting vocabulary — plus one architectural property most general WYSIWYG tools don't have: **the tag-based plain text remains the one real source of truth**, never reverse-derived from rendered DOM state. That property is what keeps hand-editing, the export pipeline, and this whole doc's plan honest and low-risk (see Section 7).

**A more fundamental version of this same answer** (added 2026-09-14, from a separate conversation the site owner had about this same question): "formatting text" was never actually this app's job. Its real job is closer to a compiler — take messy external input (a Google Docs paste, ChatGPT-generated markdown, hand-typed prose) and transform it into this project's exact, opinionated semantic HTML, matching this site's real conventions (the `ragged` class, the specific `story-content`/heading/footnote structure documented in `CLAUDE.md`), in this project's specific export shapes (standalone page, embeddable page with external CSS, tagged plain text). No generic editor — WYSIWYG or otherwise — does that, because no generic editor knows what this project's conventions mean. Even a very good general WYSIWYG editor's output would still need exactly the cleanup pass this tool exists to make unnecessary. That's not a nice-to-have difference from a generic editor; it's a different category of tool that happens to share a UI shape with one.

This reframes the real design question underneath Sections 2.1-2.3 more precisely than "one pane vs. two, and how do tags reveal." The actual question is: **how much precision-editing access to the raw semantic markup should be preserved once formatting happens automatically** — and given what this tool is actually for (a compiler to *this project's* exact markup, not a general writing surface), the honest answer is *more than zero access, probably rendered inline rather than tucked away in a separate pane.* This is precisely what Section 2.2's focus-scoped reveal already commits to (tags reappear inline, in place, when you focus a block) rather than, say, a whole-document raw/rendered toggle (Section 2.2's rejected alternative) or a permanently-hidden WYSIWYG surface with no markup access at all. In other words: this later reasoning independently arrives at the same architecture already decided in Section 2.2, but for a sturdier reason than "matches Typora's UX pattern" — it's a direct consequence of what the tool's job actually is, not just a well-precedented interaction choice.

**This is not an argument for a more capable or more competitive WYSIWYG editor — it's the opposite, stated explicitly so it isn't misread.** The compiler framing is the reason the tag vocabulary should stay narrow and opinionated (Section 3), not grow toward general-purpose rich-text capability, and the reason raw markup access must never fully disappear behind a rendered surface. It sharpens the reasoning behind the plan already on the table; it does not expand what the plan is trying to build.

---

## 3. Feature: tiered tag vocabulary and toolbar — **Open, needs scoping**

Direct response to the biggest gap found in Section 1.1: today's toolbar and syntax reference present all ~25 tags with equal visual weight, which is the actual intimidation point for a non-technical writer — not tags being visible in text.

**Proposed direction:** split the tag vocabulary into at least two tiers:
- **Common tier** (shown by default in the toolbar and at the top of any reference): bold, italic, link, section heading, pull quote, image, list. The handful of things nearly every piece uses.
- **Advanced/technical tier** (available, but not shown until asked for — an expandable "More formatting" section of the toolbar, or a secondary reference panel): manuscript headers, footnotes/citations, epigraphs, alpha/roman lists, monospace blocks, code blocks, centered-text wrapper.

This is explicitly a v2 feature the user asked to be included, not yet scoped in detail. Open questions:
- Exact tier boundaries — which tags are "common" is a judgment call, not a mechanical rule. Needs the user's own sense of which tags they and typical writers reach for most, not just line-count-in-existing-articles as a proxy.
- Whether tiering applies only to the toolbar, only to the reference/help content, or both (leaning: both, since they're currently two separate places exhibiting the same problem).
- Whether tier membership is fixed or a writer can promote a tag to "pinned/common" for their own use (adds complexity; not clearly worth it for a "stay simple" tool — worth deciding against by default unless a real need shows up).

---

## 4. Feature: reworked Help section — **Open, needs scoping**

Direct response to the second gap in Section 1.1: current Help/syntax-guide content explains the *mechanism* (tag syntax pattern) before explaining *outcome* (what a writer actually wants to accomplish).

**Proposed direction:** reorganize Help around outcomes, not syntax categories:
- Lead with "what do you want to do" (start a new piece, add a quote, add an image, submit to a magazine/manuscript format) rather than "here is the tag grammar."
- Each outcome-oriented entry can still show its underlying tag(s) — this isn't about hiding the tags from documentation, it's about not requiring a writer to already understand tag *syntax as a system* before finding the one tag they need right now.
- Should track the tiering work in Section 3 — the "common" tier of tags is naturally also the "most people start here" section of a reworked Help.

Not yet scoped: actual content rewrite, whether Help becomes contextual (e.g., a "?" next to each toolbar button linking to just that tag's explanation) rather than one monolithic modal. Both are reasonable; not decided.

---

## 5. Feature: synced continuous scrolling (dual-pane mode) — **Open, needs scoping**

Requested directly: replace today's click-to-jump sync behavior with continuous synced scrolling when dual-pane mode (2.3) is active.

**Current behavior:** clicking a word/line in one pane jump-scrolls the other pane to the matching position (`findAndScrollToLine()`, used by `syncPreviewToInputLine()`/`syncPreviewToInputLineImmediate()` in `app/wf.js` — see `CLAUDE.md`'s Code cleanup notes for this function's refactor history).

**Requested behavior:** both panes scroll together proportionally as either is scrolled, without requiring a click — "keep both panes showing roughly the same point in the document at all times" rather than "jump to this exact word." This is a materially different interaction, not a tweak to the existing functions.

This pairs naturally with 2.3: a writer who has opted into dual-pane mode specifically to watch both representations at once is more likely to be scrolling-and-comparing than clicking a specific word to check its rendering.

Not yet scoped:
- Whether continuous sync fully replaces click-to-jump, or both coexist (continuous sync as passive/ambient behavior, click-to-jump still available for "take me to exactly this word" precision). These serve genuinely different intents; coexistence is worth considering rather than assuming one replaces the other.
- The actual sync algorithm. The two panes don't have matching total heights or line-wrapping — tag markup in the source pane takes more vertical space per "unit of content" than its rendered equivalent — so this can't be a naive 1:1 scrollTop mapping. Needs a proportional or nearest-matching-content-block approach.

---

## 6. Feature: keyboard shortcuts for formatting — **Open, needs scoping**

Requested directly: hotkey support for as many formatting options as possible, so a writer isn't required to reach for the toolbar (or type tags by hand) for common formatting actions.

**Current state: there is no formatting-hotkey system in `app/` today.** Checked directly — the only existing `keydown` handling in `wf.js` is for closing modals on Escape; there is no Ctrl/Cmd-based shortcut for bold, italic, or any tag insertion. This is a genuinely new feature, not an extension of a partial one.

**Why this is lower-risk than it might sound:** the toolbar already funnels every tag-insertion action through a small number of existing, working functions — `wrapSelection(openTag, closeTag, blockMode)` for inline/wrapped tags (bold, italic, pull quote, aside, epigraph, etc.) and `insertList(type)` for list blocks. A hotkey handler doesn't need new insertion logic; it needs a `keydown` listener that matches a key combination and calls the same function the corresponding toolbar button already calls. This is additive in the same sense as the rest of this doc's plan (see Section 7, Architecture and risk) — no rework of existing insertion behavior required.

**Proposed direction:**
- Standard, expected combinations where they exist by genuine convention: Ctrl/Cmd+B for bold, Ctrl/Cmd+I for italic (matching `[b]`/`[i]`, the two tags every writer reaches for most).
- Beyond those two, there is no pre-existing convention to match (no universal standard hotkey for "insert a pull quote" or "insert an epigraph"), so the rest of the mapping needs to be designed, not assumed. Proposed approach: pair with the tag-tiering work (Section 3/7 below) — give the "common" tier tags their own hotkeys first (link, section heading, image, list), and treat "advanced" tier tags as toolbar/menu-only unless a specific need for a hotkey shows up. Matches the same "simple by default, technical options available" shape as the rest of this plan, rather than assigning ~25 hotkeys nobody will remember.
- Needs a visible reference — hotkeys nobody can discover don't help a non-technical writer. Natural fit with the reworked Help section (Section 4): show each common tag's hotkey alongside its outcome-oriented explanation, and/or as a tooltip on the corresponding toolbar button.

Not yet scoped:
- The exact key mapping beyond Bold/Italic — needs the same "what's actually common" judgment call flagged in Section 3, not a mechanical assignment.
- Conflicts with browser/OS-reserved shortcuts (e.g. Ctrl/Cmd+B is genuinely safe almost everywhere, but some combinations a writer might expect are already claimed by the browser and can't be overridden reliably).
- Whether hotkeys should work identically in both the single-pane default (Section 2.2) and the dual-pane opt-in view (Section 2.3), or whether the focus-scoped reveal mechanism in the single-pane view needs any special handling when a hotkey fires while a tag is mid-reveal. Likely fine either way, but not yet verified against a working prototype of Section 2.2.

---

## 6a. Additional quality-of-life gaps found on review — **Open, needs scoping**

A full re-read of this document (2026-09-13) surfaced several gaps that aren't addressed anywhere above, despite being the kind of thing a real "simple for writers" upgrade should cover. None of these were explicitly requested — they're proposed here as candidates, not commitments, and should be triaged against the phasing in Section 8 rather than assumed to all matter equally.

### 6a.1 Visible word/character count

**Checked directly: there is no live word or character count visible anywhere in the editor UI today.** The only word-count logic that exists (`countBodyWords()`, referenced by `renderManuscript()`) computes a count solely for the manuscript-header block's own display — it isn't surfaced anywhere else, and a writer with no `[manuscript]` block in their piece never sees a count at all. For a tool explicitly aimed at writers (some literary submissions have hard word-count requirements), this is a real, surprising gap. Proposed: a small, unobtrusive live count (words and/or characters) in the pane header or status area, visible regardless of whether a manuscript header is present. Low risk, no architectural dependency on anything else in this doc — could ship independently, any time.

### 6a.2 Find and replace

**Checked directly: no find/replace functionality exists anywhere in `app/`.** For anything beyond a short piece, a writer currently has to rely on the browser's own in-page find (which only searches rendered/visible text, not the tag-source pane reliably) or scroll manually. A basic find, and ideally find-and-replace, inside the editing pane is a standard expectation in any serious writing tool and is currently missing entirely. Worth scoping as its own item — not urgent relative to the core pane-model work, but a real, currently-totally-absent capability, not a refinement of something partial.

### 6a.3 Autosave visibility and recovery confidence

Autosave to `localStorage` already exists (`autosaveToLocalStorage()`/`loadFromLocalStorage()`), but two things about it are worth reconsidering as part of this upgrade:
- **No visible confirmation that autosave happened.** A writer has no in-the-moment signal ("Saved" indicator, timestamp) that their work is actually being preserved — they have to trust it silently. `wf.js`'s existing `showToast()` mechanism (see `CLAUDE.md`) is a ready-made way to surface this without new infrastructure — a subtle, infrequent "Saved" toast (or a persistent small status label, less intrusive than a toast for something this frequent) rather than nothing at all.
- **Single-slot autosave, no version history.** Only the most recent state is kept (`AUTOSAVE_KEY`, one value). If a writer's browser tab crashes or they accidentally clear the field after a bad autosave cycle, there's no fallback. Not proposing a full version-history feature (real scope creep for this tool), but even keeping the last 2-3 autosave snapshots (rotating) would meaningfully reduce catastrophic-loss risk for very little added complexity, and fits "some technical options" without adding a whole feature surface to the default experience.

This becomes more relevant, not less, once the single-pane `contentEditable` model (Section 2.2) ships — a newer, less-tested editing surface is exactly where a writer benefits most from clear save confidence.

### 6a.4 Undo/redo across the new pane model

Flagged already as an open implementation question in the single-pane-reveal design brief (`wf-v2-single-pane-reveal-design-brief.md`, open question 4), but worth stating plainly here as its own concern rather than a footnote: today's undo/redo is whatever the browser gives a real `<textarea>` for free. A `contentEditable`-based single pane does not automatically inherit equivalent undo behavior — browsers' native `contentEditable` undo stacks are notoriously inconsistent across browsers and easily broken by any JS that programmatically manipulates the DOM (which this feature inherently needs to do, to reveal/hide tags). **This needs explicit design, not an assumption that Ctrl/Cmd+Z will "just work"** the way it does today. Given `app/wf.js` already works around a deprecated `document.execCommand('insertText')` API elsewhere with a manual fallback (see the original design-quality audit's Part 1 findings), this project has direct prior experience with exactly this class of `contentEditable`/native-API fragility — worth consulting that experience directly when this is scoped.

### 6a.5 Distraction-free / focus mode

Not previously discussed, but a natural complement to the single-pane default (Section 2.2): once the default view is a clean, single formatted pane rather than a three-column layout (controls + input + preview), a "hide the formatting-options sidebar and toolbar, show just the writing surface" focus mode becomes a small, cheap addition rather than a new concept — most of the visual decluttering it wants is already a side effect of Section 2.2 shipping. Worth considering as a near-free bonus once the single-pane work lands, rather than its own major effort. Not committing to it here — flagged as a candidate, not a requirement.

### 6a.6 Session/tab-close warning

**Checked directly: no `beforeunload` warning exists today.** A writer who accidentally closes the tab or navigates away mid-edit currently loses anything not yet autosaved, with no browser-level warning. Given autosave already exists (6a.3) but isn't instantaneous on every keystroke, a standard "unsaved changes" browser warning on tab close/navigation is a small, well-understood addition that meaningfully reduces accidental data loss. Low risk, no dependency on anything else in this doc.

---

## 7. Architecture and risk

The plan above is deliberately **additive, not a rewrite**:
- The plain-text tag string remains the single source of truth for the document, in every mode (single-pane default, dual-pane opt-in). Nothing is reverse-derived from rendered DOM state. This is the one architectural line this whole plan depends on — see 2.4.
- The export pipeline (standalone/embed/base CSS, all four already deriving from one shared tag-source string) needs no changes in principle, since the source format doesn't change.
- The existing two-pane Live Preview implementation is kept, not discarded — it becomes the dual-pane opt-in view (2.3) rather than being rebuilt from scratch.
- Keyboard shortcuts (Section 6) hook into existing tag-insertion functions (`wrapSelection()`, `insertList()`) rather than needing new insertion logic — genuinely additive, not a rework.
- Word/character count, tab-close warning, and autosave-visibility (Sections 6a.1, 6a.3, 6a.6) are all genuinely independent of the rest of this plan — none of them touch the pane model, the tag language, or the export pipeline. They can be built and shipped at any time, including before Section 2.2 lands.
- The new work that is genuinely new: the focus-scoped inline reveal/hide mechanism for the single-pane default (2.2) has no existing implementation in this codebase to extend, and no open-source equivalent exists for a fully custom bracket-tag vocabulary (Typora's version is built for standard Markdown) — this needs to be built specifically for this project's tag set. Undo/redo behavior (6a.4) and find/replace (6a.2) both interact directly with whatever the single-pane model turns out to be, so neither can be fully scoped until Section 2.2's open implementation question (contentEditable vs. alternative) is resolved.

**Risk framing:** the riskiest single piece is the focus-scoped reveal mechanism (2.2), since it's genuinely new code with no direct precedent to adapt, and it's what makes undo/redo (6a.4) a real open risk rather than a non-issue. Everything else in this plan (tiering, Help rework, dual-pane opt-in, sync scrolling, keyboard shortcuts, word count, tab-close warning, autosave visibility) is either additive UI work or a scoped algorithm problem, lower-risk by comparison.

---

## 8. Suggested phasing

Not a commitment, just a reasonable order given the dependencies above:

**Can ship any time, no dependencies** — worth doing early as low-risk wins independent of the rest of this plan:
- Word/character count (6a.1)
- Tab-close warning (6a.6)
- Autosave visibility (6a.3)

**Sequenced work:**
1. **Single-pane default with focus-scoped tag reveal** (Section 2.2) — the riskiest and most foundational piece; everything else below depends on this existing first, including undo/redo (6a.4) and find/replace (6a.2) design decisions.
2. **Dual-pane opt-in toggle** (Section 2.3) — mostly wiring, since the two-pane implementation already exists; mainly needs the "always show raw tags in this mode" behavior confirmed and the toggle itself.
3. **Tiered tag vocabulary** (Section 3) — independent of 1-2, could be built in parallel or first if it's judged higher-value sooner.
4. **Reworked Help section** (Section 4) — depends on Section 3's tiering being settled, since Help should reflect the same tiers.
5. **Keyboard shortcuts** (Section 6) — Bold/Italic can ship independently and early (no dependency on anything else in this doc); the rest of the mapping depends on Section 3's tiering being settled first.
6. **Find/replace and undo/redo verification** (6a.2, 6a.4) — scoped once Section 2.2's implementation approach is settled, since both depend directly on it.
7. **Synced continuous scrolling** (Section 5) — depends on dual-pane (2.3) existing, since it's specifically a dual-pane-mode feature.
8. **Distraction-free/focus mode** (6a.5) — cheap bonus once Section 2.2 ships; not worth scoping before then since most of its value is a side effect of the single-pane default already existing.

---

## Appendix: Decision log

This appendix preserves the conversational history behind Sections 1-2, including reasoning that was later found to be wrong, so nothing is quietly revised away.

### How the "differs from WYSIWYG" question was resolved

The first response to the non-technical-writer question wasn't just a menu of options — it included real analysis, later found to be based on a misreading:
- Full WYSIWYG (a `contentEditable`-backed editor with no visible markup at all, forcing the export pipeline to be reverse-derived from DOM state) was ruled out early as disproportionate and inconsistent with the project's no-build-step/no-framework posture. This conclusion held up and is reflected in Section 2.4.
- A "Show source" toggle was initially recommended as a smaller, safer middle ground, on the theory that it would sit *alongside* the existing two-pane layout. This was a misreading of what was actually being proposed (collapsing to one pane entirely) — once corrected, the "smaller, safer" framing didn't hold, since a single live-formatted editing pane is mechanically the same move as WYSIWYG, not a lighter version of a toggle. Flagged explicitly rather than quietly revised away.

Comparative research was then run against real, currently-available tools to answer the question honestly. Findings:
- A single formatted pane with an optional show-source mechanism is not a compromise or rare pattern — it's the dominant approach among tools aimed at non-technical or semi-technical writers: Typora, Obsidian (Live Preview), iA Writer, Ulysses, WordPress Gutenberg, Ghost's Koenig editor, and BBCode forum editors all land on this spectrum, differing mainly in *how* source is exposed (whole-document mode switch vs. focus-scoped inline reveal vs. nearly-suppressed).
- True permanent two-pane source+preview survives specifically among developer-adjacent, technical-writing tools (StackEdit, HackMD, Dillinger) used by people already fluent in the raw syntax who want continuous visibility for diffing, version control, or collaboration — a different user than this app's target.
- No existing tool was found combining a fully custom bracket-tag vocabulary with Typora's inline-hiding mechanism specifically — not a warning sign, but confirmation that the reveal/hide behavior needs to be built for this project's tag set rather than adapted from an existing implementation.
- Conclusion: the honest answer to "does this differ from WYSIWYG" is that it doesn't need to, mechanically, to be the right tool — every strong precedent (Typora, Obsidian, iA Writer, Ulysses) is arguably WYSIWYG in the loose sense. The real differentiator is the formatting vocabulary and the tag-string-as-source-of-truth property, not the interaction mechanism. This is what Section 2.4 states as settled.

### How the single-pane-default / dual-pane-opt-in framing was reached

Originally, "one pane" and "two pane" were discussed as competing final answers. The refinement to treat single-pane as default and dual-pane as an opt-in secondary view was proposed as a sharper version of the same recommendation, not a reversal — reasoning:
1. It resolves a real tension the earlier framing left dangling: focus-scoped reveal answers "let me see the tags for *this* line," but not "let me watch the whole rendered document update continuously while editing tags in a separate pane," which is a genuinely different, also-legitimate way of working (it's why StackEdit/HackMD's audience keeps choosing permanent dual-pane even though inline-reveal tools exist).
2. It's strictly additive relative to what's already recommended — the existing two-pane implementation is preserved as an option rather than discarded, lowering overall implementation risk.

The one loose end this raised — whether dual-pane mode's source pane should still use focus-scoped reveal or always show raw tags — was decided in favor of **always-visible raw tags in dual-pane mode** (now Section 2.3), on the reasoning that a writer who has opted into the technical view has already signaled they want to see markup plainly.

### The "compiler, not editor" reframe (2026-09-14)

The site owner had a separate conversation about this same question and brought its conclusions back here. The core argument: this app's real job was never "formatting text" generically — it's closer to a compiler, transforming messy external input into this project's exact, opinionated semantic HTML in this project's specific export shapes. No generic editor, WYSIWYG or otherwise, can do that, because none of them know this project's conventions. This reframes *why* Section 2.2's focus-scoped reveal is the right call (now stated in Section 2.4) more fundamentally than the original market-precedent research did — not "this UX pattern is well-precedented," but "preserving real, inline access to the raw semantic markup is a direct requirement of what this tool actually does."

**Explicit boundary, stated directly when this was added, and worth preserving here:** this reframe is not an argument for building a more capable or more competitive WYSIWYG editor. It's the opposite — it's the reason the tag vocabulary should stay narrow and opinionated (Section 3's tiering work) rather than grow toward general-purpose rich-text capability, and the reason raw markup access must never fully disappear behind a rendered surface (which is exactly what Section 2.2 already committed to, and exactly what ruling out full WYSIWYG in the original research already established). The "compiler" framing sharpens the existing plan's reasoning; it does not expand its ambition.

# Retrospectively repair damaged `/prepare-for-review` handoff comments

ENG-248 · Agent Config · blocked-by ENG-216

## Problem

Between the introduction of `/prepare-for-review` (ENG-182) and the landing of ENG-216, Step 6 of `agent-config/skills/prepare-for-review/SKILL.md` wrote handoff comments through an **unquoted** heredoc that ran command substitution on backticks the agent typed. Every inline-code span in the template body (`` `clean-branch-history` ``, `` `/prepare-for-review` ``, `` `CLAUDE.md` ``, etc.) was interpreted as a shell command and either elided (content-elision — "command not found", empty string substituted) or replaced with the command's stdout (stdout-injection — most often a resolved SHA from a `git merge-base …` expression).

ENG-216 fixes the bug going forward by replacing the single unquoted heredoc with three blocks (dynamic `printf` prefix + quoted-heredoc static body + dynamic `printf` + `git log >>` footer). That closes the bug's forward surface. It does NOT repair the handoff comments already posted through the buggy template.

### Damage surface

- Agent Config project: **27** issues carry the `<!-- review-sha:` marker identifying a Step 6 handoff comment. Machine Config: 0. No other projects produce these comments.
- Sample of 6 taken during ENG-216 design (ENG-204, ENG-217, ENG-220, ENG-228, ENG-230, ENG-232): exactly 1 visibly damaged (ENG-204). Five others preserved their backticks intact — most plausibly because the agent has been deviating from the literal template in many sessions (assembling the body via `printf` or recognizing the heredoc footgun).
- Structural property of the bug: **damage can only occur inside backticks.** Everything the agent wrote outside backticks is preserved verbatim. Therefore every damage site is, by construction, a restoration of what was inside a backtick pair — never a prose edit.

The cosmetic damage on ENG-204 is the sole empirical reproducer we can study: ~9 content-elision sites (skill names, slash-commands, file names lost from within backticks) plus 1 stdout-injection site (a resolved 40-hex SHA replacing what was almost certainly `` `git merge-base HEAD main` ``).

## Scope

### In scope

- All 27 Agent Config comments bearing `<!-- review-sha:` (count refreshed via live GraphQL query at session start).
- Both damage classes: content elision and stdout injection.
- Mechanical auto-restoration for comments where every damage site clears the exactly-one-candidate gate (see "Mechanical gate" below).
- Non-mechanical proposal posting to **ENG-248's own comment thread** for comments with any site that doesn't clear the gate.
- ENG-204 (the reproducer): treated as any other candidate. No special-case path.
- One commit to `main`: this spec file, landed by `/ralph-spec` finalization (not by the autonomous session).

### Out of scope

- Machine Config project (empirically 0 marker-bearing comments).
- Comments without the `<!-- review-sha:` marker — they weren't written through the buggy heredoc.
- Linear issue descriptions — created/updated via `--description` / `--description-file`, not the Step 6 template.
- Fixing the heredoc bug itself — ENG-216 does that; ENG-248 is blocked-by ENG-216.
- Redesigning the `<!-- review-sha: -->` marker's own visibility in Linear rendering — a separate follow-up ticket addresses that.
- Auto-applying non-mechanical restorations — session *proposes* them on ENG-248; manual apply is deferred to Sean.
- Scanning or repairing damage in non-handoff comments — the bug's surface is scoped to Step 6's template.
- On-main repo artifacts describing per-issue repair evidence (`docs/repairs/<issue-id>.md`, per-issue restored-body files, detection scripts in `agent-config/scripts/`). All per-issue state lives on Linear — edit history, annotations, proposal comments.

## Architecture — three autonomous phases

```
Phase 1: Scan   →   per-comment damage map (in-session state)
Phase 2: Plan   →   restored bodies (in memory) + proposal comment drafts
Phase 3: Write  →   Linear comment edits (mechanical) + proposal posts (non-mechanical)
```

Phase boundaries exist so that:

1. Phase 1 is read-only and repeatable. If the session crashes before Phase 3, re-running rebuilds the same damage map from Linear (the source of truth).
2. Phase 2 is pure inference; no side effects. Plans can be inspected or aborted before anything mutates.
3. Phase 3 is the only phase that writes. Every write is atomic per-comment, and the idempotency mechanism (below) makes mid-sweep interruption safe.

### Phase 1 — Scan

Fetch all candidate comments via a single GraphQL query:

```graphql
query {
  issues(first: 100, filter: {
    project: { name: { eq: "Agent Config" } },
    comments: { body: { contains: "<!-- review-sha:" } }
  }) {
    nodes {
      identifier
      branchName
      description
      comments {
        nodes { id body createdAt }
      }
    }
  }
}
```

For each returned issue, select the comments whose body contains the marker (an issue may have unrelated comments; filter to marker-bearing only). For each candidate comment:

- **Idempotency check:** if body contains `Edited by ENG-248`, mark `already-repaired` and skip further processing.
- **Damage detection:** apply the regex passes below (CE-1/2/3, SI-1/2) line-by-line against the comment body. Exclude lines inside fenced code blocks (between \`\`\` fences), the `<!-- review-sha:` marker line itself, and the `## Commits in this branch` section. Record each hit with line offset, signal name, and the raw matched span.
- **Classification:** comments with zero damage sites → `clean`. Comments with at least one site → `damaged`, retained for Phase 2.

Phase 1 output (in session memory): the scan map, plus a running count of `clean` / `damaged` / `already-repaired` / `out-of-scope-project` dispositions.

### Phase 2 — Plan

For each `damaged` comment, build the per-issue **candidate token vocabulary** from (in priority order):

1. The issue's own spec at `docs/specs/<topic>.md` on main, if one exists. Topic name inferred by matching the branch name slug against filenames in `docs/specs/`.
2. The issue's branch commits: `git log --format='%s%n%b' main --grep="<ISSUE-ID>"` (requires the branch to have been merged; if not, log via `origin/<branch-name>` or skip this source).
3. The branch name — `eng-XXX-<kebab-title>` encodes deliverables as words.
4. The damaged comment's own surviving unquoted prose — tokens mentioned in non-backticked form elsewhere in the body.
5. The Linear issue description — additional context.

Extract the vocabulary by scanning these sources for slash-commands (`/[a-z][a-z0-9-]*`), kebab-identifiers (`[a-z][a-z0-9-]+[a-z0-9]`), file paths (matching common extensions), and filenames. A typical issue produces 5–15 unique tokens.

For each damage site in the comment, attempt classification:

- **Content-elision site (CE-*):** read the syntactic slot (prose immediately before and after the gap). Enumerate vocabulary tokens that are grammatically consistent with the slot. **Mechanical iff exactly one token fits.** Otherwise non-mechanical.
- **Stdout-injection site (SI-*):** automatically non-mechanical. Code-expression inference is not attempted on the mechanical path — it belongs in the proposal file for Sean's review.

A comment's disposition:

- Every site mechanical → **`auto-repair`** planned. Phase 2 produces the full restored body (backticks re-added around restored tokens, SHA-marker intact, original prose untouched) with the **top annotation** inserted (format below).
- Any site non-mechanical → **`proposal`** planned. Phase 2 produces a proposal-comment draft targeting ENG-248's thread (format below). No auto-write for this comment.

### Phase 3 — Write

Iterate planned dispositions in issue-ID-ascending order. For each `auto-repair`:

1. Write the planned restored body to a session tempfile: `mktemp /tmp/eng-248-restore-XXXXXX`.
2. `linear issue comment update "$COMMENT_ID" --body-file "$TMPFILE"`.
3. On CLI failure: post a failure comment to ENG-248 describing the error and which comment failed, **halt the entire sweep.** Do NOT continue to the next comment.
4. On success: re-fetch the edited comment, run Phase 1's **damage detection pass only** against the new body (skip the `Edited by ENG-248` idempotency check, which would otherwise match on the just-inserted annotation and short-circuit the scan).
5. If post-edit damage sites > 0: post failure comment to ENG-248 (restoration didn't clean the signals), halt.
6. On post-edit clean: `rm -f "$TMPFILE"`, continue.

For each `proposal`:

1. Render the proposal draft into a tempfile.
2. Before posting, **re-scan ENG-248's own thread** for an existing proposal comment for this target issue (substring match on the proposal header, see "Proposal format" below). If one already exists, skip — proposal already landed on a prior run.
3. Otherwise, `linear issue comment add ENG-248 --body-file "$TMPFILE"`.
4. On failure: halt sweep, post failure comment on ENG-248 (or, if the failure was posting the proposal itself, log to the session transcript and exit with a non-zero status so the orchestrator surfaces it).

No batched API usage — one Linear write per action, halted at first failure.

After all dispositions processed (or halt), the trailing `/prepare-for-review` invocation on the feature branch posts the session's own handoff comment on ENG-248 with scan/repair statistics in the `**What shipped:**` section.

## Detection heuristics

### Content elision (CE)

Three independent regex signals. Any one firing on a line flags that line as CE-damaged (line may carry multiple signals; each is recorded independently).

| Signal | Pattern | Catches |
|---|---|---|
| **CE-1** | two consecutive spaces in non-code line: `  ` | `` `foo` `` elided mid-prose → `"Added  as Step 4"` |
| **CE-2** | space before closing punctuation: ` [\.,;:!?]` | `` `foo` `` elided at clause end → `"Invoke ."` |
| **CE-3** | floating `'s`: ` 's ` or `^'s ` | `` `foo` ``'s possessive elided → `"Updated 's Integration"` |

Exclusions (lines where signals are suppressed):

- Lines inside fenced code blocks (between \`\`\` delimiters).
- The `<!-- review-sha: ... -->` marker line.
- Lines inside the `## Commits in this branch` section.

Template prose has no legitimate double-spaces, no legitimate space-before-punctuation, and no floating `'s`, so false-positive rate is low.

### Stdout injection (SI)

| Signal | Pattern | Catches |
|---|---|---|
| **SI-1** | bare 40-hex SHA outside the marker line and outside the commits section: `\b[0-9a-f]{40}\b` | `` `git merge-base …` `` resolved to a SHA |
| **SI-2** | narrow autonomous-session-artifact paths (see list below) | `` `pwd` ``, `` `mktemp` ``, `` `realpath` ``, etc. |

SI-2's narrow path shapes — deliberately *not* a blanket absolute-path rule:

- `/Users/seankao/\S+` — current-user home prefix (from `pwd` in a worktree, `realpath` of a local file).
- `/var/folders/[^/]+/[^/]+/T/\S+` — macOS `mktemp` output.
- `/private/var/folders/[^/]+/[^/]+/T/\S+` — macOS `mktemp` in expanded form.
- `/tmp/ralph-handoff-[A-Za-z0-9]{6,}` — the specific `mktemp /tmp/ralph-handoff-XXXXXX` template from Step 6.

Generic paths mentioned in prose (`/etc/hosts`, `/usr/bin/…`, `/opt/homebrew/…`, paths under other users' home directories) are NOT flagged — they're likely legitimate prose references, and a false-positive SI-2 hit's only cost is routing a clean comment to the proposal-review path (extra Sean work, not a bad edit).

## Restoration — the mechanical gate

For each CE site, the mechanical gate applies this test:

```
1. Read the syntactic slot (~30 chars of context on each side of the gap).
2. Enumerate vocabulary tokens that fit grammatically:
   - slash-command slot ("Invoke ___", "Run ___") → slash-commands only
   - verb-object-of-installation slot ("Added ___ as") → skill/script identifiers
   - possessive slot ("___'s Integration") → named objects
   - etc.
3. If exactly one vocabulary token fits: mechanical restoration = that token, wrapped in backticks.
4. Zero candidates, two or more candidates, or gate-logic-insufficient: non-mechanical.
```

Every SI site is classified non-mechanical regardless of gate outcome — inference about the original code expression belongs in the proposal file.

A **comment** is classified `auto-repair` iff **all** its damage sites clear the mechanical gate. One non-mechanical site in a comment blocks auto-edit for the whole comment — no partial edits lurking in the dataset.

### Examples (grounded in ENG-204)

**Mechanical:**
- `"Added ___ as Step 4 in ___, inserted between..."` — two slots. Vocabulary (from branch `eng-204-invoke-clean-branch-history-from-prepare-for-review-before-codex` and commit subject `skill: /prepare-for-review runs clean-branch-history before codex`) yields `clean-branch-history` and `/prepare-for-review`. First slot: "Added ___ as Step 4" — a thing being added. `clean-branch-history` fits, `/prepare-for-review` doesn't (it's being added *to*). Second slot: "as Step 4 in ___" — the container. `/prepare-for-review` fits. Each slot has exactly one candidate. **Auto-restore.**
- `"Confirm Step 4 output shows ___ running"` — slot is subject of "running" in the `clean-branch-history` slot. Only `clean-branch-history` from vocabulary fits. **Auto-restore.**

**Non-mechanical:**
- `"Invoke ___ on a branch with multiple messy commits"` — both `/prepare-for-review` and `/clean-branch-history` are slash-commands in vocabulary and both fit. **Proposal.**
- `"-  uses 4cd6796e5dcd3c6738115d3e1b5123e92ea28c4c unconditionally"` (bullet leading with `-  ` = two spaces, signalling an elided token at start-of-bullet) — the bullet-start gap is CE-style (mechanical candidate: `clean-branch-history`), but the 40-hex SHA later in the line is SI-1, automatically non-mechanical. **Proposal** (because the comment has at least one non-mechanical site).

## Writeback — annotation format

### Top-of-comment annotation (inserted on line 3)

```markdown
## Review Summary
<!-- review-sha: b26350917767caad858927a16677e82c6af68d67 -->
*(Edited by ENG-248 on <YYYY-MM-DD> to restore inline code-span tokens lost to the Step 6 unquoted-heredoc bug. Restored tokens in this comment: `<token-1>`, `<token-2>`, .... Original damaged body preserved in Linear edit history.)*

**What shipped:** <restored body continues as normal>
```

Invariants preserved:

- Line 1: `## Review Summary`.
- Line 2: `<!-- review-sha: -->` marker — dedup in prepare-for-review Step 6 still finds it.
- Line 3: annotation paragraph (new). Contains the idempotency substring `Edited by ENG-248` + the list of distinct restored tokens.

`<YYYY-MM-DD>` is the session's date at write time. The restored-tokens list enumerates distinct tokens only (not every occurrence); for revert purposes, every **backticked** occurrence of a listed token is an ENG-248 edit, every unquoted occurrence is preserved prose. This distinction makes per-span location tracking unnecessary inline.

### Proposal comment format (posted to ENG-248's thread)

The proposal body (everything between the outer `<<<PROPOSAL` and `PROPOSAL>>>` markers below — those markers are for illustration only and are NOT part of the posted body):

<<<PROPOSAL

`**Proposal: restore ENG-<issue-id> handoff comment (non-mechanical)**`

Source comment: *linear-web-url-to-damaged-comment*
Comment ID: *uuid*
Classification: `has-non-mechanical-sites`

`## Damaged body (verbatim)`

(full damaged body in a triple-backtick-fenced block)

`## Damage map`

- Site 1 — line N, slot `"Added ___ as Step 4"`: **mechanical** → `clean-branch-history`
- Site 2 — line M, SI-1 (40-hex SHA `4cd6796…`): **non-mechanical** — suggested `` `git merge-base HEAD main` `` (evidence: ENG-217's spec discusses this line as unconditional `git merge-base HEAD main`)
- ...

`## Proposed restored body`

(full restored body in a triple-backtick-fenced block: mechanical sites filled; non-mechanical sites filled with the suggested token and marked `[?]` inline)

`## Recommended apply`

Review the proposed restored body above. If correct, apply via:

`linear issue comment update <comment-id> --body-file <save the "Proposed restored body" block to a file>`

Or edit the comment directly in Linear's UI.

PROPOSAL>>>

The leading `**Proposal: restore ENG-<issue-id> handoff comment**` line is the idempotency marker for proposal posts — on re-run, the session searches ENG-248's thread for this prefix and skips if the target issue already has a proposal.

**Fenced-block note for the implementer:** the damaged body and proposed restored body are themselves Markdown content that may contain triple-backticks. When posting the proposal, use quadruple-backtick fences (\`\`\`\`) around those two blocks so nested triple-backticks inside the captured body don't prematurely close the wrapping fence.

## Idempotency — re-run safety

No state file, no repo artifacts. All durable state lives in Linear:

1. **Already-repaired comment check (Phase 1):** fetch each candidate comment; if body contains `Edited by ENG-248`, skip through Phase 2 and Phase 3.
2. **Already-posted proposal check (Phase 3, per proposal):** before posting, fetch ENG-248's comment thread and search for `**Proposal: restore ENG-<target-id>` as a body prefix. Match → skip post.

On re-run:

- Re-scans all 27 comments.
- Already-repaired ones → recognized via annotation → skipped.
- Still-clean ones → zero damage signals → skipped.
- Remaining damaged ones → planned + written as usual.
- Already-proposed ones → proposal skipped; auto-repairable ones that weren't yet edited → edited.

Partial-progress state is visible by inspection:

- Look at Linear comment edit counts (comments with `Edited by ENG-248` are repaired).
- Look at ENG-248's thread (each proposal comment is a pending review item).

## Failure modes

| Condition | Action |
|---|---|
| Linear unreachable during Phase 1 | Exit clean with the orchestrator's error path — no Linear writes attempted. |
| Linear API error during Phase 3 comment-update | Post a failure comment on ENG-248 describing which comment failed and the CLI error verbatim. Halt sweep. |
| Post-edit sanity scan still flags damage | Post a failure comment on ENG-248 (quote pre-edit and post-edit body excerpts). Halt. Do NOT retry — the restoration was incorrect. |
| Proposal post fails | Log error verbatim to session stderr, exit non-zero so the orchestrator surfaces the failure. No recovery attempted in-session. |
| Individual mechanical gate fails on a site | Comment classified non-mechanical → proposal path → sweep continues. Normal operation, not a failure. |
| Issue has no corresponding `docs/specs/<topic>.md` on main | Vocabulary built from commits + branch name + prose + description alone. May raise the non-mechanical rate; expected, not a failure. |

## Acceptance criteria

A successful session satisfies all of:

1. **Scan coverage.** Every comment matching the Phase 1 GraphQL query has a disposition recorded (`clean` / `already-repaired` / `auto-repaired` / `proposal-posted` / `failed`). The sum of these counts equals the total returned by the query.
2. **Clean-comment non-interference.** For any comment classified `clean` or `already-repaired`, a post-run re-fetch returns an identical body (byte-exact) to the pre-run fetch. Zero touched-but-supposed-to-be-untouched comments.
3. **Auto-repair correctness.** Each `auto-repaired` comment, when re-fetched post-session, contains the substring `Edited by ENG-248` AND produces zero damage sites under a fresh Phase 1 scan. Byte-exact match against the planned restored body.
4. **Proposal posting.** For each `proposal-posted` disposition, ENG-248's thread contains exactly one comment whose body starts with `**Proposal: restore ENG-<that-issue-id> handoff comment**`. The proposal contains the damaged body (fenced), proposed restored body (fenced), damage map, and recommended-apply command.
5. **Summary handoff.** ENG-248 has exactly one new handoff comment from the trailing `/prepare-for-review` invocation (identified by a fresh `<!-- review-sha:` marker for this session's HEAD). Its `**What shipped:**` section reports scanned/clean/already-repaired/auto-repaired/proposal-posted/failed counts summing to the Phase 1 total.
6. **No stray repo artifacts.** `git diff main..HEAD` on the feature branch shows only this spec file (or absent if already merged to main by `/ralph-spec`) plus any routine commits that `/prepare-for-review` Step 3.5 produced. No `docs/repairs/`, no `agent-config/scripts/repair-*`, no ad-hoc files.
7. **No failures.** `failed` count is zero. If non-zero, at least one failure comment exists on ENG-248 describing what broke; acceptance becomes "Sean reviews and decides next action" rather than "session complete."

## Verification (Sean's post-session QA)

Autonomous sessions have no mid-run checkpoint; Sean verifies post-facto:

1. **Read the summary handoff comment on ENG-248.** One paragraph. Confirm totals match expectation (~27 scanned, majority clean, damaged set covered by auto-repairs + proposals, 0 failures).
2. **Spot-check the ENG-204 auto-repair** specifically — our known-damage reproducer. Open ENG-204 in Linear UI:
   - Top annotation present, lists the expected restored tokens.
   - Each previously-damaged backtick span now contains the expected token.
   - `Edited by ENG-248` substring present.
   - Linear edit history shows the pre-edit damaged version intact.
3. **Skim each of the other auto-repaired comments** (~3–5 total). Confirm top annotation + general readability.
4. **Review each proposal on ENG-248's thread.** For each:
   - Read damaged body (should visibly match a CE/SI signal).
   - Read proposed restored body, judge correctness.
   - Apply via included command or edit in Linear UI if correct. Otherwise defer or fix manually.
5. **Random sample 3–5 comments classified `clean`.** Skim to confirm the detector didn't miss anything.
6. **Confirm repo state.** `git log --stat main..<this-branch>` shows only the spec file as the net addition.

Session is verified once 1, 2, 4 are complete and 3, 5, 6 have passed a skim.

## Prerequisites

- **blocked-by ENG-216.** `/ralph-start`'s preflight queries blockers before dispatch; ENG-248 stays queued until ENG-216 transitions to `Done`. ENG-216 fixes the Step 6 heredoc; without it, new handoff comments are still being produced through the buggy template and any sweep would be immediately obsolete.

ENG-216 is in the Agent Config project (same scope as ENG-248), so the blocked-by relation doesn't trip ralph-start's out-of-scope-blocker preflight.

## Alternatives considered

- **Fully autonomous with a vague confidence gate (Approach A pre-refinement).** Rejected in favor of the sharp mechanical gate described above — "agent felt confident" is fuzzy and invites the silent-sub-confident-restoration failure mode that matches the original bug's shape. "Exactly one vocabulary token fits the slot" is a literal, testable criterion.
- **Scan + propose, no autonomous Linear writes (Approach B).** Initially the recommended approach on the grounds that "autonomous cleanup of autonomous silent corruption" reintroduces the original bug's blast-radius surface. Rejected after establishing that the damage is structurally surgical (inline-code-span only, by the bug's mechanism — prose outside backticks is never touched), which collapses the risk of silent subtle fidelity loss. B's extra manual-apply step becomes pure overhead on top of what is effectively mechanical work.
- **Proposal-as-new-comment hybrid (Approach C).** Rejected — doubles the handoff-comment population per damaged issue (breaks the "one `<!-- review-sha:` marker per issue" invariant that Step 6's `body.contains` dedup relies on) and adds thread noise.
- **Per-span HTML-comment wrappers** (`<!-- eng-248:start --> ...span... <!-- eng-248:end -->` around each restored token). Rejected after empirical confirmation that Linear's renderer displays `<!--` / `-->` as visible text (plus a `-->` → `→` typographic input rule). Every restored span would have rendered with visible `<!-- eng-248:start →` cruft on each side. The restored-tokens list in the top annotation + Linear's native edit history provide sufficient revert support without inline pollution.
- **`docs/repairs/<issue-id>.md` per-issue artifacts on main.** Rejected — per-issue repair state is Linear data, not repo data. Linear already provides durable edit history; the chezmoi repo is for tooling and configuration, not Linear-comment archives. Committing per-issue repair files would duplicate state across two systems without adding auditability beyond what Linear + the proposal thread already give.
- **Fully manual hand-repair of only ENG-204, no sweep.** Rejected — systematic sweep identified 27 candidates; hand-repair of only the one known-damaged comment doesn't scale and loses the evidence base for declaring the rest actually clean.

## Notes

- No `blocked-by` on ENG-248 beyond ENG-216. No other prerequisites.
- Sweep is one-shot. If new damage emerges after ENG-216 lands (e.g., from an as-yet-unknown second bug surface), it's out of scope for ENG-248 — file a new ticket.
- Follow-up filed as **ENG-256** (not a blocker): rework the `<!-- review-sha: -->` marker to stop rendering visibly in Linear. Found while verifying the annotation format for this ticket. ENG-248's annotation format is deliberately independent of ENG-256's resolution (visible italic paragraph rather than a new HTML-comment marker).

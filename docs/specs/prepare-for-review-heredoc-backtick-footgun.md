# Fix heredoc footgun in `/prepare-for-review` Step 6 — markdown backticks eaten by command substitution

ENG-216 · Agent Config

## Problem

Step 6 of `agent-config/skills/prepare-for-review/SKILL.md` writes the Linear handoff comment body via an **unquoted** heredoc (lines 167–197):

```bash
cat > "$COMMENT_FILE" <<COMMENT
## Review Summary
<!-- review-sha: $CURRENT_SHA -->

**What shipped:** Added `clean-branch-history` as Step 4 in `/prepare-for-review`, inserted between ...
...
COMMENT
```

The unquoted heredoc enables both variable expansion (`$CURRENT_SHA` — needed) **and** backtick command substitution (an unintended side effect). Every markdown inline-code span the agent writes with backticks — `` `clean-branch-history` ``, `` `/prepare-for-review` ``, `` `agent-config/CLAUDE.md` ``, etc. — gets interpreted as a command and shelled out. The shell tries to execute the backticked text and fails:

```
zsh: command not found: clean-branch-history
(eval):1: no such file or directory: /prepare-for-review
```

…and the failed substitutions land in the comment body as **empty strings**.

### Two distinct failure modes

The bug is not strictly "delete content." Two failure modes coexist:

1. **Content elision.** Backticked text that doesn't resolve to a runnable command produces a `command not found` error to stderr and is replaced with the empty string in the comment body. Result: gaps in prose. Example from ENG-204's handoff comment: `"Added  as Step 4 in , inserted between ..."` — the bracketed file/skill names are gone.

2. **Stdout injection.** Backticked text that *does* resolve to a runnable command executes that command and substitutes its stdout into the comment body. ENG-204 shows `"clean-branch-history uses 4cd6796e5dcd3c6738115d3e1b5123e92ea28c4c unconditionally"` — the full SHA wasn't in the original prose; the agent wrote `` `git merge-base HEAD main` `` (or similar) as a code reference, the unquoted heredoc executed it, and the resolved SHA landed in the body. Benign in observed cases (only `git` commands have appeared), but in principle any backticked construct in agent-generated text gets executed — `` `pwd` `` would leak the worktree path, `` `whoami` `` the user. The unquoted heredoc removes the safety net.

Both failure modes are silent: the comment posts successfully (HTTP success, no error path tripped), shell errors disappear into the autonomous session's stderr, and the dedup mechanism still works because `<!-- review-sha: ... -->` contains no backticks.

### Empirical impact

Across ~25 historical handoff comments in the Agent Config project (identified by the `<!-- review-sha:` marker), a sample of six (ENG-204, ENG-217, ENG-220, ENG-228, ENG-230, ENG-232) shows damage in **one** comment — ENG-204, the original reproducer. The other five preserved their backticks intact, despite the buggy heredoc still being in `SKILL.md`. The most likely explanation is that the agent has been deviating from the template literal in some sessions (assembling the body via `printf`, recognizing the heredoc footgun, etc.) rather than copy-pasting verbatim. We cannot rely on that behavior continuing — an agent that follows the template strictly will produce ENG-204-style damage on every run.

The cosmetic damage on ENG-204 is visible in [the comment itself](https://linear.app/yshan/issue/ENG-204/invoke-clean-branch-history-from-prepare-for-review-before-codex#comment-9e169adc).

## Approach

Replace the single unquoted heredoc with three blocks plus the existing `linear` invocation. Split on the variable-vs-literal axis: dynamic prefix (`printf` with `$CURRENT_SHA`), static body (quoted heredoc, backticks land literal), dynamic footer (`printf` heading + `git log` data appended). Then post and clean up.

```bash
COMMENT_FILE=$(mktemp /tmp/ralph-handoff-XXXXXX)

# Dynamic prefix: heading + dedup marker
printf '## Review Summary\n<!-- review-sha: %s -->\n\n' "$CURRENT_SHA" > "$COMMENT_FILE"

# Static body — quoted heredoc keeps backticks (and $) literal
cat >> "$COMMENT_FILE" <<'COMMENT'
**What shipped:** <1-3 sentence summary of the implementation>

**Deviations from the PRD:** <bulleted list of anything that differs from the issue description; "None" if identical>

**Surprises during implementation:** <bulleted list of things the PRD didn't anticipate; "None" if clean>

**Documentation changes:** <bulleted list of decisions captured and docs pruned this session; "None" if nothing>
- Decision: <file:line or path> — <one-sentence summary>
- Pruned: <path> — <one-sentence reason>

## QA Test Plan

**Golden path:** <specific manual steps to verify the core behavior works>

**Edge cases worth checking:** <bulleted list of risky paths — what was tricky to get right, what boundary conditions exist>

**Known gaps / deferred:** <anything intentionally left unfinished; "None" if complete>
COMMENT

# Dynamic footer: commits section header + actual git log output
printf '\n## Commits in this branch\n\n' >> "$COMMENT_FILE"
git log --oneline "$BASE_SHA"..HEAD >> "$COMMENT_FILE"

linear issue comment add "$ISSUE_ID" --body-file "$COMMENT_FILE"
rm -f "$COMMENT_FILE"
```

### Why split rather than escape every backtick

The alternative — escape every backtick in the current heredoc as `` \` `` — was rejected. Escaping is fragile: every future template edit becomes a chance to drop a `\` and silently re-introduce the bug (the comment still posts, just visibly degraded). Quoted heredoc is the standard escape hatch for "treat this as a literal template" and survives template edits without ceremony.

### Why three blocks rather than two

A simpler split (merge the prefix `printf` into the quoted heredoc) doesn't work: the SHA marker contains `$CURRENT_SHA`, which a quoted heredoc would NOT expand. Splitting on the variable-vs-literal axis is the simplest, most readable structure. The footer is a separate block because the commit list is the one section that genuinely needs command output appended to a file (rather than a literal heading + interpolated value).

### What disappears from the template body

The current template's last line — `<output of \`git log --oneline "$BASE_SHA"..HEAD\`>` — was a doubly broken construct: it *looked* like an agent-fill placeholder (the `<output of …>` framing) but the backticks simultaneously triggered command substitution that did inject the git log output. After the split, the entire `## Commits in this branch` section moves into the dynamic footer; the static body simply ends at `**Known gaps / deferred:** …` with no commits section at all.

## Scope

### In scope

- `agent-config/skills/prepare-for-review/SKILL.md` Step 6: the heredoc block at lines 167–197 is replaced by the three-block structure above.
- The `<output of git log ...>` placeholder line is removed from the template body — the footer now produces both the heading and the data.
- Surrounding Step 6 prose: re-read the paragraphs around the heredoc after the swap and edit any language that misdescribes the new structure. Likely no edits needed (current prose is mechanical: "Write the body to a tempfile first, then post"), but flagged so the implementer doesn't gloss.

### Out of scope

- **Other steps in `prepare-for-review/SKILL.md`.** None of them contain heredocs with markdown bodies.
- **Other skills under `agent-config/skills/` or `agent-config/superpowers-overrides/`.** A grep confirmed only one other unquoted heredoc exists in the tree (`agent-config/skills/ralph-start/scripts/test/dag_base.bats:51`); it's a test stub that intentionally interpolates `$blockers_json` and contains no backticks, so it's correct as-is.
- **Retrospective repair of historical damaged handoff comments.** Different unit of work — data restoration across N Linear comments rather than a code edit. Will be filed as a separate ticket blocked-by ENG-216 (no point repairing comments while the bug still produces new damage). Detection heuristics, fidelity bar, and verification model deserve their own spec.
- **Repairing the ENG-204 handoff comment specifically.** Subsumed by the retrospective sweep above; not done piecemeal here.
- **Changing the SHA dedup mechanism, the `mktemp` prefix, the `linear issue comment add --body-file` invocation, or the order of sections in the comment body.** The fix is structural-only — the resulting comment body must be byte-identical to a hypothetical correctly-rendered version of the current template.

## Acceptance criteria

1. `agent-config/skills/prepare-for-review/SKILL.md` Step 6's tempfile assembly uses three blocks: a `printf` for `## Review Summary` + SHA marker, a quoted heredoc (`<<'COMMENT'`) for the static body, then `printf` + `git log >>` for the commits section.
2. The string `<<COMMENT` (unquoted) no longer appears anywhere in the file. The string `<<'COMMENT'` appears exactly once.
3. The static-body heredoc contains all of: `**What shipped:**`, `**Deviations from the PRD:**`, `**Surprises during implementation:**`, `**Documentation changes:**`, `## QA Test Plan`, `**Golden path:**`, `**Edge cases worth checking:**`, `**Known gaps / deferred:**`. It does NOT contain `## Review Summary`, `<!-- review-sha:`, `## Commits in this branch`, or `<output of`.
4. The `<output of \`git log --oneline "$BASE_SHA"..HEAD\`>` placeholder line is gone.
5. The first line of the resulting comment body is `## Review Summary` and the second line starts with `<!-- review-sha:` — preserving the dedup query in Step 6's opening (lines 145–152), which finds the marker via `body.contains`.
6. The `linear issue comment add "$ISSUE_ID" --body-file "$COMMENT_FILE"` invocation and the `rm -f "$COMMENT_FILE"` cleanup are unchanged.
7. No other file in the repo is modified.

## Verification

No automated test target exists for SKILL.md (it's prose the agent reads). Manual verification copies the new Step 6 snippet into a scratch shell and inspects the output file. Both heredoc failure modes must be exercised:

1. Set `CURRENT_SHA=deadbeef`, `BASE_SHA=$(git rev-parse HEAD~1)`, `ISSUE_ID=ENG-216` in a scratch shell.
2. **Stub out** the `linear issue comment add` line — replace it with `cat "$COMMENT_FILE"` so the body prints to stdout instead of posting.
3. Before running, edit the static-body placeholders to include both stress tests:
   - **Content-elision test:** include a line with backticked non-command text — e.g., `**What shipped:** Updated \`clean-branch-history\` and \`/prepare-for-review\`.` Confirm both inline-code spans land literally in the output (no gaps, no `command not found` to stderr).
   - **Stdout-injection test:** include a line with backticked runnable text — e.g., `**Surprises during implementation:** Test injection: \`pwd\` should appear literally.` Confirm the output contains the literal string `` `pwd` `` rather than the working directory path.
4. Confirm the rendered body has:
   - First line: `## Review Summary`
   - Second line: `<!-- review-sha: deadbeef -->`
   - A `## Commits in this branch` heading near the end, followed by real `git log --oneline` output.
5. No `command not found`, `permission denied`, or `no such file or directory` lines appear in stderr during step 2.

The implementer should quote the rendered output (or relevant excerpts) in the handoff comment so the human reviewer can confirm both failure modes are closed.

## Notes

- Prerequisites: none. No `blocked-by` relations.
- Follow-up: a separate ticket will be filed for the retrospective repair of historical damaged handoff comments. That ticket will be blocked-by ENG-216 — the bug must stop producing new damage before sweeping old damage is worthwhile.
- The fix is small and localized — expect one commit on the feature branch. No new files. No behavior change to downstream skills (`linear-workflow` Step 7 still receives the same Linear state transition request).

# Superpowers Plugin Patches

These patches integrate Sean's custom workflow skills into the superpowers plugin's
orchestration flow. They must be re-applied whenever the superpowers plugin updates.

**Current version patched:** 5.0.7
**Plugin location:** `~/.claude/plugins/cache/claude-plugins-official/superpowers/<version>/skills/`

## Setup

Patched files live in `~/.local/share/chezmoi/agent-config/superpowers-overrides/` (git-tracked) and are
symlinked into the plugin cache:

- `superpowers-overrides/brainstorming/SKILL.md`
- `superpowers-overrides/finishing-a-development-branch/SKILL.md`
- `superpowers-overrides/writing-plans/SKILL.md`
- `superpowers-overrides/subagent-driven-development/SKILL.md`

## How to re-apply after a plugin update

When the plugin updates (e.g. 5.0.7 → 5.0.8), the new version directory will have real
files, not symlinks. To re-apply:

1. Diff each new upstream file against its override to see what changed upstream
2. Merge upstream changes into the override files, preserving the patch intents below
3. Re-create the symlinks:
   ```bash
   VERSION=<new-version>
   PLUGIN=~/.claude/plugins/cache/claude-plugins-official/superpowers/$VERSION/skills
   OVERRIDES=~/.local/share/chezmoi/agent-config/superpowers-overrides

   for skill in brainstorming finishing-a-development-branch writing-plans subagent-driven-development; do
     ln -sf "$OVERRIDES/$skill/SKILL.md" "$PLUGIN/$skill/SKILL.md"
   done
   ```
4. Update "Current version patched" above

---

## How to read the patches below

Each override file in `superpowers-overrides/` is a **complete copy** of the upstream
SKILL.md with our changes applied — not a diff or patch fragment. The sections below
describe **what makes each override different from upstream**, so you can identify which
parts to preserve when merging in new upstream changes.

---

## 1. brainstorming/SKILL.md

**Intent:** After the user approves the spec and before invoking writing-plans, invoke
`linear-workflow` to check for or create a tracking issue. This is the "creation" half
of issue lifecycle management.

### Changes

**Checklist:** Add a step between "user reviews spec" and "transition to implementation":
```
N. **File/link Linear issue** — invoke `linear-workflow` to check for or create a tracking issue before implementation begins
```

**Process flow diagram (dot graph):** Insert a node between spec approval and writing-plans:
```dot
"File/link Linear issue\n(invoke linear-workflow)" [shape=box];

"User reviews spec?" -> "File/link Linear issue\n(invoke linear-workflow)" [label="approved"];
"File/link Linear issue\n(invoke linear-workflow)" -> "Invoke writing-plans skill";
```
Remove any direct edge from spec approval to writing-plans.

**"After the Design" prose (Implementation subsection):** Add a bullet before the writing-plans invocation:
```
- Invoke the `linear-workflow` skill to check for or create a Linear tracking issue
```
And adjust the writing-plans bullet to follow it naturally ("Then invoke...").

---

## 2. finishing-a-development-branch/SKILL.md

Three changes to this file, all serving lifecycle management:

### 2a. Documentation sweep (between tests passing and merge options)

**Intent:** After tests pass (Step 1) and before determining the base branch (Step 2),
run a mandatory documentation sweep.

**New Step 1b** after "If tests pass":
```markdown
### Step 1b: Documentation Sweep

**After tests pass, before presenting merge options:**

Invoke `update-stale-docs` to ensure all documentation surfaces reflect the changes, then invoke `prune-completed-docs` to clean up any doc bloat.

Do not proceed to Step 2 until both complete.
```
Update "If tests pass" to say "Continue to Step 1b" instead of "Continue to Step 2".

**Red Flags "Always" list:** Add:
```
- Run documentation sweep before offering options (Step 1b)
```

### 2b. Linear issue completion (after merge or PR)

**Intent:** After executing Option 1 (merge) or Option 2 (PR), invoke `linear-workflow`
to mark the associated Linear issue as Done. This is the "done" half of issue lifecycle
management.

**Option 1 and Option 2 "Then:" lines:** Prepend with Linear completion:
```
Then: Mark Linear issue as Done (invoke `linear-workflow`), then cleanup worktree (Step 5)
```
Options 3 and 4 do not mark issues as Done.

### 2c. Integration section

**Intent:** Document the skills this file invokes. Remove `executing-plans` from "Called by"
if present (we always use subagent-driven-development now).

```markdown
**Invokes:**
- **update-stale-docs** - Documentation sweep before completion (Step 1b)
- **prune-completed-docs** - Doc bloat cleanup (Step 1b)
- **linear-workflow** - Mark Linear issue as Done (after Option 1 or 2)
```

In "Called by," keep only `subagent-driven-development` (remove `executing-plans` if present).

---

## 3. writing-plans/SKILL.md

**Intent:** Always use subagent-driven-development for plan execution (remove any
two-option handoff that offers executing-plans as an alternative), ensure the plan
header and handoff mention codex-review-gate for final cross-model review, and
compact context before starting execution.

**Plan document header template** — the blockquote should read:
```
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task includes cross-model verification via codex-review-gate after code quality review, with a final cross-task codex review before branch completion.
```
(No mention of executing-plans.)

**Execution Handoff section** — replace any two-option prompt with a clear-and-reprompt handoff:
```markdown
## Execution Handoff

After saving the plan, provide a fresh-session handoff:

**"Plan complete and saved to `docs/superpowers/plans/<filename>.md`."**

**"Please run `/clear`, then paste the prompt below to start execution in a fresh session:"**

Then generate a self-contained execution prompt formatted as a fenced code block the user can copy-paste. The prompt must include:
1. The plan file path (exact)
2. The worktree/branch to work in (if applicable)
3. Any context the executor needs that isn't in the plan itself (e.g., environment setup, relevant CLAUDE.md rules, key architectural decisions made during brainstorming)
4. The execution instruction: "Read the plan at `<path>` and execute it using `superpowers:subagent-driven-development`. Use fresh subagents per task with three-stage review (spec, quality, codex). Final review includes cross-task codex verification via `codex-review-gate`."

**Do NOT proceed with execution in the current session.** The whole point is a clean context window.
```
Remove any "If Inline Execution chosen" block or executing-plans reference.

---

## 4. subagent-driven-development/SKILL.md

**Intent:** Run codex-review-gate at two points: (1) after each task's code quality
review passes, before marking the task complete, and (2) after all tasks complete and
the final Claude code reviewer approves, before invoking finishing-a-development-branch.

### Changes

**Description line:** Change "two-stage review" to "three-stage review (spec compliance,
code quality, cross-model codex)".

**Core principle line:** Change "two-stage review (spec then quality)" to "three-stage
review (spec, quality, codex)".

**"vs. Executing Plans" comparison:** Change "Two-stage review" to "Three-stage review
after each task: spec compliance, code quality, then codex cross-model review".

**Process flow diagram — per-task cluster:** Add a "Record task base SHA" node at the
start of each task iteration, and a codex review loop between code quality approval and
mark complete:
```dot
"Record task base SHA (git rev-parse HEAD)" [shape=box];
"Run codex-review-gate for task changes (task base SHA)" [shape=box];
"Codex review approves task?" [shape=diamond];
"Implementer subagent fixes codex issues" [shape=box];

"Record task base SHA (git rev-parse HEAD)" -> "Dispatch implementer subagent ...";
"Code quality reviewer subagent approves?" -> "Run codex-review-gate for task changes (task base SHA)" [label="yes"];
"Run codex-review-gate for task changes (task base SHA)" -> "Codex review approves task?";
"Codex review approves task?" -> "Implementer subagent fixes codex issues" [label="no"];
"Implementer subagent fixes codex issues" -> "Run codex-review-gate for task changes (task base SHA)" [label="re-review"];
"Codex review approves task?" -> "Mark task complete in TodoWrite" [label="yes"];
```
Remove the direct edge from code quality approval to mark complete.

**Process flow diagram — final review:** Keep the existing nodes:
```dot
"Run codex-review-gate for cross-model review" [shape=box];

"Dispatch final code reviewer subagent for entire implementation" -> "Run codex-review-gate for cross-model review";
"Run codex-review-gate for cross-model review" -> "Use superpowers:finishing-a-development-branch";
```

**Example Workflow:** After each task's code quality reviewer approves, add a codex
review step before marking complete. Keep the final codex review after all tasks.

**Quality gates (under Advantages):** Replace the single codex bullet with:
```
- Per-task codex review catches cross-model blind spots early
- Final codex review catches cross-task integration issues
```

**Cost:** Change "implementer + 2 reviewers per task" to "implementer + 2 reviewers +
codex review" per task.

**Red Flags "Never" list:**
- Change "Skip reviews (spec compliance OR code quality)" to include per-task codex
- Add: "Start codex review before code quality review is ✅ (wrong order)"
- Change "Move to next task while either review has open issues" to "any review"
- Keep: "Skip codex-review-gate after final code review"

**Integration section:**
```
**Invokes:**
- **codex-review-gate** - Cross-model code review after each task's code quality review passes, and again after final Claude review before finishing branch
```

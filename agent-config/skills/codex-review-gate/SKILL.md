---
name: codex-review-gate
description: Use when at a workflow checkpoint that requires cross-model code review — finishing a development branch or completing subagent-driven development tasks
model: sonnet
allowed-tools: Bash, Read, Glob, Grep
---

# Codex Review Gate

Cross-model code review using OpenAI Codex at workflow checkpoints.

## When to Use

- **subagent-driven-development (per-task)**: After each task's code quality review passes, before marking the task complete. Reviews the task's commits only.
- **subagent-driven-development (final)**: After all tasks complete and final Claude code review passes, before invoking finishing-a-development-branch. Reviews the full branch diff.

## Step 1: Locate the Companion Script

```bash
find ~/.claude/plugins -name 'codex-companion.mjs' -path '*/openai-codex/*/scripts/*' 2>/dev/null | head -1
```

If not found, tell the user the Codex plugin may need reinstalling and skip the review. Do NOT improvise alternate review flows.

## Step 2: Run Standard Review

**Per-task review** — scope to the task's commits using the base SHA recorded before the task started:

```bash
cd <project-root> && node <script-path> review --json --base <task-base-sha>
```

**Final review** — review the full branch diff (default behavior):

```bash
cd <project-root> && node <script-path> review --json
```

Parse the JSON output and present findings ordered by severity.

## Step 3: Decide Whether to Run Adversarial Review

```dot
digraph adversarial_decision {
    "Standard review complete" [shape=doublecircle];
    "Specific risk you can articulate?" [shape=diamond];
    "Write 1-2 sentence focus text" [shape=box];
    "Run adversarial review" [shape=box];
    "Skip adversarial review" [shape=box];
    "Present all findings" [shape=doublecircle];

    "Standard review complete" -> "Specific risk you can articulate?";
    "Specific risk you can articulate?" -> "Write 1-2 sentence focus text" [label="yes"];
    "Specific risk you can articulate?" -> "Skip adversarial review" [label="no"];
    "Write 1-2 sentence focus text" -> "Run adversarial review";
    "Run adversarial review" -> "Present all findings";
    "Skip adversarial review" -> "Present all findings";
}
```

Run adversarial review **only** when you can articulate a specific concern. Examples:

| Warrants adversarial review | Does NOT warrant it |
|----------------------------|---------------------|
| Concurrent state across workers | Simple component rename |
| Auth/input validation/data access | Adding a new UI view |
| Non-obvious design tradeoffs | Straightforward CRUD |
| Integration boundaries between components | Updating dependencies |
| Error handling paths hard to test | Clean standard review |

```bash
cd <project-root> && node <script-path> adversarial-review --json "<focus text>"
```

### Writing Good Focus Text

The focus text is what makes adversarial review valuable. Be specific.

- Good: "Check whether the cache invalidation logic handles concurrent writes correctly when two workers update the same key"
- Bad: "Look for bugs"
- Bad: "Check for race conditions" (too vague — which race conditions? between what?)

## Step 4: Handle Results

Follow the `codex:codex-result-handling` skill patterns:
- Present standard review findings first, adversarial findings separately
- Preserve severity ordering, file paths, and line numbers exactly as reported
- If no issues found, say so explicitly

**Per-task review:** Findings feed into the implementer fix loop. The implementer subagent fixes the issues, then codex re-reviews. Repeat until codex reports no issues. This matches the spec compliance and code quality review loops.

**Final review:** STOP. Ask the user which issues to fix. Do NOT auto-apply fixes, even if they seem obvious. There is no implementer subagent in scope at this point.

## Red Flags

If you catch yourself thinking any of these, STOP:

- "I'll just apply this fix myself during the final review" — Final review has no implementer. Ask the user. Always.
- "I'll just run a broad adversarial review for everything" — Focus text must name specific mechanisms. Multiple targeted runs are fine; vague ones are not.
- "I'll skip the review since the changes are small" — The workflow requires it. Run it.
- "I'll skip the `--base` flag, the full diff is fine" — Per-task reviews must be scoped to the task's commits only.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Auto-fixing issues during final review | STOP and ask user which to fix |
| Skipping fix loop during per-task review | Per-task findings go through implementer fix → re-review loop |
| Running per-task review without `--base` | Pass the task base SHA to scope the review |
| Vague broad adversarial review | Each run needs specific focus text naming mechanisms and failure modes |
| Vague adversarial focus text | Name the specific mechanism and failure mode |
| Hardcoding the script path | Always use the `find` command in Step 1 |
| Skipping review for "trivial" changes | Workflow requires it — run it |

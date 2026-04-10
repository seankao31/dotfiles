---
name: context-efficient-delegation
description: Use when running commands whose output you won't reference again, when investigating issues, when searching/mining/parsing unfamiliar data, when verifying subagent work, or when at 40%+ context usage. Also use when orchestrating multi-task plans with subagents.
---

# Context-Efficient Delegation

## The problem

Agents treat subagents as a tool for "research" or "parallel independent tasks." This is too narrow. Any work whose output is disposable — tests, builds, linting, investigation trails, verification steps — belongs in a subagent. When done inline, the output lands in the main context, gets used once, and sits there consuming tokens forever.

At 65% context with three tasks remaining, an agent that runs `npm test && npm run build && npm run lint && npx tsc --noEmit` inline is dumping potentially hundreds of lines of output into the main context. It needs one sentence: "all four passed" or "lint failed on line 42 of foo.ts." The rest is waste.

## Announcing decisions

When this skill influences a delegation decision, briefly state the reasoning. For example: "Delegating test run to subagent — output is disposable" or "Running git status inline — trivial output I'll reference next." This makes the decision visible without boilerplate announcements on every invocation.

## The decision heuristic

Before doing work inline, ask TWO questions:

**1. Will I reference this output in a later turn?**

- **Yes** → do it inline (you need the content for ongoing work)
- **No** → delegate to a subagent (you only need the conclusion)

**2. Am I about to do exploratory work where I don't know how many steps it'll take?**

- **Yes** → delegate to a subagent (exploration balloons unpredictably — what looks like one grep becomes five rounds of trial-and-error)
- **No** → the first question is sufficient

Either question alone can trigger delegation.

### Strengthening signals for delegation

- Output will likely be large (>20 lines): tests, builds, linting, type-checking
- You're verifying, not learning — pass/fail is all you need
- You're investigating — the trail is disposable, only the conclusion matters
- Context is above 40%

### Strengthening signals for inline work

- You'll edit the file you're reading repeatedly
- The output is a short answer you'll reference in decisions
- You're coordinating or deciding — that's the main agent's job
- The command is trivial (git status, ls, a 2-line output)

## Rationalizations to reject

These excuses sound reasonable but are wrong:

| Excuse | Reality |
|--------|---------|
| "Subagents are for research, not running commands" | Subagents are for any work whose output is disposable. A test suite's 200-line output is disposable. |
| "Subagent overhead is worse than the inline cost" | The overhead is one dispatch message. The inline cost is every line of output, permanently in context. A test run that produces 50 lines costs 50 lines of context forever. The dispatch costs ~5. |
| "One chained command is efficient" | Chaining commands is efficient *execution*. But the output still lands in your context. Efficient execution in a subagent gives you efficient execution AND context preservation. |
| "I'll just quickly check..." | This is how context bloat starts. If a subagent already verified, don't re-verify. If you need to check something, delegate the check. |
| "I'm only at 30%, I have plenty of room" | Context fills faster than you expect. Every inline command makes the next delegation decision harder because you have less room. Be efficient early, not just when desperate. |

## Common scenarios

### Running verification (tests, build, lint, types)

**Wrong:** Run inline, read output, report to user.

**Right:** Dispatch a subagent: "Run tests, build, lint, and type-check. Report which passed and which failed. For failures, include the specific error messages only."

The subagent returns one paragraph. You would have gotten 50-200 lines inline.

### Investigating a bug or CI failure

**Wrong:** Fetch logs inline. Grep files inline. Read source inline. Run diagnostics inline. Build up a picture in the main context.

**Right:** Dispatch a subagent: "The CI build is failing but passes locally. Here's the logs URL. Investigate: check for version mismatches, case sensitivity issues, missing env vars, dependency problems. Report the root cause and suggested fix."

The investigation trail stays in the subagent. You get the conclusion.

### After a subagent completes a task

**Wrong:** Read the changed files to "understand" what was done. Re-run tests to "confirm." Make the git commit from the main agent.

**Right:** Trust the subagent's report. Update progress. Dispatch next task. Include the commit as part of the subagent's task.

Only intervene when: the subagent explicitly reports failure, asks a question, or a later task fails due to something it should have caught.

### Searching, parsing, or mining unfamiliar data

**Wrong:** Grep a file inline. Output is garbled. Try a different parse approach inline. Repeat. Read partial results, adjust, try again. Five rounds later you have the answer — and 200 lines of failed attempts in your context.

**Right:** Dispatch a subagent: "These JSONL files contain past conversation sessions. Find any discussions about [specific topic]. Report what was said, by whom, and in which session."

The subagent eats the exploration cost. You get the findings. This is especially true when the data format is unfamiliar — the trial-and-error of figuring out the format is pure waste in the main context.

### Orchestrating a multi-task plan

**Wrong:** Re-read the plan file between dispatches. Run verification after each subagent. Read diffs between tasks.

**Right:** Read the plan once. Compress to a one-line-per-task checklist. Work from the checklist. Each subagent dispatch includes verification steps and commit. Dispatch code review in the background between task groupings.

A healthy orchestration turn is short — 3 actions:
1. Read subagent result (a few sentences)
2. Update progress
3. Dispatch next subagent with a self-contained brief

## Red flags — STOP and delegate

If you catch yourself doing any of these, stop and dispatch a subagent instead:

- Running a test suite, build, or lint inline
- Reading files to "double-check" a subagent's work
- Investigating by reading multiple files and running commands inline (bugs, research, data mining — not just bugs)
- Re-reading a plan file you already internalized
- Making a git commit that could have been part of the subagent's task
- Fetching logs or external content that you'll scan once and never reference

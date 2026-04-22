# Codex Review Gate as Caller-Agnostic Primitive

## Context

`codex-review-gate` was originally written to serve `subagent-driven-development`, which has two invocation points: per-task (scoped via `--base <sha>`) and final (full branch diff). The skill encoded both modes explicitly and prescribed what callers should do with findings — fix-loop for per-task, ask the user for final.

When ralph-implement adopted `prepare-for-review` as its handoff terminal step, it triggered a review of codex-review-gate's framing. Ralph runs `prepare-for-review` autonomously — no human is present when `/prepare-for-review` runs, so "STOP and ask the user" in a codex finding is a session-killer. The per-task/final distinction also has no meaning in the ralph path: there is one review pass per branch, run at handoff.

## Decision

`codex-review-gate` is a caller-agnostic primitive. It:
- Locates the companion script
- Runs the review (optionally scoped via `--base <sha>`)
- Decides whether adversarial review is warranted, runs it if so
- Presents findings ordered by severity

It does not prescribe what callers do with findings. Fix-loop, ask-user, surface-in-review-summary — those are caller policy, not primitive policy.

The per-task/final distinction and any associated fix-loop or escalation guidance belongs entirely in the calling skill.

## Reasoning

The "ask user during final review" instruction was wrong for autonomous callers. Rather than add caller detection logic, the cleaner cut is: primitives surface findings; callers decide. This matches how other primitives in this repo work (e.g., `linear-workflow` handles idempotency, but callers decide *which* transition to request).

`subagent-driven-development` retains its own per-task + final framing in its override SKILL.md — it calls codex-review-gate at the right moments with the right flags. The primitive doesn't need to know about those moments.

## Consequences

- New callers of `codex-review-gate` should not expect the skill to tell them what to do with findings. The caller must specify the policy (auto-fix, fix-loop, escalate, defer) in its own SKILL.md.
- `prepare-for-review` Step 5 is the locus of ralph's codex policy: fix actionable findings automatically; surface ambiguous ones in the Step 6 Review Summary for the human reviewer.
- When writing future review-gate-style primitive skills, follow this pattern: the primitive surfaces findings, the caller owns the response.

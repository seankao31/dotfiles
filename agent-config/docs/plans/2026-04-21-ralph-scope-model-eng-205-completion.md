# ENG-205 Ralph Scope Model Design — Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task includes cross-model verification via codex-review-gate after code quality review, with a final cross-task codex review before branch completion.

**Goal:** Land the remaining non-design work on ENG-205's branch — a stale forward-reference in the v2 design spec — then pass codex review and ready the branch for close.

**Architecture:** The design doc itself is complete and committed. What remains is one stale cross-reference fix in `2026-04-17-ralph-loop-v2-design.md` (line 469 still points to ENG-203 as the multi-project follow-up, but ENG-203 was canceled when subsumed into ENG-205, which now covers both the design and the implementation). The fix is a single paragraph rewrite. After that, codex review of the full branch diff, then hand off for `/close-feature-branch ENG-205`.

**Tech Stack:** Markdown. No code changes, no tests.

---

## Scope Check

Single-file doc update plus a review gate. Not a multi-subsystem project; one plan is correct.

## File Structure

- Modify: `agent-config/docs/specs/2026-04-17-ralph-loop-v2-design.md` — line 469 forward-reference update.

The new design doc (`agent-config/docs/specs/2026-04-21-ralph-scope-model-design.md`, committed as `aad03e0`) is not modified by this plan beyond what codex review requires. It refers to "the implementation" in the abstract because ENG-205 itself now covers both design and implementation — there is no separate implementation ticket.

**Out of scope for this plan (intentional):**
- `agent-config/docs/playbooks/ralph-v2-usage.md` — its single-project language describes *current* behavior, which doesn't change until the implementation phase of ENG-205 ships. The playbook update belongs to that implementation work, not this design branch.
- `agent-config/docs/progress/2026-04-18-ralph-v2-progress.md` — historical session log. The 2026-04-20 entry's "filed ENG-203" and "Handoff: ENG-203 (multi-project)" lines accurately record what happened in that session; retroactively rewriting them would falsify the log.
- `agent-config/skills/linear-visualize/SKILL.md` line 52 — generic `--initiative` vs `--project` docs, unrelated to ENG-203.

---

## Task 1: Update v2 spec forward-reference (ENG-203 → ENG-205)

**Files:**
- Modify: `agent-config/docs/specs/2026-04-17-ralph-loop-v2-design.md:469`

Context: The v2 spec's Contract Summary section item 3 notes the v2 single-project scope limit and points at ENG-203 as the future fix. With ENG-205 subsuming ENG-203 (now canceled) and ENG-205 covering both design and implementation, that pointer is stale.

- [ ] **Step 1: Read the current line**

```bash
sed -n '467,470p' agent-config/docs/specs/2026-04-17-ralph-loop-v2-design.md
```

Expected current text (line 469, single paragraph):
```
3. **Explicit `blocked-by` relations** for any prerequisite issues. The orchestrator uses these for DAG ordering and base-branch selection. **v2 scope limit:** blocker relations are resolved only within the configured project. Cross-project `blocked-by` edges are returned by Linear but fail the "Approved blocker must be in this run's queue" membership check, so cross-project parents appear stuck in preflight. Multi-project initiatives are a common case we'll need to handle — tracked as ENG-203 for a v2.1 extension.
```

- [ ] **Step 2: Apply the edit via the Edit tool**

Replace the trailing sentence of the paragraph. Old string to match (exact, enough surrounding context to be unique):

```
cross-project parents appear stuck in preflight. Multi-project initiatives are a common case we'll need to handle — tracked as ENG-203 for a v2.1 extension.
```

New string:

```
cross-project parents appear stuck in preflight. Multi-project dispatch is designed and implemented under ENG-205 (see `2026-04-21-ralph-scope-model-design.md`); once that work lands, the scope is a project list (or initiative shorthand) declared in per-repo `.ralph.json`, and blockers within any in-scope project resolve automatically. ENG-203 was canceled as subsumed.
```

- [ ] **Step 3: Verify the edit**

```bash
sed -n '469p' agent-config/docs/specs/2026-04-17-ralph-loop-v2-design.md
```

Expected: the updated paragraph contains `ENG-205`, `2026-04-21-ralph-scope-model-design.md`, `.ralph.json`, and does NOT contain `v2.1 extension`, `ENG-215`, or the stale `tracked as ENG-203` phrase.

```bash
grep -n "tracked as ENG-203" agent-config/docs/specs/2026-04-17-ralph-loop-v2-design.md
```

Expected: no matches (the stale "tracked as ENG-203 for a v2.1 extension" phrase has been removed; "ENG-203 was canceled as subsumed" is the intentional retained mention).

- [ ] **Step 4: Commit**

```bash
git add agent-config/docs/specs/2026-04-17-ralph-loop-v2-design.md
git commit -m "ralph-v2 spec: update multi-project forward-reference to ENG-205 (ENG-205)"
```

Expected: clean commit, no pre-commit hook failures.

---

## Task 2: Codex review gate

**Files:** None modified directly; any codex findings produce further commits in subsequent ad-hoc tasks.

Context: This is the cross-model review checkpoint before the branch is closed. Codex reviews the full branch diff (base SHA is `96c6f50` — the tip of main before this branch was created).

- [ ] **Step 1: Invoke codex-review-gate**

Invoke the `codex-review-gate` skill with the base SHA `96c6f50`. The skill prompt should ask codex to review the full branch diff for:
- Internal consistency of the design doc
- Contradictions or ambiguities in Decisions 1–5
- Accuracy of the v2 spec forward-reference update from Task 1
- Anything that would bias the implementation phase (carried by ENG-205 itself) in a wrong direction

Any P1 or P2 findings warrant follow-up commits on this branch. Consider adversarial review if the standard review surfaces structural rather than nitpick issues (per global CLAUDE.md's `Always assess whether adversarial review is warranted`).

- [ ] **Step 2: Address blocking findings**

If codex flags P1 or P2 issues, resolve each via the smallest reasonable edit in the design doc or v2 spec. Commit each fix with a descriptive message referencing the finding. Re-run codex-review-gate only if the changes are substantive (structural rewrites, added sections).

P3 and below: operator judgment — fix or defer with a comment explaining why.

- [ ] **Step 3: Verify no open P1/P2 findings remain**

Expected: codex-review-gate returns clean, or all P1/P2 findings have matching fix commits on the branch.

---

## Task 3: Final branch preparation

**Files:** No changes; this task is verification.

- [ ] **Step 1: Verify branch state**

```bash
git log --oneline main..HEAD
git status
```

Expected:
- At minimum: `aad03e0` (design doc commit) plus the v2-spec-update commit from Task 1. Any codex-review commits from Task 2.
- Working tree clean (`nothing to commit, working tree clean`).

- [ ] **Step 2: Verify the design doc is unchanged by the review pass**

```bash
git diff aad03e0..HEAD -- agent-config/docs/specs/2026-04-21-ralph-scope-model-design.md
```

Expected: either empty (no changes since aad03e0) or only the follow-up changes codex review required. If empty, the design doc was accepted as-written by codex.

- [ ] **Step 3: Handoff note for branch close**

Do NOT invoke `/close-feature-branch ENG-205` from this plan's execution. The branch-close ritual runs from the main-checkout CWD with `/close-feature-branch ENG-205` invoked by the user in a separate session. The plan's final state is: all commits in place, codex review passed, branch ready for rebase + ff-merge to main.

---

## Self-Review Checklist

**Spec coverage:**
- Design doc (committed as `aad03e0`) — out of scope for this plan; already landed.
- v2 spec forward-reference update — Task 1.
- Codex review gate — Task 2.
- Branch ready for close — Task 3.
- Linear bookkeeping (ENG-205 blocked-by ENG-206; ENG-203 canceled as subsumed; ENG-215 canceled after scope-merge decision) — handled alongside this plan, not part of its file-level tasks.

No spec requirements uncovered by tasks.

**Placeholders:** None — each task has exact file paths, expected commands, and either concrete diffs or concrete verifications.

**Type consistency:** No types involved; this is a doc-edit plan.

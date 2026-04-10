---
name: mutation-testing
description: >
  Systematic mutation testing to verify test suite quality. Use this skill when
  the user wants to check if their tests actually catch bugs, find test gaps,
  verify test coverage quality, or do mutation testing/analysis. Also use when
  the user says things like "are my tests good enough", "would tests catch this
  bug", "test gap analysis", "test quality audit", or "mutation analysis".
  Trigger even for vague requests about test robustness — mutation testing is
  the right tool whenever someone questions whether their test suite would
  catch real regressions.
---

> **If not already announced, announce: "Using mutation-testing to [purpose]" before proceeding.**

# Mutation Testing

Mutation testing answers: "If I introduced a bug, would my tests catch it?"
For each code location, introduce a deliberate minimal bug (a "mutation"),
run tests, and check whether any test fails. A mutation that survives (tests
still pass) reveals a real test gap.

This skill has two phases: **planning** (identify what to mutate) and
**execution** (run each mutation and fix gaps). Both follow a systematic
protocol that avoids shortcuts.

---

## Phase 1: Planning

### Step 1: Select target files

Choose source files (not test files) that contain important logic worth
verifying. Good candidates:
- Core business/game logic
- Data transformation functions
- State management code
- Validation and boundary checks
- Anything where a subtle bug would cause real damage

Skip: configuration, type definitions with no logic, pure re-exports.

### Step 2: Read and analyze each target file

For each file, read it carefully and identify **mutation sites** — places
where a single small change would introduce a realistic bug. The goal is
mutations that a developer could plausibly introduce by accident.

#### Mutation categories

| Category | Example | What it tests |
|----------|---------|---------------|
| **Operator change** | `>` → `>=`, `+` → `-`, `&&` → `\|\|` | Boundary conditions, logic correctness |
| **Constant change** | `10` → `9`, `1` → `0`, `2` → `3` | Magic number sensitivity, caps/floors |
| **Guard removal** | Delete an `if` check or early return | Defensive code coverage |
| **Logic inversion** | `!==` → `===`, negate a condition | Polarity of boolean logic |
| **Off-by-one** | `i + 1` → `i + 2`, `< n` → `<= n` | Index and slice boundaries |
| **Statement removal** | Comment out a function call or assignment | Side effect coverage |
| **Reorder** | Move a statement before/after another | Order-dependent logic |

Each mutation must be a **single, minimal change**. Never combine two
mutations — that makes it impossible to attribute test results.

### Step 3: Predict outcomes

For each mutation, analyze the existing tests and predict:
- **KILLED** — which specific test would catch it and why
- **SURVIVED** — why no existing test covers this case
- **EQUIVALENT** — the mutation doesn't change observable behavior
  (e.g., removing a redundant guard, changing `=== 5` to `>= 5` when
  no value above 5 exists in the domain)

This prediction step is critical. It focuses effort on the mutations most
likely to reveal real gaps and helps verify your understanding of the test
suite.

### Step 4: Write the plan

Organize mutations into groups by source file. For each mutation, document:
- **ID** (e.g., M1, M2, ...)
- **File and line** (approximate — will verify during execution)
- **The change** (exact old → new text)
- **Predicted result** (KILLED / SURVIVED / EQUIVALENT)
- **Rationale** (which test catches it, or why it survives)
- **Fix sketch** (for predicted survivors: what test to add)

Include a summary table of predicted findings at the end:
- How many predicted survivors (real test gaps to fix)
- How many equivalent mutations (no fix needed)
- How many imprecise assertions to tighten

Save the plan as a markdown file accessible to the user.

### Planning pitfalls to watch for

**Symmetric test blindness.** When a mutation affects both sides of a
comparison equally, tests that compare those sides won't detect the change.
Example: changing a cap from 10 to 9 when both attacker and defender hit
the cap — 9>9 gives the same result as 10>10. Flag mutations where this
could happen and design asymmetric test fixes.

**Guard masking.** When multiple guards exist in sequence (e.g., check A
then check B), a test that triggers guard B will still pass if guard A is
removed. Tests for early guards need inputs that would pass through them
but fail at a later point without the guard.

**Statistical equivalence.** Mutations in non-deterministic code (weighted
sampling, random selection) may require statistical tests with enough trials
to distinguish correct behavior from mutated behavior. Uniform-input tests
(all-identical values) can make index-swap mutations equivalent.

---

## Phase 2: Execution

### Protocol for each mutation

This protocol is strict. Do not skip steps or batch mutations.

```
For each mutation M:
  1. READ the source file to find the exact code to change
  2. APPLY the single mutation using the Edit tool
  3. RUN the relevant test suite
  4. RECORD the result:
     - KILLED: note which test(s) caught it
     - SURVIVED: proceed to the fix protocol below
  5. REVERT the production code: git checkout -- <file>
  6. VERIFY tests pass after revert (catch botched reverts early)
```

### Fix protocol for survivors

When a mutation survives, the goal is to add or improve a test that catches
it, then verify the mutation is now killed. Follow TDD:

```
  1. The mutation is still active in production code
  2. WRITE a test that should fail with the mutation active
  3. RUN tests — confirm the new test FAILS (mutation killed)
  4. REVERT the production code mutation (keep the new test)
  5. RUN tests — confirm everything PASSES (test is valid)
  6. COMMIT the test improvement
```

If the new test passes even with the mutation active, your test doesn't
actually detect the mutation. Rethink the test — usually the issue is
symmetric inputs, guard masking, or equivalent mutation (see pitfalls above).

### Execution order

1. **Predicted survivors first.** These are the ones most likely to need
   test fixes, and fixing them early means they're already committed before
   the confirmation sweep.
2. **Confirmation sweep.** Run remaining mutations to verify they're killed.
   Any surprise survivor gets the same fix protocol.
3. **Imprecise assertions.** Tighten any tests that catch mutations for
   the wrong reason (e.g., `.toThrow()` without message validation catches
   a boundary mutation via a downstream TypeError, not the intended error).

### Tracking results

Maintain a results table as you go:

```markdown
| ID | File | Mutation | Predicted | Actual | Killing Test / Fix |
|----|------|----------|-----------|--------|-------------------|
| M1 | board.ts | `>` → `>=` | KILLED | KILLED | "does not capture when equal" |
| M6 | board.ts | cap 10→9 | SURVIVED | SURVIVED | Fixed: asymmetric cap test |
```

Flag any discrepancies between predicted and actual results — these reveal
misunderstandings about the code or test suite.

### Parallelization

When many mutations target the same file, they can't run in parallel (each
modifies the file). Mutations across different files CAN run in parallel
using worktree subagents:
- Each subagent gets a worktree with an isolated copy of the repo
- Subagents for predicted survivors should be allowed to commit test fixes
- Subagents for confirmation sweeps should NOT commit (read-only verification)
- Merge test improvements from survivor-fixing subagents afterward

---

## Phase 3: Analysis

### Coverage measurement

If coverage tooling is available:
1. Run coverage before any test changes (baseline)
2. Run coverage after all test improvements
3. Report the delta

Coverage numbers are useful context but not the primary output — the
mutation kill rate is more meaningful than line coverage percentage.

### Write-up

Produce a findings document covering:

1. **Results summary** — total mutations, kill rate, gaps found
2. **Each test gap** with:
   - What the mutation was
   - Why it survived (root cause)
   - How it was fixed
   - Why the fix works
3. **Equivalent mutations** — list with justification for why no fix is needed
4. **Surprise findings** — mutations that behaved differently than predicted
5. **Coverage before/after** (if measured)
6. **Lessons learned** — general testing principles discovered

The root cause analysis ("why it survived") is the most valuable part of the
write-up. It transforms a mechanical exercise into actionable insight about
test design. Common root causes:
- Symmetric test inputs
- Guard masking by downstream checks
- Tests checking behavior (pass/fail) but not values
- Assertions too loose (`.toThrow()` without message)
- No test for the negative case (only testing that X works, not that !X fails)
- Non-deterministic code tested with deterministic assertions

### Commit the findings

Save the write-up alongside other project documentation. Commit all test
improvements and the findings document.

---

## Checklist

Use this to track progress:

- [ ] Select target files
- [ ] Read and identify mutation sites
- [ ] Predict outcomes for each mutation
- [ ] Write and save the mutation plan
- [ ] Execute predicted survivors (fix test gaps)
- [ ] Run confirmation sweep on remaining mutations
- [ ] Fix any surprise survivors
- [ ] Tighten imprecise assertions
- [ ] Measure coverage (if tooling available)
- [ ] Write findings document
- [ ] Commit everything

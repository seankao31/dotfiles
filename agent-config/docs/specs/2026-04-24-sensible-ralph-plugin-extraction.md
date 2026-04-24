# sensible-ralph plugin extraction

## Context

The ralph workflow (ralph-start, ralph-spec, ralph-implement skills +
supporting scripts, docs, and rule overrides) currently lives in the
chezmoi repo at `agent-config/skills/ralph-*` and `agent-config/docs/`.
It's self-contained logically but only installable in chezmoi's working
tree because its skills are project-local.

Extracting it into a standalone Claude Code plugin named **sensible-ralph**
lets it be installed in any repo via marketplace, enables independent
versioning/releases, and reduces chezmoi's agent-config bloat (the
ralph-start skill alone carries a large scripts+tests surface).

The name is ironic contrast with the Ralph Wiggum character — signals the
five properties below (which Wiggum famously lacks).

## Goal

Carve ralph out of chezmoi into a new repo at
`git@github.com:seankao31/sensible-ralph.git`, installable via a
self-marketplace, with git history preserved for moved files via
`git filter-repo`. Remove the extracted artifacts from chezmoi in a single
cutover commit that lands after the plugin is live and verified.

## The five pillars (README lead)

These five properties are what sensible-ralph adds to vanilla
[Huntley ralph](https://ghuntley.com/ralph/), and lead the README:

1. **Safety** — review gate before commit, worktree isolation, DAG prevents
   parallel conflicts on shared ancestors. Vanilla ralph ships to main.
2. **Structure** — three phases (spec/plan/impl), DAG scope model instead
   of a flat checklist, Linear state machine instead of a markdown blob.
3. **Traceability** — every iteration ties to a ticket, with decisions,
   progress, and specs as durable artifacts. Vanilla ralph remembers via
   `progress.txt` only.
4. **Composability** — skills are swappable; the orchestrator dispatches
   whichever implementation skill you point it at. Vanilla ralph is a fixed
   bash script.
5. **Deliberation** — idea → PRD → plan → code separation forces thinking
   before the loop starts. Vanilla ralph hands the LLM a blob and lets it
   figure things out.

Competitor context (also in README): `snarktank/ralph` is PRD-file-centric
(`prd.json` + `passes: true/false`); `frankbria/ralph-claude-code` is
ops-heavy (rate limits, circuit breakers, tmux monitoring) but still
flat-task-file. Neither has DAG, Linear integration, or
review-as-terminal-state.

## Scope

**In scope:**

- Create a new git repo at `git@github.com:seankao31/sensible-ralph.git`
  seeded via `git filter-repo` from chezmoi, preserving history for the
  moved files.
- Add `.claude-plugin/plugin.json` with a `userConfig` schema that
  supersedes the current `config.json` / `config.example.json` pair.
- Add `.claude-plugin/marketplace.json` as a self-marketplace
  (`source: "./"`).
- Add `README.md` leading with the five pillars.
- Add `LICENSE` (MIT).
- Move the autonomous-mode override rules from `agent-config/CLAUDE.md`
  into a plugin-owned preamble injected at autonomous-session start by
  `orchestrator.sh`.
- Rename `skills/ralph-start/scripts/lib/config.sh` → `scope.sh` and shrink
  it to only handle `.ralph.json` scope loading; downstream scripts consume
  `$CLAUDE_PLUGIN_OPTION_*` env vars directly.
- Rename `docs/playbooks/ralph-v2-usage.md` → `docs/usage.md` (within the
  plugin).
- Scope every prose file in the plugin to be workspace-neutral: no
  references to the operator by name, no chezmoi-specific paths, no
  chezmoi-specific Linear project names, no references to non-plugin
  skills.
- Remove the extracted skill dirs and triaged docs from chezmoi in a
  cutover commit, along with CLAUDE.md surgery.
- Add a short migration note in chezmoi pointing at the new repo.

**Not in scope:**

- Skills the plugin uses but doesn't own: `linear-workflow`,
  `codex-review-gate`, `prepare-for-review`, `clean-branch-history`,
  `using-git-worktrees`, `close-issue`, `close-branch`, or any other
  general-purpose skill.
- Any functional change to ralph behavior. Pure move + rename.
- CI setup for the new repo. Follow-up.
- Public plugin indexing. Follow-up.
- Shipping a `1.0.0` version. `0.1.0` signals evolving.

**Non-goals:**

- Not expanding the plugin's feature footprint. Everything the chezmoi
  version did, the plugin does. Nothing more.
- Not reorganizing skill structure beyond the path moves required for
  plugin layout.

## Design

### Target repo layout

```
sensible-ralph/
├── .claude-plugin/
│   ├── plugin.json            # userConfig + metadata
│   └── marketplace.json       # self-marketplace
├── skills/
│   ├── ralph-start/
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       ├── orchestrator.sh
│   │       ├── build_queue.sh
│   │       ├── dag_base.sh
│   │       ├── toposort.sh
│   │       ├── preflight_scan.sh
│   │       ├── autonomous-preamble.md   # injected into claude -p sessions
│   │       ├── lib/
│   │       │   ├── scope.sh             # renamed from config.sh, shrunk
│   │       │   ├── linear.sh
│   │       │   ├── worktree.sh
│   │       │   ├── branch_ancestry.sh
│   │       │   └── preflight_labels.sh
│   │       └── test/                    # bats
│   ├── ralph-spec/SKILL.md
│   └── ralph-implement/SKILL.md
├── docs/
│   ├── usage.md                         # end-user ops (was ralph-v2-usage.md)
│   ├── specs/                           # curated architectural history
│   └── decisions/                       # curated ADRs
├── README.md
├── LICENSE
└── .gitignore
```

Notes:

- No `config.json` or `config.example.json`. Superseded by `userConfig` in
  `plugin.json`.
- No `docs/progress/` in the plugin. Progress logs are chezmoi dev history
  and stay in chezmoi.
- `.ralph.json` (per-repo scope) stays in consumer repos; the plugin reads
  it via `git rev-parse --show-toplevel` at runtime.

### plugin.json userConfig schema

```json
{
  "name": "sensible-ralph",
  "version": "0.1.0",
  "description": "Autonomous overnight execution of Approved Linear issues, with safety, structure, traceability, composability, and deliberation.",
  "author": { "name": "Yi-Hsiang (Sean) Kao" },
  "license": "MIT",
  "homepage": "https://github.com/seankao31/sensible-ralph",
  "userConfig": {
    "approved_state":      { "type": "string", "title": "Approved state name",         "description": "Linear workflow state for issues ready to dispatch",        "default": "Approved",        "required": true },
    "in_progress_state":   { "type": "string", "title": "In-Progress state name",      "description": "Linear workflow state while a session is running",         "default": "In Progress",     "required": true },
    "review_state":        { "type": "string", "title": "In-Review state name",        "description": "Linear workflow state after /prepare-for-review",          "default": "In Review",       "required": true },
    "done_state":          { "type": "string", "title": "Done state name",             "description": "Linear workflow state after merge",                         "default": "Done",            "required": true },
    "failed_label":        { "type": "string", "title": "Failed label",                "description": "Label applied when a session fails or exits clean",         "default": "ralph-failed",    "required": true },
    "stale_parent_label":  { "type": "string", "title": "Stale-parent label",          "description": "Label applied to In-Review children whose parent was amended", "default": "stale-parent",  "required": true },
    "worktree_base":       { "type": "string", "title": "Worktree base directory",     "description": "Directory under repo root for session worktrees",          "default": ".worktrees",      "required": true },
    "model":               { "type": "string", "title": "Claude model",                "description": "Model to use for dispatched sessions",                      "default": "opus",            "required": true },
    "stdout_log_filename": { "type": "string", "title": "Session log filename",        "description": "Per-session stdout log file (inside the worktree)",         "default": "ralph-output.log", "required": true }
  }
}
```

All defaults are the current chezmoi values. A user accepting defaults
gets no prompts at enable time. Overrides happen via the `/config` UI or
direct edits to `settings.json`.

### Autonomous-mode preamble

Content of `skills/ralph-start/scripts/autonomous-preamble.md` (verbatim;
near-identical to the post-ENG-251 `## Autonomous mode` section in
`agent-config/CLAUDE.md`, retitled and generalized from Sean-specific to
workspace-neutral):

```markdown
# Autonomous mode (sensible-ralph)

You are running in an autonomous `claude -p` session dispatched by
`/ralph-start`. No human is at the keyboard. The following rules override
your usual CLAUDE.md behavior for the duration of this session.

## Overrides

Every rule in your CLAUDE.md that requires input from a human — whether
phrased as an escalation ("STOP and ask", "speak up", "call out", "push
back", "raise the issue") or a gating requirement (confirmation, approval,
permission, discussion) — instead becomes: **post a Linear comment on the
issue you're implementing describing what's blocking, then exit clean (no
PR, no In Review transition).** The orchestrator records this as
`exit_clean_no_review` in `progress.json`; the operator triages on the next
pass.

Default to that behavior when you're uncertain whether a decision falls
under the umbrella above — not on routine fixes and clear implementations,
which never require discussion. The following are never routine:
architectural choices (framework swaps, major refactoring, system design),
backward-compatibility additions, rewrites, significant restructures of
existing code, and scope changes beyond the spec.

Linear authorization (edit descriptions, comment, change state, manage
labels, file new issues, set relations on the dispatched issue and
judged-relevant issues) applies fully — the escape hatch leans on this.
Codex usage (codex-rescue, codex-review-gate) applies fully —
`/prepare-for-review`'s codex gate runs from this session. Deleting issues
or comments is not permitted in autonomous mode.

## Operational rules (no interactive counterpart)

- **Spec contradicts the code.** If the spec describes a state of the world
  that doesn't match the codebase in a way you can't reconcile — a file the
  spec says to edit doesn't exist, a function it references has a different
  signature, a prerequisite it assumes is missing — treat that as a spec
  bug, not an implementation puzzle. Post a comment and exit clean.
- **Stuck.** If the same operation has been tried 3 times without progress,
  or ≥30 minutes of compute has been spent on the same subgoal without
  convergence, post a comment and exit clean. Fresh context is cheaper than
  compounding a confused approach.
```

Orchestrator injection — the change in `orchestrator.sh`:

```bash
PREAMBLE="$(cat "$SKILL_DIR/scripts/autonomous-preamble.md")"
PROMPT="${PREAMBLE}"$'\n\n'"/ralph-implement ${ISSUE_ID}"
claude -p "$PROMPT" ...
```

The dispatched session's first user message is the preamble followed by
the `/ralph-implement` invocation. Claude reads the preamble first and
internalizes it as override instructions, then invokes the skill. The
preamble is in context from token zero, which prevents any decision in the
gap between session start and `/ralph-implement` skill load from escaping
autonomous-mode rules.

Location rationale: putting the preamble in `SKILL.md` (for
ralph-implement) would load it only when the skill is invoked, leaving the
pre-invocation gap. Putting it in the orchestrator's prompt string
guarantees it's there first.

### Config-loader shrink (lib/config.sh → lib/scope.sh)

Current `config.sh` has 7 responsibilities. Post-extraction:

1. ~~Find `config.json` (RALPH_CONFIG override or default)~~ — done by
   Claude Code harness.
2. ~~Validate required JSON keys~~ — enforced by `userConfig` schema +
   `required: true`.
3. ~~Export `RALPH_*`~~ — harness auto-exports `CLAUDE_PLUGIN_OPTION_*`.
4. **Find `.ralph.json`** via `git rev-parse --show-toplevel` — stays.
5. **Validate `.ralph.json` shape** (exactly one of `projects` or
   `initiative`, non-empty, well-formed) — stays.
6. **If `initiative` shape, expand to project list** via
   `linear initiative view` — stays.
7. **Export the resolved project list** as `RALPH_PROJECTS` — stays.

The file is renamed `scope.sh` because its single responsibility is
loading and validating per-repo scope. Callers (orchestrator, ralph-spec,
etc.) switch from
`source "$HOME/.claude/skills/ralph-start/scripts/lib/config.sh" "$CONFIG"`
to
`source "$CLAUDE_PLUGIN_ROOT/skills/ralph-start/scripts/lib/scope.sh"`
(no config-path arg).

Downstream variable renames:

- `$RALPH_APPROVED_STATE` → `$CLAUDE_PLUGIN_OPTION_APPROVED_STATE`
- `$RALPH_IN_PROGRESS_STATE` → `$CLAUDE_PLUGIN_OPTION_IN_PROGRESS_STATE`
- `$RALPH_REVIEW_STATE` → `$CLAUDE_PLUGIN_OPTION_REVIEW_STATE`
- `$RALPH_DONE_STATE` → `$CLAUDE_PLUGIN_OPTION_DONE_STATE`
- `$RALPH_FAILED_LABEL` → `$CLAUDE_PLUGIN_OPTION_FAILED_LABEL`
- `$RALPH_STALE_PARENT_LABEL` → `$CLAUDE_PLUGIN_OPTION_STALE_PARENT_LABEL`
- `$RALPH_WORKTREE_BASE` → `$CLAUDE_PLUGIN_OPTION_WORKTREE_BASE`
- `$RALPH_MODEL` → `$CLAUDE_PLUGIN_OPTION_MODEL`
- `$RALPH_STDOUT_LOG` → `$CLAUDE_PLUGIN_OPTION_STDOUT_LOG_FILENAME`
- `$RALPH_PROJECTS` — unchanged (comes from `scope.sh`, not userConfig).

### Extraction mechanics

Scratch location outside chezmoi (e.g., `$HOME/tmp/sensible-ralph-extraction-<timestamp>/`).

```bash
SCRATCH="$HOME/tmp/sensible-ralph-extraction-$(date -u +%Y%m%dT%H%M%SZ)"
git clone --no-local "$CHEZMOI_ROOT" "$SCRATCH"
cd "$SCRATCH"
git filter-repo \
  --path agent-config/skills/ralph-start \
  --path agent-config/skills/ralph-spec \
  --path agent-config/skills/ralph-implement \
  --path agent-config/docs/playbooks/ralph-v2-usage.md \
  --path agent-config/docs/specs/2026-04-17-ralph-loop-v2-design.md \
  --path agent-config/docs/specs/2026-04-21-ralph-scope-model-design.md \
  --path agent-config/docs/specs/2026-04-21-ralph-implement-skill-design.md \
  --path agent-config/docs/decisions/2026-04-20-ralph-v2-ambiguous-outcome-handling.md \
  --path agent-config/docs/decisions/2026-04-20-ralph-v2-multi-parent-integration-abort.md \
  --path agent-config/docs/decisions/2026-04-22-ralph-scope-discovery-show-toplevel.md \
  --path agent-config/docs/decisions/2026-04-22-ralph-spec-sources-ralph-start-libs.md \
  --path agent-config/docs/decisions/2026-04-22-ralph-spec-finalization-invariants.md \
  --path-rename agent-config/skills/:skills/ \
  --path-rename agent-config/docs/:docs/ \
  --path-rename docs/playbooks/ralph-v2-usage.md:docs/usage.md
```

After filter-repo, the session applies these commits in order (each a
separate commit for review readability):

1. `feat: add .claude-plugin manifest and marketplace`
2. `feat: add README with five pillars`
3. `feat: add LICENSE (MIT)`
4. `feat: add autonomous-mode preamble (ralph-start)`
5. `refactor: rename lib/config.sh to lib/scope.sh and shrink for plugin`
6. `refactor: consume CLAUDE_PLUGIN_OPTION_* env vars in all scripts`
7. `docs: scope ralph-loop-v2-design for plugin audience`
8. `docs: scope ralph-scope-model-design for plugin audience`
9. (one commit per remaining moved doc)
10. `docs: rewrite SKILL.md prose for plugin audience (ralph-start)`
11. (one commit per SKILL.md)
12. `docs: rewrite usage.md prose for plugin audience`

Then:

```bash
git remote add origin git@github.com:seankao31/sensible-ralph.git
git push -u origin main
```

### Plugin prose scoping rules

Every prose file in the plugin passes through this filter:

1. **Names:** no references to any specific operator by name. Use "the
   operator", "the user", or "whoever dispatched this session" as role
   fits.
2. **Paths:** no chezmoi-specific paths (`agent-config/`,
   `.local/share/chezmoi/`, `dot_claude/`). Replace with
   `$CLAUDE_PLUGIN_ROOT/...` for plugin-internal paths, or leave
   consumer-repo paths abstract (e.g., "the repo root", "your `.ralph.json`").
3. **Linear projects:** no chezmoi-specific project names ("Agent Config",
   "Machine Config") or initiative names. Generic phrasing only.
4. **Skills:** no references to skills outside the plugin *unless* they're
   general-purpose (linear-workflow, codex-review-gate, prepare-for-review,
   clean-branch-history, using-git-worktrees). References to
   `close-feature-branch` / `close-issue` / `close-branch` get replaced by
   "your project's merge ritual" or similar.
5. **Historical filenames:** dated spec/decision filenames preserved
   as-is (they're a frozen design trail); internal prose in those files
   gets the pass.

### Doc triage — what moves, what stays

| File | Moves? | Reasoning |
|---|---|---|
| `agent-config/docs/specs/2026-04-17-ralph-loop-v2-design.md` | **Move** | Master architectural spec |
| `agent-config/docs/specs/2026-04-21-ralph-scope-model-design.md` | **Move** | DAG scope model |
| `agent-config/docs/specs/2026-04-21-ralph-implement-skill-design.md` | **Move** | Implement-skill architecture |
| `agent-config/docs/specs/2026-04-22-ralph-workflow-modes-rule-audit-design.md` | **Stay** | About chezmoi CLAUDE.md structure |
| `agent-config/docs/specs/2026-04-22-ralph-v2-workflow-evaluation-design.md` | **Stay** | Workflow evaluation (ENG-178) |
| `agent-config/docs/specs/2026-04-23-simplify-autonomous-mode-overrides-design.md` | **Stay** | Chezmoi CLAUDE.md evolution |
| `agent-config/docs/decisions/2026-04-20-ralph-v2-ambiguous-outcome-handling.md` | **Move** | Orchestrator classification |
| `agent-config/docs/decisions/2026-04-20-ralph-v2-multi-parent-integration-abort.md` | **Move** | DAG integration strategy |
| `agent-config/docs/decisions/2026-04-22-ralph-scope-discovery-show-toplevel.md` | **Move** | `.ralph.json` discovery |
| `agent-config/docs/decisions/2026-04-22-ralph-spec-sources-ralph-start-libs.md` | **Move** | Inter-skill invariant |
| `agent-config/docs/decisions/2026-04-22-ralph-spec-finalization-invariants.md` | **Move** | Finalization preflight |
| `agent-config/docs/decisions/2026-04-22-ralph-spec-visual-companion-glob.md` | **Stay** | Superpowers companion path |
| `agent-config/docs/progress/2026-04-18-ralph-v2-progress.md` | **Stay** | Chezmoi dev log |

### Chezmoi cutover commit

One commit in chezmoi that lands after the plugin is pushed and verified:

**Deletions (entire trees / files):**

- `agent-config/skills/ralph-start/`
- `agent-config/skills/ralph-spec/`
- `agent-config/skills/ralph-implement/`
- `agent-config/docs/playbooks/ralph-v2-usage.md`
- 3 moved specs + 5 moved decisions (per triage table)

**Stays in chezmoi as historical context:**

- 3 remaining ralph specs + 1 decision + 1 progress doc (per triage)

**Edits in chezmoi files:**

1. `agent-config/CLAUDE.md`:
   - Remove `## Workflow modes` section entirely.
   - Remove `## Autonomous mode` section entirely.
   - Rule #1: drop "or exit clean with a Linear comment in autonomous mode"
     clause.
   - Out-of-scope bugs rule: drop "stop in interactive mode or exit clean
     in autonomous mode" clause; leave as just "stop."
2. `CLAUDE.md` (chezmoi root): update Superpowers Overrides note if it
   references ralph paths; otherwise no change.
3. `dot_claude/symlink_skills.tmpl`: verify no breakage (ralph skills are
   gone but other skills remain; template still correct).
4. `.gitignore` (chezmoi root): no changes — `.worktrees/` is generic;
   ralph runtime artifacts are created in whatever repo runs a ralph
   session, and chezmoi is itself a consumer (so those entries stay).
5. `agent-config/docs/playbooks/superpowers-patches.md`: grep for ralph
   path references and update if any land on moved paths.
6. Add `agent-config/docs/notes/sensible-ralph-migration.md`: short note
   recording "As of 2026-04-XX, the ralph workflow lives in the
   sensible-ralph plugin at github.com/seankao31/sensible-ralph. Prior
   design history pre-extraction remains at specs/decisions paths above.
   Post-extraction work happens in the plugin repo."

### Reviewer's coverage check

Before merging the chezmoi cutover, reviewer runs a coverage check against
the new plugin repo:

```bash
# For each deleted path, verify its plugin-side counterpart exists.
expected=(
  skills/ralph-start
  skills/ralph-spec
  skills/ralph-implement
  docs/usage.md
  docs/specs/2026-04-17-ralph-loop-v2-design.md
  docs/specs/2026-04-21-ralph-scope-model-design.md
  docs/specs/2026-04-21-ralph-implement-skill-design.md
  docs/decisions/2026-04-20-ralph-v2-ambiguous-outcome-handling.md
  docs/decisions/2026-04-20-ralph-v2-multi-parent-integration-abort.md
  docs/decisions/2026-04-22-ralph-scope-discovery-show-toplevel.md
  docs/decisions/2026-04-22-ralph-spec-sources-ralph-start-libs.md
  docs/decisions/2026-04-22-ralph-spec-finalization-invariants.md
)
for p in "${expected[@]}"; do
  test -e "<plugin-repo>/$p" || echo "MISSING in plugin: $p"
done
```

Silent output = coverage complete.

Additional spot checks:

```bash
grep -rn -i 'Sean\|chezmoi\|agent-config' <plugin-repo>/ | grep -v 'CHANGELOG\|^docs/specs/'
# ^ expected: empty or only README's external references

grep -rn 'RALPH_\(APPROVED\|IN_PROGRESS\|REVIEW\|DONE\)_STATE' <plugin-repo>/skills/
# ^ expected: empty (all renamed to CLAUDE_PLUGIN_OPTION_*)

grep -rn '\$HOME/.claude/skills' <plugin-repo>/
# ^ expected: empty (all references go through $CLAUDE_PLUGIN_ROOT)
```

## Alternatives considered

1. **Split into multiple Linear tickets** (ENG-243 for plugin extraction,
   follow-up for chezmoi cutover). Rejected: the reviewer can inspect both
   repos' diffs side-by-side under a single ticket; `git revert` is the
   safety net if coverage turns out to be imperfect; an intermediate state
   where ralph exists in both places is uncomfortable but never broken.

2. **Keep `## Autonomous mode` section in global CLAUDE.md, let plugin
   rely on it.** Rejected: the plugin's autonomous-mode safety contract
   would only be enforced for operators whose CLAUDE.md has the section —
   not for anyone else who installs it. Self-containment is the whole
   point of extraction.

3. **Rules live in `ralph-implement`'s `SKILL.md`** instead of orchestrator
   preamble. Rejected: skill content only loads when invoked; the
   pre-invocation gap allows Claude to make decisions before autonomous
   rules are active.

4. **Keep `config.sh` as-is, map `CLAUDE_PLUGIN_OPTION_*` → `RALPH_*` for
   downstream.** Rejected (on Sean's feedback): the mapping layer is
   unnecessary indirection. Renaming downstream references is mechanical
   and catches the opportunity to unify namespace.

5. **`git subtree split`** instead of `git filter-repo`. Rejected:
   filter-repo handles path renames in a single invocation; subtree split
   would require a subsequent rename pass and doesn't preserve the same
   commit identity.

6. **Fresh repo, no history carryover.** Rejected: ticket explicitly
   prefers history preservation; the design trail through ENG-200 / ENG-205
   / ENG-178 is load-bearing context for future maintenance.

7. **Rename skills to `sensible-ralph-*`** (sralph, etc.). Rejected:
   "ralph" is the technique name, "sensible-ralph" is the plugin
   distributing it. Matches how superpowers ships `writing-plans` without a
   `superpowers-` prefix. Plugin namespacing (`sensible-ralph:ralph-start`)
   handles rare collision cases.

## Risks and mitigations

1. **Filter-repo drops a commit we need.** Mitigation:
   `git log --oneline -- agent-config/skills/ralph-start agent-config/skills/ralph-spec agent-config/skills/ralph-implement`
   before extraction; compare count to post-filter `git log --oneline`.

2. **Variable rename misses a reference.** Mitigation: post-rename
   `grep -rn 'RALPH_\(APPROVED\|IN_PROGRESS\|REVIEW\|DONE\)_STATE\|RALPH_\(FAILED\|STALE_PARENT\)_LABEL\|RALPH_WORKTREE_BASE\|RALPH_MODEL\|RALPH_STDOUT_LOG' skills/`
   must be empty.

3. **Bats suite fails in new repo.** Mitigation: run the suite as part of
   extraction; failures block the push. Typical cause: path references or
   env-var names that didn't get updated.

4. **Preamble injection interferes with slash-command recognition.**
   Mitigation: preamble ends with blank line before
   `/ralph-implement ENG-NNN` (slash command starts on its own line).
   Test dispatch against a throwaway Linear issue before final push.

5. **Hardcoded references to `$HOME/.claude/skills/` in scripts.**
   Mitigation: `grep -rn '\$HOME/.claude/skills' <plugin-repo>/` must be
   empty post-extraction; replace with `$CLAUDE_PLUGIN_ROOT/`.

6. **Consumer repos' `.gitignore` missing ralph runtime artifacts.**
   Mitigation: README Prerequisites section and `docs/usage.md` include a
   copy-pasteable `.gitignore` snippet listing `progress.json`,
   `ordered_queue.txt`, `<plugin configured stdout log filename>`,
   `<plugin configured worktree base>/`.

## Acceptance criteria

- [ ] `sensible-ralph` exists at `git@github.com:seankao31/sensible-ralph.git`
      with `main` pushed.
- [ ] `.claude-plugin/plugin.json` has the userConfig schema above.
- [ ] `.claude-plugin/marketplace.json` is the self-marketplace above.
- [ ] README leads with the five pillars.
- [ ] `/ralph-start`, `/ralph-spec`, `/ralph-implement` are discovered after
      `claude plugin marketplace add seankao31/sensible-ralph &&
       claude plugin install sensible-ralph@sensible-ralph`.
- [ ] Bats suite passes: `bats skills/ralph-start/scripts/test/` green in
      the new repo.
- [ ] Git history for moved files is preserved via filter-repo.
- [ ] Chezmoi cutover commit: ralph skill dirs and triaged docs removed;
      CLAUDE.md surgery applied; migration note added.
- [ ] `grep -rn -i 'Sean\|chezmoi\|agent-config' <plugin-repo>/` returns
      only intended references (no operator name, no chezmoi-specific
      paths).
- [ ] `grep -rn 'RALPH_\(APPROVED\|...\)' <plugin-repo>/skills/` returns
      empty (all renamed to `CLAUDE_PLUGIN_OPTION_*`).
- [ ] A dispatched test session against a throwaway Linear issue runs
      end-to-end: orchestrator reads userConfig, loads scope, preamble
      injects, `/ralph-implement` runs, `/prepare-for-review` transitions
      the issue to In Review.

## Why

Ralph is a self-contained autonomous-execution pipeline that multiple
repos could benefit from. Today it's only usable in the chezmoi working
tree because its skills are project-local. Extraction unlocks installation
anywhere, enables independent versioning, and reduces chezmoi's
agent-config bloat (the ralph-start skill alone carries a large
scripts+tests surface).

Secondary motive: making the plugin public is an open-source contribution
with clear differentiation from existing ralph variants (see the five
pillars and competitor context above).

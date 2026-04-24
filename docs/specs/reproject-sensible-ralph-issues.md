# Reproject sensible-ralph issues from Agent Config to Sensible Ralph

ENG-243 extracted the ralph workflow from `agent-config/` into the standalone `sensible-ralph` plugin (now at `github.com/seankao31/sensible-ralph`). Active Linear issues whose subject is the ralph workflow itself currently sit in the **Agent Config** project; their natural home is now the **Sensible Ralph** project. This spec covers the housekeeping pass that reprojects them, updates the chezmoi-side routing rule for future ambiguous filings, and patches the one memory entry that quotes the routing rule verbatim.

## Authority

`agent-config/docs/sensible-ralph-migration.md` is the durable authority for what counts as "the ralph workflow." This spec defers all classification questions to that doc's "What moved" / "What stayed" partitions. If the migration doc and this spec ever disagree, the migration doc wins.

## Scope

### In scope

1. **Reproject active ralph-themed AC issues** to Sensible Ralph. Active = any workflow state except `Done` and `Canceled` (i.e. `Triage`, `Backlog`, `Todo`, `Approved`, `Blocked`, `In Progress`, `In Review`).
2. **Update chezmoi root `CLAUDE.md` § Linear** to list Sensible Ralph as a third project and tighten Agent Config's bullet to exclude ralph workflow content.
3. **Update one memory entry** (`project_claudemd_principle_mechanism_split.md`): refresh the §Linear snippet it quotes so the example tracks the live rule.

### Out of scope

- **Done/Canceled AC issues** — they stay in AC. Pre-extraction the work happened under `agent-config/`; reprojecting now would erase that history. The Done/Canceled queries operators actually run (cycle reviews, retrospective analysis) lose their AC anchor for no benefit.
- **Issue content edits beyond `--project`** — no description changes, no label changes, no milestone changes, no comments. Project membership only.
- **Reorganizing the Sensible Ralph project** — sub-projects, milestones, cycles are someone else's call later.
- **Adding `.ralph.json` to the sensible-ralph plugin repo** — separate concern. The plugin's own dispatch story (whether ralph-from-the-plugin-repo, manual, or external) is not blocked by this issue.
- **Other memory entries that mention "Agent Config"** — those references are pre-extraction historical context (e.g. "ENG-213 split close-feature-branch into close-issue (now in plugin) + close-branch"); rewriting them erases provenance.

## Classification heuristic

For each active AC issue, decide based on the migration doc's partitions.

**Reproject to Sensible Ralph** if the deliverable was/is a change to anything in the migration doc's "What moved" list, including:

- Ralph skills: `ralph-start`, `ralph-spec`, `ralph-implement`, `prepare-for-review`, `close-issue`
- Plugin-internal workflow components: `codex-review-gate`, `clean-branch-history`, `autonomous-preamble`
- Ralph orchestrator behavior: scope model, state machine, queue logic, `progress.json`
- Plugin-internal config: `CLAUDE_PLUGIN_OPTION_*`, `ralph-failed` label, plugin packaging
- Design docs / decisions that the migration doc lists as moved (the 2026-04-17 ralph-loop-v2 spec, scope-model spec, ralph-implement spec, and the five decisions enumerated in the doc)

**Leave in Agent Config** if the deliverable matches the migration doc's "What stayed" or is otherwise chezmoi-side, including:

- Agent-config docs/specs/decisions that the migration doc explicitly lists as stayed (the 2026-04-22 workflow-modes audit, workflow-evaluation spec, the 2026-04-23 autonomous-mode-overrides simplification, the 2026-04-22 visual-companion-glob decision, the 2026-04-18 progress doc, and post-2026-04-22 chezmoi-era hardening decisions)
- `agent-config/superpowers-overrides/` — overrides live in chezmoi by design
- `agent-config/hooks/` — chezmoi-local hooks
- Edits to chezmoi root `CLAUDE.md` or `agent-config/CLAUDE.md`
- The plugin-extraction issue itself (ENG-243) and follow-on chezmoi-side audits (e.g. ENG-271, "Audit superpowers overrides for sensible-ralph fitness")

**Tie-breaker for borderline cases.** If the heuristic above doesn't resolve, ask: "If I were filing this issue today, would the implementation diff land in the sensible-ralph plugin repo or in chezmoi?" — that's the project. An AC issue that mentions ralph skills incidentally (e.g. an override that affects ralph dispatch) but whose deliverable is a chezmoi-side file stays in AC.

**Default if both heuristic and tie-breaker still fail.** Leave the issue in AC (no `--project` change) and add it to a "needs human triage" list in the completion summary. Staying in AC is the safe default since that's the issue's current home, and a human can revisit later. Do not file a follow-up Linear issue for the ambiguous case — a one-line note in the completion summary is enough.

## Procedure

### 1. Enumerate candidates

```bash
linear issue query \
  --project "Agent Config" \
  --team ENG \
  --state triage --state backlog --state unstarted --state started \
  --limit 0 --json \
  | jq -r '.nodes[] | "\(.identifier)\t\(.state.name)\t\(.title)"'
```

Walk the resulting list. For each row, fetch the description if the title alone doesn't decide it (`linear issue view ENG-NNN --json | jq -r .description`), apply the heuristic, and record the verdict.

### 2. Reproject the matches

For each issue classified as ralph-themed:

```bash
linear issue update "$ISSUE_ID" --project "Sensible Ralph"
```

No comment, no label change, no description edit. Only `--project` is touched.

### 3. Edit chezmoi root `CLAUDE.md` § Linear

Replace the existing two-bullet list with the following three-bullet list (Agent Config / Sensible Ralph / Machine Config). The Sensible Ralph bullet's "implemented in the plugin repo" note signals that this entry routes ambiguous chezmoi-side discoveries — most plugin issues will be filed from the plugin repo itself.

```markdown
## Linear

Team: **Engineering (ENG)**

Issues for this repo go into one of these projects:

- **Agent Config** (initiative: AI Collaboration Toolkit) —
  chezmoi-side agent infrastructure: custom skills,
  superpowers overrides, hooks, `CLAUDE.md`, design notes,
  playbooks. NOT the ralph workflow itself (that's Sensible
  Ralph).

- **Sensible Ralph** (initiative: AI Collaboration Toolkit) —
  the `sensible-ralph` plugin: ralph-* skills,
  `prepare-for-review`, `close-issue`, `codex-review-gate`,
  plugin-internal config. Implemented in the plugin repo at
  github.com/seankao31/sensible-ralph, not here.

- **Machine Config** (initiative: Machine Config) — chezmoi
  plumbing, dotfiles outside `agent-config/`, machine-level
  tooling.

For out-of-scope bug discoveries during any session in this repo, file a Linear issue in the appropriate project above.
```

### 4. Update `project_claudemd_principle_mechanism_split.md`

This memory entry quotes the §Linear section as an example of where the concrete filing mechanism lives. Refresh the quoted snippet to track the new three-bullet list. Leave the surrounding "principle vs mechanism" reasoning unchanged — that argument is still correct; only the example needs updating.

The file path is:
`/Users/seankao/.claude/projects/-Users-seankao--local-share-chezmoi/memory/project_claudemd_principle_mechanism_split.md`

## Acceptance criteria

- [ ] Every active AC issue (any state except `Done` and `Canceled`) has been examined against the heuristic.
- [ ] Active ralph-themed AC issues are now in the Sensible Ralph project; nothing else changed about them (description, labels, state, assignee, milestone all preserved).
- [ ] Done/Canceled AC issues are unchanged.
- [ ] Chezmoi root `CLAUDE.md` § Linear shows the new three-project bullet list.
- [ ] `project_claudemd_principle_mechanism_split.md`'s §Linear example matches the new live rule.
- [ ] `linear issue query --project "Agent Config" --state triage --state backlog --state unstarted --state started --json` shows no remaining active issues whose deliverable is to ralph workflow code (per migration doc partitions).

## Verification edge cases

- **Borderline issue.** Apply the tie-breaker: would the diff land in the plugin repo or in chezmoi? If still ambiguous, leave it in AC and surface for human triage in a follow-up — don't guess.
- **Linear API failure mid-loop.** Reproject is idempotent (`--project "Sensible Ralph"` on an already-Sensible-Ralph issue is a no-op). Rerun the loop on partial failure; no special recovery needed.
- **Sensible Ralph dispatch from chezmoi.** Currently impossible — chezmoi's `.ralph.json` scope is `["Agent Config", "Machine Config"]`. This is intentional: plugin work is implemented in the plugin repo, not here. No `.ralph.json` change in this issue.

## Prerequisites

None. ENG-243 (the extraction itself) is Done; this is the housekeeping pass that follows.

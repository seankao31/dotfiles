# Ralph-spec resolves visual-companion via plugin glob, not vendored copy

## Context

The `superpowers:brainstorming` skill ships a browser-based "visual companion"
— an HTTP server that serves HTML fragments for mockup-style questions
during brainstorming dialogues. The infrastructure is ~5 files
(`visual-companion.md`, `scripts/start-server.sh`, `scripts/stop-server.sh`,
`scripts/frame-template.html`, `scripts/helper.js`) that live in the
superpowers plugin cache at a versioned path:

```
~/.claude/plugins/cache/claude-plugins-official/superpowers/<VERSION>/skills/brainstorming/
```

The existing `superpowers-overrides/brainstorming/SKILL.md` references these
files via the relative path `skills/brainstorming/visual-companion.md`, which
works only because the override is symlinked *into* the plugin cache (per
`superpowers-patches.md`), so the working directory resolves to the plugin
root.

A new skill at `agent-config/skills/ralph-spec/` does not have that symlink
hack — its base directory is the agent-config skill dir, so plugin-relative
paths don't resolve. Two realistic options:

1. **Vendor** the five files into `ralph-spec/`. Self-contained, portable,
   but duplicates infrastructure that drifts silently when superpowers
   updates.
2. **Glob-resolve** the plugin path at runtime using
   `~/.claude/plugins/cache/claude-plugins-official/superpowers/*/skills/brainstorming/`,
   picking the highest version if multiple match.

## Decision

`ralph-spec` resolves the visual companion directory via a version-wildcard
glob against the superpowers plugin cache:

```bash
COMPANION_DIR=$(ls -d ~/.claude/plugins/cache/claude-plugins-official/superpowers/*/skills/brainstorming 2>/dev/null | sort -V | tail -1)
```

If the glob resolves, read `$COMPANION_DIR/visual-companion.md` for the
detailed guide and invoke `$COMPANION_DIR/scripts/start-server.sh` etc. If
empty, proceed with text-only brainstorming.

## Reasoning

**Usage frequency.** Visual companion fires only when the dialogue hits a
visual question AND the user consents to opening a local URL. Most ralph
specs describe text-oriented autonomous work where no mockup is needed.
Rarely-invoked infrastructure doesn't justify the vendoring cost.

**Drift cost of vendoring.** Copying five files into ralph-spec makes them
a vendored snapshot that diverges silently from upstream on every
superpowers bump. The `superpowers-patches.md` playbook already has
re-apply steps for overrides; adding "re-sync ralph-spec/visual-companion"
compounds the maintenance burden for infrastructure we rarely touch.

**Dependency reality.** The superpowers plugin is already a transitive
dependency of ralph-spec — the skill inherits its brainstorming dialogue
structure from the plugin's brainstorming skill (via the override we forked
from). Coupling visual-companion to plugin availability doesn't add a new
dependency; it acknowledges one that already exists.

**Why `sort -V | tail -1`.** The plugin cache usually contains exactly one
version, but a pending upgrade can briefly leave two. Taking the newest
preserves the "latest installed wins" semantic without requiring the
plugin install to be at a specific version.

## Consequences

**Do not hard-code the plugin version in the glob** (e.g. `superpowers/5.0.7/`).
That would require re-editing ralph-spec on every plugin bump — the exact
drift cost we're avoiding. The version wildcard + sort is the point.

**If the upstream plugin restructures its brainstorming skill's scripts/
layout**, ralph-spec's path references break silently. Mitigation: the
skill degrades to text-only dialogue rather than failing hard, and an
operator invoking visual companion will notice the failure. This is a
chosen tradeoff — the alternative (eager validation on every spec run)
slows the common case for a rare failure.

**Do not add a fallback that copies files on first use.** That creates an
implicit vendor cache with all the drift problems, plus file-lifecycle
bugs. If vendoring ever becomes the right call, do it explicitly in the
skill directory, not lazily.

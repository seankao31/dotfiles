# Linear Dependency Visualizer

## Problem

Visualizing issue dependencies across a Linear initiative or project via full
Claude orchestration — fetching every issue via MCP, reasoning about structure,
and manually assembling Graphviz DOT output — is token-expensive and
non-repeatable.

## Solution

Two standalone Node.js scripts that separate data fetching from graph
rendering, with an optional human/AI label-editing pass in between.

### Scripts

#### `fetch-issues.js`

Fetches issue data from Linear and writes a compact JSON manifest.

**Input:**
- `--project <name>` — fetch all issues in a named project
- `--initiative <name>` — fetch all issues across all projects in a named initiative
- Mutually exclusive; one is required
- `--output <path>` — output file path (default: `manifest.json`)

**Auth:** delegated entirely to the `linear` CLI (`linear auth login` before
first use). The script never handles API keys itself.

**Data access:** calls `linear api` (the CLI's GraphQL passthrough) via
`execFileSync` with `--variable` flags, which avoids shell interpolation of
user input. Queries:
1. For `--initiative`: query initiatives by name → get associated projects → get issues per project
2. For `--project`: query projects by name → get issues in that project
3. For each issue: fetch `identifier`, `title`, `state { name, type, color }`, `relations { type, relatedIssue { id, identifier } }`

**Output:** `manifest.json` with this shape:

```json
{
  "source": { "type": "initiative", "name": "..." },
  "fetchedAt": "2026-04-08T18:30:00Z",
  "projects": [
    { "id": "proj-1", "name": "Project Name", "color": "#8B5CF6" }
  ],
  "issues": [
    {
      "id": "issue-uuid",
      "identifier": "ENG-64",
      "title": "Full issue title from Linear",
      "label": "Concise graph label",
      "projectId": "proj-1",
      "status": { "name": "In Progress", "type": "started", "color": "#F59E0B" },
      "blockedBy": ["other-issue-uuid"],
      "blocks": ["another-issue-uuid"]
    }
  ]
}
```

The `label` field defaults to a truncated/cleaned version of `title` (strip
common prefixes like "Done when", cap at ~40 chars). This field is what the
render script uses for node text, and is the field a human or Claude edits in
the two-pass label-refinement workflow.

**Pagination:** Linear's API pages at 50 items. The script handles pagination
for issues within each project.

#### `render-graph.js`

Reads a manifest and produces a Graphviz DOT file (and optionally renders it).

**Input:**
- `--input <path>` — path to manifest JSON (default: `manifest.json`)
- `--output <path>` — output path for DOT file (default: `graph.dot`)
- `--render` — if present, also run `dot -Tsvg -o graph.svg graph.dot`
- `--format <fmt>` — output format when `--render` is used (default: `svg`, also supports `png`)

**DOT generation rules:**

1. **Graph settings:** `rankdir=TB`, `splines=ortho`, `nodesep=0.6`, `ranksep=0.8`
2. **Project clusters:** Each project becomes a `subgraph cluster_<id>` with:
   - Label = project name
   - Background color = project color at low opacity
   - Dashed border style
3. **Issue nodes:** Rounded rectangles with:
   - Two-line label: `identifier\nlabel`
   - Fill color derived from project color (light tint)
   - Border color derived from project color (darker shade)
   - Status indication: completed issues get a muted/grayed style
4. **Dependency edges:** Arrow from blocker → blocked issue (i.e., if B is blockedBy A, draw `A -> B`)
   - Cross-cluster edges use the default color
   - Intra-cluster edges use the cluster's color

**Orphan handling:** Issues with no dependencies are still shown in their
project cluster (they may have implicit grouping value).

### Directory Structure

```
linear-visualize/
├── .gitignore            # node_modules/, manifest.json, *.svg, *.png, graph.dot
├── package.json
├── fetch-issues.js
├── render-graph.js
└── test/
    ├── dot-generator.test.js
    └── labels.test.js
```

### Two-Pass Label Workflow

1. Run `node fetch-issues.js --initiative "My Initiative"`
2. Claude reads `manifest.json`, edits `label` fields to produce concise node labels
3. Run `node render-graph.js --render` → produces `graph.svg`

For quick one-shot use (no label editing), run both commands back-to-back —
the auto-truncated labels are the default.

### Dependencies

- **`linear` CLI** — authenticates and provides the `linear api` GraphQL
  passthrough; no direct HTTP client, no API key handling, no `dotenv` needed.
- **graphviz (`dot` CLI)** — must be installed on the system for `--render` to work.

No graph layout libraries needed — Graphviz handles layout.

### Future: Live Server

The fetch logic in `fetch-issues.js` is designed to be importable as a module.
A future `server.js` can import `fetch-issues` to poll Linear on an interval
and push updates to a browser-based visualization. Out of scope for now.

## Out of Scope

- Web-based live visualization (future work)
- Issue creation or status updates (handled by the linear-workflow skill)
- Non-dependency relations (e.g., "related to" without blocking semantics)

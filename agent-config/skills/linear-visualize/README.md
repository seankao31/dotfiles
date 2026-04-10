# linear-visualize

Visualize Linear issue dependencies as a Graphviz graph with project-colored clusters.

## Setup

Authenticate with the Linear CLI:
```bash
linear auth login
```

## Usage

### 1. Fetch issues

Fetch all issues in an initiative:
```bash
bun fetch-issues.js --initiative "My Initiative"
```

Or a single project:
```bash
bun fetch-issues.js --project "My Project"
```

Options:
- `--initiative <name>` — fetch all issues across all projects in the initiative
- `--project <name>` — fetch all issues in a single project
- `--output <path>` — output file (default: `manifest.json`)

These are mutually exclusive; exactly one is required.

### 2. (Optional) Edit labels

The manifest's `label` field on each issue is what appears in the graph nodes. By default it's a truncated version of the issue title (max 40 chars, "Done when" prefix stripped).

For cleaner graphs, ask Claude to read `manifest.json` and produce concise labels:
```
Read manifest.json and edit the "label" fields to be concise 2-4 word descriptions
```

### 3. Render the graph

Generate DOT and render to SVG:
```bash
bun render-graph.js --render
```

Options:
- `--input <path>` — manifest file (default: `manifest.json`)
- `--output <path>` — DOT output file (default: `graph.dot`)
- `--render` — also run Graphviz `dot` to produce an image
- `--format <fmt>` — image format when `--render` is used (default: `svg`, also `png`)

### One-liner

```bash
bun fetch-issues.js --initiative "My Initiative" && bun render-graph.js --render && open graph.svg
```

## Prerequisites

- Node.js >= 18 or Bun
- [Graphviz](https://graphviz.org/) for rendering (`brew install graphviz`)
- The `linear` CLI, authenticated (`linear auth login`)

## How it works

`fetch-issues.js` queries Linear's GraphQL API (via `linear api`) to get issues with their dependency relations (`blocks`/`blockedBy`) and writes a compact JSON manifest.

`render-graph.js` reads that manifest and produces Graphviz DOT with:
- **Project clusters** — each project is a colored subgraph with dashed border
- **Dependency edges** — arrows from blocker to blocked issue
- **Completed issues** — muted gray styling
- **Orphan grid** — issues with no dependencies arranged in a 4-wide grid (not one long row)
- **Color palette** — auto-assigned when Linear projects share the same default color

## Manifest shape

```json
{
  "source": { "type": "initiative", "name": "..." },
  "fetchedAt": "2026-04-09T...",
  "projects": [
    { "id": "...", "name": "Project Name", "color": "#8B5CF6" }
  ],
  "issues": [
    {
      "id": "...",
      "identifier": "ENG-64",
      "title": "Full issue title from Linear",
      "label": "Concise graph label",
      "projectId": "...",
      "status": { "name": "In Progress", "type": "started", "color": "#F59E0B" },
      "blockedBy": ["issue-id"],
      "blocks": ["issue-id"]
    }
  ]
}
```

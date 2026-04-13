import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

// ── Color utilities ─────────────────────────────────────

export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function darkenHex(hex, factor) {
  const r = Math.floor(parseInt(hex.slice(1, 3), 16) * factor)
  const g = Math.floor(parseInt(hex.slice(3, 5), 16) * factor)
  const b = Math.floor(parseInt(hex.slice(5, 7), 16) * factor)
  const toHex = (n) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function lightenHex(hex, factor) {
  // Blend toward white by factor (0 = original, 1 = white)
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const blend = (c) => Math.round(c + (255 - c) * factor)
  const toHex = (n) => n.toString(16).padStart(2, '0')
  return `#${toHex(blend(r))}${toHex(blend(g))}${toHex(blend(b))}`
}

// ── Priority helpers ─────────────────────────────────────

// Linear priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low
const PRIORITY_PREFIX = { 1: '!! ', 2: '! ' }
const PRIORITY_PENWIDTH = { 1: 3, 2: 2, 3: 1, 4: 1, 0: 1 }

function priorityPrefix(priority) {
  return PRIORITY_PREFIX[priority] ?? ''
}

function priorityPenwidth(priority) {
  return PRIORITY_PENWIDTH[priority] ?? 1
}

// ── Escape DOT strings ──────────────────────────────────

function esc(str) {
  return str.replace(/"/g, '\\"')
}

// Sanitize ID for use as DOT subgraph suffix (letters, digits, underscores)
function sanitizeId(id) {
  return id.replace(/[^a-zA-Z0-9]/g, '_')
}

// ── Color palette ────────────────────────────────────────

const PALETTE = [
  '#4ADE80', // green
  '#8B5CF6', // purple
  '#F87171', // coral
  '#FBBF24', // amber
  '#60A5FA', // blue
  '#F472B6', // pink
  '#34D399', // emerald
  '#FB923C', // orange
  '#A78BFA', // violet
  '#38BDF8', // sky
]

function assignProjectColors(projects) {
  const colors = projects.map((p) => p.color)
  const allSame = colors.every((c) => c === colors[0])
  if (!allSame) return projects

  return projects.map((p, i) => ({
    ...p,
    color: PALETTE[i % PALETTE.length],
  }))
}

// ── DOT generation ──────────────────────────────────────

export function generateDot(manifest) {
  const issueIds = new Set(manifest.issues.map((i) => i.id))
  const projects = assignProjectColors(manifest.projects)
  const lines = []

  lines.push('digraph {')
  lines.push('  rankdir=TB;')
  lines.push('  splines=ortho;')
  lines.push('  compound=true;')
  lines.push('  newrank=true;')
  lines.push('  nodesep=0.6;')
  lines.push('  ranksep=0.8;')
  lines.push('  node [shape=box, style="filled,rounded", fontname="Helvetica", fontsize=11];')
  lines.push('  edge [color="#666666", arrowsize=0.7];')
  lines.push('')

  // Group issues by project
  const issuesByProject = new Map()
  for (const project of projects) {
    issuesByProject.set(project.id, [])
  }
  for (const issue of manifest.issues) {
    const list = issuesByProject.get(issue.projectId)
    if (list) list.push(issue)
  }

  // Emit clusters
  for (const project of projects) {
    const issues = issuesByProject.get(project.id) || []
    const bgColor = lightenHex(project.color, 0.85)
    const borderColor = darkenHex(project.color, 0.6)

    lines.push(`  subgraph cluster_${sanitizeId(project.id)} {`)
    lines.push(`    label="${esc(project.name)}";`)
    lines.push(`    style=dashed;`)
    lines.push(`    color="${borderColor}";`)
    lines.push(`    bgcolor="${bgColor}";`)
    lines.push(`    fontname="Helvetica";`)
    lines.push(`    fontsize=13;`)
    lines.push('')

    for (const issue of issues) {
      const isCompleted = issue.status.type === 'completed'
      const fillColor = isCompleted ? '#E5E7EB' : lightenHex(project.color, 0.7)
      const fontColor = isCompleted ? '#9CA3AF' : '#1F2937'
      const borderCol = isCompleted ? '#D1D5DB' : darkenHex(project.color, 0.7)

      const prefix = priorityPrefix(issue.priority)
      const penwidth = priorityPenwidth(issue.priority)
      lines.push(
        `    "${issue.id}" [` +
          `label="${esc(prefix + issue.identifier)}\\n${esc(issue.label)}", ` +
          `fillcolor="${fillColor}", ` +
          `color="${borderCol}", ` +
          `fontcolor="${fontColor}", ` +
          `penwidth=${penwidth}` +
          `];`,
      )
    }

    lines.push('  }')
    lines.push('')
  }

  // Emit edges — deduplicate since both directions may be present
  const edges = new Set()
  const connectedIds = new Set()
  for (const issue of manifest.issues) {
    for (const blockerId of issue.blockedBy) {
      if (issueIds.has(blockerId)) {
        edges.add(`"${blockerId}" -> "${issue.id}"`)
        connectedIds.add(blockerId)
        connectedIds.add(issue.id)
      }
    }
    for (const blockedId of issue.blocks) {
      if (issueIds.has(blockedId)) {
        edges.add(`"${issue.id}" -> "${blockedId}"`)
        connectedIds.add(issue.id)
        connectedIds.add(blockedId)
      }
    }
  }
  for (const edge of edges) {
    lines.push(`  ${edge};`)
  }

  // Arrange orphan nodes (no dependency edges) into a grid
  const MAX_PER_ROW = 4
  for (const project of projects) {
    const issues = issuesByProject.get(project.id) || []
    const orphans = issues.filter((i) => !connectedIds.has(i.id))
    if (orphans.length <= MAX_PER_ROW) continue

    // Group into rows and constrain with rank=same
    for (let row = 0; row < orphans.length; row += MAX_PER_ROW) {
      const rowNodes = orphans.slice(row, row + MAX_PER_ROW)
      lines.push(`  { rank=same; ${rowNodes.map((n) => `"${n.id}"`).join('; ')}; }`)
    }

    // Add invisible edges between first node of each row to enforce vertical stacking
    for (let row = 0; row + MAX_PER_ROW < orphans.length; row += MAX_PER_ROW) {
      lines.push(`  "${orphans[row].id}" -> "${orphans[row + MAX_PER_ROW].id}" [style=invis];`)
    }
  }

  lines.push('}')
  return lines.join('\n')
}

// ── CLI ─────────────────────────────────────────────────

function main() {
  const { values } = parseArgs({
    options: {
      input: { type: 'string', default: 'manifest.json' },
      output: { type: 'string', default: 'graph.dot' },
      render: { type: 'boolean', default: false },
      format: { type: 'string', default: 'svg' },
    },
    strict: true,
  })

  let manifestJson
  try {
    manifestJson = readFileSync(values.input, 'utf-8')
  } catch {
    console.error(`ERROR: Could not read "${values.input}". Run fetch-issues.js first.`)
    process.exit(1)
  }

  const manifest = JSON.parse(manifestJson)
  console.error(
    `Generating graph for ${manifest.source.type} "${manifest.source.name}" ` +
      `(${manifest.issues.length} issues, ${manifest.projects.length} project(s))`,
  )

  const dot = generateDot(manifest)
  writeFileSync(values.output, dot)
  console.error(`DOT written to ${values.output}`)

  if (values.render) {
    const outFile = values.output.replace(/\.dot$/, `.${values.format}`)
    try {
      execSync(`dot -T${values.format} -o "${outFile}" "${values.output}"`, { stdio: 'inherit' })
      console.error(`Rendered to ${outFile}`)
    } catch {
      console.error('ERROR: Failed to run "dot". Is Graphviz installed? (brew install graphviz)')
      process.exit(1)
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}

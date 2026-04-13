import { writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

// ── Label utility ───────────────────────────────────────

const MAX_LABEL_LENGTH = 40

/**
 * Produce a concise node label from an issue title.
 * Strips "Done when" prefixes and truncates at word boundary.
 */
export function makeLabel(title) {
  if (!title) return ''

  let label = title.replace(/^done when\s+/i, '')
  // Capitalize first letter
  label = label.charAt(0).toUpperCase() + label.slice(1)

  if (label.length <= MAX_LABEL_LENGTH) return label

  // Truncate at last space before limit, add ellipsis
  const truncated = label.slice(0, MAX_LABEL_LENGTH - 1)
  const lastSpace = truncated.lastIndexOf(' ')
  if (lastSpace > 0) {
    return truncated.slice(0, lastSpace) + '…'
  }
  return truncated + '…'
}

// ── GraphQL client (via linear CLI) ─────────────────────

function gql(query, variables = {}) {
  const args = Object.entries(variables)
    .filter(([, val]) => val != null)
    .flatMap(([key, val]) => ['--variable', `${key}=${val}`])

  const stdout = execFileSync('linear', ['api', ...args], { input: query, encoding: 'utf-8' })
  const json = JSON.parse(stdout)
  if (json.errors) {
    throw new Error(`Linear API error: ${json.errors[0].message}`)
  }
  return json.data
}

// ── Paginated issue fetcher ─────────────────────────────

const ISSUES_QUERY = `
  query ProjectIssues($projectId: String!, $cursor: String) {
    project(id: $projectId) {
      issues(first: 50, after: $cursor) {
        nodes {
          id
          identifier
          title
          priority
          priorityLabel
          state { name type color }
          relations {
            nodes {
              type
              relatedIssue { id identifier }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`

function fetchIssuesForProject(projectId) {
  const allIssues = []
  let cursor = null

  while (true) {
    const data = gql(ISSUES_QUERY, { projectId, cursor })
    const { nodes, pageInfo } = data.project.issues
    allIssues.push(...nodes)

    if (!pageInfo.hasNextPage) break
    cursor = pageInfo.endCursor
  }

  return allIssues
}

// ── Project lookup ──────────────────────────────────────

const PROJECTS_BY_NAME_QUERY = `
  query ProjectsByName($name: String!) {
    projects(filter: { name: { eq: $name } }) {
      nodes { id name color }
    }
  }
`

function findProjectByName(name) {
  const data = gql(PROJECTS_BY_NAME_QUERY, { name })
  const projects = data.projects.nodes

  if (projects.length === 0) {
    throw new Error(`No project found with name "${name}"`)
  }
  if (projects.length > 1) {
    const names = projects.map((p) => `  - ${p.name} (${p.id})`).join('\n')
    throw new Error(`Multiple projects match "${name}":\n${names}`)
  }
  return projects[0]
}

// ── Initiative lookup ───────────────────────────────────

const INITIATIVE_BY_NAME_QUERY = `
  query InitiativeByName($name: String!) {
    initiatives(filter: { name: { eq: $name } }) {
      nodes {
        id
        name
        projects {
          nodes { id name color }
        }
      }
    }
  }
`

function fetchByInitiative(initiativeName) {
  const data = gql(INITIATIVE_BY_NAME_QUERY, { name: initiativeName })
  const initiatives = data.initiatives.nodes

  if (initiatives.length === 0) {
    throw new Error(`No initiative found with name "${initiativeName}"`)
  }
  if (initiatives.length > 1) {
    const names = initiatives.map((i) => `  - ${i.name} (${i.id})`).join('\n')
    throw new Error(`Multiple initiatives match "${initiativeName}":\n${names}`)
  }

  const initiative = initiatives[0]
  const projects = initiative.projects.nodes

  if (projects.length === 0) {
    throw new Error(`Initiative "${initiativeName}" has no projects`)
  }

  console.error(`Initiative "${initiative.name}" has ${projects.length} project(s)`)

  const rawIssuesByProject = {}
  for (const project of projects) {
    console.error(`  Fetching issues for "${project.name}"...`)
    const rawIssues = fetchIssuesForProject(project.id)
    console.error(`    Found ${rawIssues.length} issues`)
    rawIssuesByProject[project.id] = rawIssues
  }

  return buildManifest(
    { type: 'initiative', name: initiative.name },
    projects,
    rawIssuesByProject,
  )
}

// ── Manifest builder ────────────────────────────────────

export function buildManifest(source, projects, rawIssuesByProject) {
  const projectList = projects.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color || '#6B7280',
  }))

  const issues = []
  for (const [projectId, rawIssues] of Object.entries(rawIssuesByProject)) {
    for (const issue of rawIssues) {
      const blockedBy = []
      const blocks = []

      for (const rel of issue.relations?.nodes || []) {
        if (rel.type === 'blocks') {
          blocks.push(rel.relatedIssue.id)
        } else if (rel.type === 'blocked_by') {
          blockedBy.push(rel.relatedIssue.id)
        }
      }

      issues.push({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        label: makeLabel(issue.title),
        priority: issue.priority ?? 0,
        priorityLabel: issue.priorityLabel ?? 'No priority',
        projectId,
        status: {
          name: issue.state?.name || 'Unknown',
          type: issue.state?.type || 'unstarted',
          color: issue.state?.color || '#6B7280',
        },
        blockedBy,
        blocks,
      })
    }
  }

  return {
    source,
    fetchedAt: new Date().toISOString(),
    projects: projectList,
    issues,
  }
}

// ── Project path ────────────────────────────────────────

function fetchByProject(projectName) {
  const project = findProjectByName(projectName)
  console.error(`Fetching issues for project "${project.name}"...`)

  const rawIssues = fetchIssuesForProject(project.id)
  console.error(`Found ${rawIssues.length} issues`)

  return buildManifest(
    { type: 'project', name: project.name },
    [project],
    { [project.id]: rawIssues },
  )
}

// ── CLI ─────────────────────────────────────────────────

function main() {
  const { values } = parseArgs({
    options: {
      project: { type: 'string' },
      initiative: { type: 'string' },
      output: { type: 'string', default: 'manifest.json' },
    },
    strict: true,
  })

  const hasProject = values.project !== undefined
  const hasInitiative = values.initiative !== undefined

  if (hasProject === hasInitiative) {
    console.error('Specify exactly one of --project or --initiative')
    process.exit(1)
  }

  try {
    let manifest
    if (hasProject) {
      manifest = fetchByProject(values.project)
    } else {
      manifest = fetchByInitiative(values.initiative)
    }

    writeFileSync(values.output, JSON.stringify(manifest, null, 2))
    console.error(`Manifest written to ${values.output}`)
  } catch (err) {
    console.error(`ERROR: ${err.message}`)
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}

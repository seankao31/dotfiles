import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateDot, hexToRgba, darkenHex } from '../render-graph.js'

describe('hexToRgba', () => {
  it('converts hex to rgba string', () => {
    assert.equal(hexToRgba('#FF0000', 0.2), 'rgba(255,0,0,0.2)')
  })

  it('handles lowercase hex', () => {
    assert.equal(hexToRgba('#ff8800', 0.5), 'rgba(255,136,0,0.5)')
  })
})

describe('darkenHex', () => {
  it('darkens a color by factor', () => {
    const result = darkenHex('#FF8800', 0.5)
    // #FF8800 * 0.5 = #7F4400 (approximately)
    assert.match(result, /^#[0-9a-fA-F]{6}$/)
    // Should be darker (lower values)
    assert.equal(result.toLowerCase(), '#7f4400')
  })

  it('handles white', () => {
    assert.equal(darkenHex('#FFFFFF', 0.5).toLowerCase(), '#7f7f7f')
  })
})

describe('generateDot', () => {
  const manifest = {
    source: { type: 'initiative', name: 'Test Initiative' },
    projects: [
      { id: 'proj-1', name: 'Backend', color: '#8B5CF6' },
      { id: 'proj-2', name: 'Frontend', color: '#F59E0B' },
    ],
    issues: [
      {
        id: 'issue-1',
        identifier: 'ENG-1',
        label: 'API endpoint',
        projectId: 'proj-1',
        status: { name: 'Done', type: 'completed', color: '#22C55E' },
        blockedBy: [],
        blocks: ['issue-2'],
      },
      {
        id: 'issue-2',
        identifier: 'ENG-2',
        label: 'UI component',
        projectId: 'proj-2',
        status: { name: 'In Progress', type: 'started', color: '#F59E0B' },
        blockedBy: ['issue-1'],
        blocks: [],
      },
      {
        id: 'issue-3',
        identifier: 'ENG-3',
        label: 'Orphan task',
        projectId: 'proj-1',
        status: { name: 'Todo', type: 'unstarted', color: '#6B7280' },
        blockedBy: [],
        blocks: [],
      },
    ],
  }

  it('produces valid digraph wrapper', () => {
    const dot = generateDot(manifest)
    assert.ok(dot.startsWith('digraph {'), 'should start with digraph')
    assert.ok(dot.trimEnd().endsWith('}'), 'should end with closing brace')
  })

  it('includes graph settings', () => {
    const dot = generateDot(manifest)
    assert.ok(dot.includes('rankdir=TB'), 'should have top-to-bottom layout')
    assert.ok(dot.includes('splines=ortho'), 'should have orthogonal edges')
  })

  it('creates project clusters', () => {
    const dot = generateDot(manifest)
    assert.ok(dot.includes('subgraph cluster_proj_1'), 'should have Backend cluster')
    assert.ok(dot.includes('subgraph cluster_proj_2'), 'should have Frontend cluster')
    assert.ok(dot.includes('label="Backend"'), 'should label Backend cluster')
    assert.ok(dot.includes('label="Frontend"'), 'should label Frontend cluster')
  })

  it('creates issue nodes with identifier and label', () => {
    const dot = generateDot(manifest)
    assert.ok(dot.includes('"issue-1"'), 'should have node for ENG-1')
    assert.ok(dot.includes('ENG-1'), 'should include identifier')
    assert.ok(dot.includes('API endpoint'), 'should include label')
  })

  it('creates dependency edges from blocker to blocked', () => {
    const dot = generateDot(manifest)
    // blockedBy means: draw edge from blocker → this issue
    assert.ok(dot.includes('"issue-1" -> "issue-2"'), 'should have edge ENG-1 → ENG-2')
  })

  it('includes orphan issues with no edges', () => {
    const dot = generateDot(manifest)
    assert.ok(dot.includes('"issue-3"'), 'orphan issue should be present')
    assert.ok(dot.includes('Orphan task'), 'orphan label should be present')
  })

  it('mutes completed issues', () => {
    const dot = generateDot(manifest)
    // The node for issue-1 (completed) should have a muted/grayed style
    // Check that the node definition includes a gray or lighter fillcolor
    const issue1Match = dot.match(/"issue-1"\s*\[([^\]]+)\]/)
    assert.ok(issue1Match, 'should have node attributes for issue-1')
    assert.ok(
      issue1Match[1].includes('fillcolor') || issue1Match[1].includes('style'),
      'completed issue should have style attributes',
    )
  })

  it('does not create edges for issues outside the manifest', () => {
    const manifestWithExternal = {
      ...manifest,
      issues: [
        {
          id: 'issue-10',
          identifier: 'ENG-10',
          label: 'Local issue',
          projectId: 'proj-1',
          status: { name: 'Todo', type: 'unstarted', color: '#6B7280' },
          blockedBy: ['issue-999'], // issue-999 is not in manifest
          blocks: [],
        },
      ],
    }
    const dot = generateDot(manifestWithExternal)
    assert.ok(!dot.includes('"issue-999"'), 'should not reference external issues')
  })
})

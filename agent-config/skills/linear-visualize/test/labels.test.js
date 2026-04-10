// test/labels.test.js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { makeLabel } from '../fetch-issues.js'

describe('makeLabel', () => {
  it('returns short titles unchanged', () => {
    assert.equal(makeLabel('Shopping list'), 'Shopping list')
  })

  it('truncates long titles at word boundary with ellipsis', () => {
    const long = 'This is a long example title that needs to be truncated with a word boundary ellipsis'
    const label = makeLabel(long)
    assert.ok(label.length <= 40, `label too long: ${label.length} chars`)
    assert.ok(label.endsWith('…'), `should end with ellipsis: ${label}`)
    assert.ok(!label.endsWith(' …'), `should not have trailing space before ellipsis: ${label}`)
  })

  it('strips "Done when" prefix', () => {
    assert.equal(makeLabel('Done when the feature works'), 'The feature works')
  })

  it('strips "Done when" prefix case-insensitively', () => {
    assert.equal(makeLabel('done when the API returns data'), 'The API returns data')
  })

  it('capitalizes first letter after stripping prefix', () => {
    assert.equal(makeLabel('Done when records load'), 'Records load')
  })

  it('handles empty string', () => {
    assert.equal(makeLabel(''), '')
  })

  it('handles title that is exactly 40 chars', () => {
    const exact = 'A'.repeat(40)
    assert.equal(makeLabel(exact), exact)
  })
})

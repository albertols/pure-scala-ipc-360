import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import type { ETLNode } from '../types'
import type { RecipeJson } from './recipeAdapter'
import { useValidation, nodeStatusFrom, nodeIdFromPath } from './ipcRules'

// Plain .ts (not .tsx) file per the plan's Files list — React.createElement/
// renderHook only, no JSX syntax.

const DRAFT_A: RecipeJson = { steps: [{ target: { name: 'A', type: 'table', fields: [] }, sources: [] }], table: {} }
const DRAFT_B: RecipeJson = { steps: [{ target: { name: 'B', type: 'table', fields: [] }, sources: [] }], table: {} }

let posts: RecipeJson[] = []
const server = setupServer(
  http.post('/api/recipes/validate', async ({ request }) => {
    const body = (await request.json()) as RecipeJson
    posts.push(body)
    return HttpResponse.json({ valid: true, errors: [], warnings: [], checks: [] })
  }),
)
beforeAll(() => server.listen())
afterEach(() => {
  server.resetHandlers()
  posts = []
})
afterAll(() => server.close())

describe('useValidation', () => {
  it('debounces two rapid draft changes into a single POST, carrying the LAST draft', async () => {
    const { rerender } = renderHook(
      ({ draft }: { draft: RecipeJson | null }) => useValidation(draft),
      { initialProps: { draft: null as RecipeJson | null } },
    )

    rerender({ draft: DRAFT_A })
    await new Promise(resolve => setTimeout(resolve, 50))
    rerender({ draft: DRAFT_B })

    // Comfortably past the 400ms debounce.
    await new Promise(resolve => setTimeout(resolve, 600))

    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual(DRAFT_B)
  })

  it('returns checks/errors/warnings from the settled validate response', async () => {
    server.use(
      http.post('/api/recipes/validate', () =>
        HttpResponse.json({
          valid: false,
          errors: [{ path: '$.steps[0]', message: 'bad' }],
          warnings: [],
          checks: [{ ruleId: 'IPC-STR-001', severity: 'error', status: 'fail', path: '$.steps[0]', message: 'bad' }],
        }),
      ),
    )
    const { result } = renderHook(
      ({ draft }: { draft: RecipeJson | null }) => useValidation(draft),
      { initialProps: { draft: DRAFT_A as RecipeJson | null } },
    )

    await waitFor(() => expect(result.current.errors).toHaveLength(1), { timeout: 2000 })
    expect(result.current.checks[0]!.ruleId).toBe('IPC-STR-001')
    expect(result.current.isValidating).toBe(false)
  })

  it('clears to the empty state when the draft becomes null (recipe switch)', async () => {
    const { result, rerender } = renderHook(
      ({ draft }: { draft: RecipeJson | null }) => useValidation(draft),
      { initialProps: { draft: DRAFT_A as RecipeJson | null } },
    )
    await waitFor(() => expect(posts).toHaveLength(1), { timeout: 2000 })

    rerender({ draft: null })
    expect(result.current).toEqual({ checks: [], errors: [], warnings: [], isValidating: false, failed: false })
  })

  // BLOCKER 2 (final whole-branch review): a failed validate must not settle
  // into "0 errors" — that reads as a clean recipe when conformance is
  // actually unknown. `failed: true` is the caller's (ConformanceChip's)
  // signal to render neutral rather than green.
  it('sets failed:true and clears isValidating when the validate POST rejects (500/network)', async () => {
    server.use(
      http.post('/api/recipes/validate', () => new HttpResponse(null, { status: 500 })),
    )
    const { result } = renderHook(
      ({ draft }: { draft: RecipeJson | null }) => useValidation(draft),
      { initialProps: { draft: DRAFT_A as RecipeJson | null } },
    )

    await waitFor(() => expect(result.current.failed).toBe(true), { timeout: 2000 })
    expect(result.current.isValidating).toBe(false)
    // Stale settled data from before the failure must not masquerade as a
    // fresh "0 errors" result — the failed request contributed nothing.
    expect(result.current.errors).toHaveLength(0)
    expect(result.current.warnings).toHaveLength(0)
  })
})

const NODE_A: ETLNode = { id: 'A', type: 'source', label: 'SRC', name: 'A', x: 0, y: 0, ports: [], properties: {}, file: 'x.json' }
const NODE_B: ETLNode = { id: 'B', type: 'target', label: 'TGT', name: 'B', x: 0, y: 0, ports: [], properties: {}, file: 'x.json' }
const GRAPH = { nodes: [NODE_A, NODE_B], connections: [], mappingNames: ['x'], renderedMapping: 'x' }

describe('nodeIdFromPath', () => {
  it('resolves $.steps[N]… to the Nth canvas node id', () => {
    expect(nodeIdFromPath('$.steps[1].target.name', GRAPH)).toBe('B')
    expect(nodeIdFromPath('$.steps[0].target.fields[0].transformation', GRAPH)).toBe('A')
  })

  it('degrades to undefined for a non-step path, an out-of-range index, or a null graph', () => {
    expect(nodeIdFromPath('$.table.targetTableNames', GRAPH)).toBeUndefined()
    expect(nodeIdFromPath('$.steps[9].target.name', GRAPH)).toBeUndefined()
    expect(nodeIdFromPath('$.steps[0].target.name', null)).toBeUndefined()
    expect(nodeIdFromPath(undefined, GRAPH)).toBeUndefined()
  })
})

describe('nodeStatusFrom', () => {
  it('maps $.steps[1].target.name to the second step target node id', () => {
    const status = nodeStatusFrom(
      [{ ruleId: 'IPC-STR-001', severity: 'warning', status: 'fail', path: '$.steps[1].target.name', message: 'x' }],
      GRAPH,
    )
    expect(status).toEqual({ B: 'warn' })
  })

  it('picks error over warn when a node has both', () => {
    const status = nodeStatusFrom(
      [
        { ruleId: 'IPC-STR-001', severity: 'warning', status: 'fail', path: '$.steps[0].target.name', message: 'w' },
        { ruleId: 'IPC-STR-002', severity: 'error', status: 'fail', path: '$.steps[0].target.type', message: 'e' },
      ],
      GRAPH,
    )
    expect(status).toEqual({ A: 'error' })

    // Order-independent: error arriving first must not be downgraded by a
    // later warning on the same node.
    const status2 = nodeStatusFrom(
      [
        { ruleId: 'IPC-STR-002', severity: 'error', status: 'fail', path: '$.steps[0].target.type', message: 'e' },
        { ruleId: 'IPC-STR-001', severity: 'warning', status: 'fail', path: '$.steps[0].target.name', message: 'w' },
      ],
      GRAPH,
    )
    expect(status2).toEqual({ A: 'error' })
  })

  it('ignores passing checks', () => {
    const status = nodeStatusFrom(
      [{ ruleId: 'IPC-STR-001', severity: 'error', status: 'pass', path: '$.steps[0].target.name', message: 'ok' }],
      GRAPH,
    )
    expect(status).toEqual({})
  })

  it('returns {} for an empty check list rather than throwing', () => {
    expect(nodeStatusFrom([], GRAPH)).toEqual({})
    expect(nodeStatusFrom([], null)).toEqual({})
  })
})

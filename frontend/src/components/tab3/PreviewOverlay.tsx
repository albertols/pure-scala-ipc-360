import { useEffect } from 'react'
import { useIpcRules, useMappingModel, useRecipe } from '../../api/queries'
import { recipeToCanvas, type RecipeJson } from '../../api/recipeAdapter'
import { toCanvas, type CanvasGraph } from '../../api/mappingAdapter'
import type { ApiError } from '../../api/client'
import { EtlCanvas } from '../shared/EtlCanvas'
import { CopyButton } from '../shared/CopyButton'

const EMPTY_GRAPH: CanvasGraph = {
  nodes: [],
  connections: [],
  mappingNames: [],
  renderedMapping: '',
}

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

/** Defensive per the adapter's contract: `recipeToCanvas` assumes a shaped
 * object (it dereferences `recipe.table`/`.steps` freely) — an absent or
 * malformed `content` yields the empty graph rather than a thrown render error.
 * `typeAliases` (Task 19, `GET /api/ipc/rules`'s `typeAliases` via `useIpcRules()`
 * below) resolves the same four anonymizer tokens `ETLModifier.tsx` resolves, so
 * this read-only preview — the other place in the app that renders a recipe onto a
 * canvas — never falls back to a generic `BER`/`EAR`/`ASH`/`CED` box either. */
function safeRecipeToCanvas(
  content: RecipeJson | undefined,
  recipePath: string,
  typeAliases: Record<string, string>,
): CanvasGraph {
  if (!content) return EMPTY_GRAPH
  try {
    return recipeToCanvas(content, recipePath, typeAliases)
  } catch {
    return EMPTY_GRAPH
  }
}

/**
 * Full-window read-only preview of a recipe (or, if the recipe file is
 * missing, the XML mapping model it was parsed from) on the SHARED `EtlCanvas`
 * — the same component Tabs 1/2 use, passed only its existing read-only props.
 * Unmounts entirely on close (`onClose` flips the caller's state to null): no
 * state survives here to leak into Tabs 1/2.
 */
export function PreviewOverlay({
  recipePath,
  mappingPath,
  onClose,
}: {
  recipePath: string | null
  mappingPath: string | null
  onClose: () => void
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const rec = useRecipe(recipePath ?? '')
  const recError = rec.error as ApiError | null
  const recipeMissing = recError?.status === 404

  // XML fallback (rule 3): only fetched once the recipe genuinely 404s AND a
  // mapping directory is known — never a speculative parallel fetch.
  const showXmlFallback = recipeMissing && !!mappingPath
  const model = useMappingModel(showXmlFallback ? mappingPath! : '')

  // Task 19: same catalogue `ETLModifier` threads (`staleTime: Infinity`, so once any
  // tab has loaded it this call is a cache hit). Arrives asynchronously — until it
  // does, `?? {}` is the exact same default `recipeToCanvas`'s own optional parameter
  // uses, so the canvas renders immediately with fallback labels rather than blanking
  // or throwing, then re-renders with canonical labels once the query settles.
  const ipcRules = useIpcRules()

  const content = rec.data?.content as RecipeJson | undefined
  const xmlGraph =
    showXmlFallback && model.data && mappingPath ? toCanvas(model.data, mappingPath) : null
  const graph: CanvasGraph =
    content && recipePath
      ? safeRecipeToCanvas(content, recipePath, ipcRules.data?.typeAliases ?? {})
      : (xmlGraph ?? EMPTY_GRAPH)

  const title = recipePath ? basename(recipePath) : mappingPath ? basename(mappingPath) : 'Preview'
  const rawJson = JSON.stringify(content ?? {}, null, 2)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(10,12,20,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '92vw',
          height: '88vh',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#e2e8f8',
              flex: 1,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            {title}
          </span>
          <button
            onClick={onClose}
            title="Close"
            style={{
              background: 'none',
              border: 'none',
              color: '#4a5570',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 13 13" fill="none">
              <path
                d="M2 2l9 9M11 2L2 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {showXmlFallback && (
          <div
            style={{ padding: '6px 16px', fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}
          >
            recipe missing — showing XML model
          </div>
        )}

        {/* body: read-only shared canvas + raw JSON pane */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <EtlCanvas
            nodes={graph.nodes}
            connections={graph.connections}
            selectedNode={null}
            onSelectNode={() => {}}
            highlightIds={[]}
          />
          <div
            style={{
              width: 340,
              flexShrink: 0,
              borderLeft: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 10px',
                background: 'var(--surface-2)',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 10, color: '#4a5570', flex: 1 }}>Raw JSON</span>
              <CopyButton value={rawJson} size={11} />
            </div>
            <pre
              style={{
                flex: 1,
                overflow: 'auto',
                margin: 0,
                padding: '10px 12px',
                fontSize: 10,
                color: '#c8d3e8',
                fontFamily: 'JetBrains Mono, monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                lineHeight: 1.6,
              }}
            >
              {rawJson}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}

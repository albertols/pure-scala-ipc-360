import type { XmlNode } from './queries'
import type { NodeType } from '../types'

/** Kind-appropriate DOM tag for a canvas node type; everything else lives under TRANSFORMATION. */
const TAG_FOR_TYPE: Partial<Record<NodeType, string>> = {
  source: 'SOURCE',
  target: 'TARGET',
}

/** Depth-first search for the first descendant (including `node` itself) matching tag + NAME. */
function findByTagAndName(node: XmlNode, tag: string, name: string): XmlNode | null {
  if (node.name === tag && node.attributes?.NAME === name) return node
  for (const child of node.children ?? []) {
    const found = findByTagAndName(child, tag, name)
    if (found) return found
  }
  return null
}

/**
 * Locates the lossless DOM element backing a canvas node. Searches for the
 * kind-appropriate tag (SOURCE/TARGET/TRANSFORMATION) matching
 * `attributes.NAME === nodeName`, scoped to the rendered mapping's
 * `<MAPPING NAME={mappingName}>` subtree first, then falling back to the
 * whole folder subtree — mirroring `mappingAdapter.ts`'s "nested wins" rule
 * (a non-reusable TRANSFORMATION embedded in the mapping takes priority over
 * a same-named reusable one at folder level). SOURCE/TARGET definitions
 * always live at folder level, never nested in a MAPPING, so for those tags
 * the mapping-scoped search simply misses and the whole-DOM fallback finds
 * them — harmless by design.
 *
 * If nothing matches directly, the canvas node name may be an INSTANCE alias
 * rather than the underlying definition's name — find the INSTANCE by NAME
 * and read its TRANSFORMATION_NAME to retry. INSTANCE names are only unique
 * *within* a mapping (two mappings in the same folder can each have an
 * INSTANCE named the same but pointing at different transformations), so
 * this lookup is scoped to the same `<MAPPING NAME={mappingName}>` subtree,
 * falling back to the whole folder subtree if that mapping isn't found.
 */
export function findElementForNode(
  dom: XmlNode,
  nodeName: string,
  nodeType: NodeType,
  mappingName: string,
): XmlNode | null {
  const tag = TAG_FOR_TYPE[nodeType] ?? 'TRANSFORMATION'
  const mappingScope = findByTagAndName(dom, 'MAPPING', mappingName) ?? dom

  const direct =
    findByTagAndName(mappingScope, tag, nodeName) ?? findByTagAndName(dom, tag, nodeName)
  if (direct) return direct

  const instance = findByTagAndName(mappingScope, 'INSTANCE', nodeName)
  const transformationName = instance?.attributes?.TRANSFORMATION_NAME
  if (!transformationName) return null

  return findByTagAndName(dom, tag, transformationName)
}

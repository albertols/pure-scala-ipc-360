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
 * Locates the lossless DOM element backing a canvas node. Searches the
 * folder subtree for the kind-appropriate tag (SOURCE/TARGET/TRANSFORMATION)
 * matching `attributes.NAME === nodeName`. If nothing matches directly, the
 * canvas node name may be an INSTANCE alias rather than the underlying
 * definition's name — find the INSTANCE by NAME, read its
 * TRANSFORMATION_NAME, and retry with that name.
 */
export function findElementForNode(dom: XmlNode, nodeName: string, nodeType: NodeType): XmlNode | null {
  const tag = TAG_FOR_TYPE[nodeType] ?? 'TRANSFORMATION'

  const direct = findByTagAndName(dom, tag, nodeName)
  if (direct) return direct

  const instance = findByTagAndName(dom, 'INSTANCE', nodeName)
  const transformationName = instance?.attributes?.TRANSFORMATION_NAME
  if (!transformationName) return null

  return findByTagAndName(dom, tag, transformationName)
}

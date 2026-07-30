import type { FSDir, FSFile } from '../types'
import type { TreeNode } from './queries'

export function toFilesystem(node: TreeNode): FSDir {
  return {
    name: node.name ?? '',
    layer: (node.layer ?? undefined) as FSDir['layer'],
    children: (node.children ?? []).map(child =>
      child.kind === 'dir' || child.kind === 'outputDir'
        ? toFilesystem(child)
        : toFile(child),
    ),
  }
}

function toFile(node: TreeNode): FSFile {
  return {
    name: node.name ?? '',
    path: node.path ?? '',
    type: node.kind === 'xml' ? 'xml' : 'json',
    mapping: node.mappingPath ?? undefined,
  }
}

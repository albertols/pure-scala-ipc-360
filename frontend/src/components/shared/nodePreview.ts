import type { OperationalCard as CardData } from '../../types'
import type { OperationalEdge } from '../../api/relationshipsAdapter'
import type { RelationshipGraph } from '../../api/queries'

type NodeDto = NonNullable<RelationshipGraph['nodes']>[number]

/**
 * Task 9: resolve the recipe/mapping path a card's "Open preview" affordance
 * should open. Recipe card -> its own node (`mappingPath` = recipe directory,
 * `name` = recipe filename). Table card -> the FIRST `writes` edge into it
 * (adapter edge order, i.e. graph order) -> that recipe's node. Both fields
 * null when unresolvable (e.g. a source-only table, or a recipe absent from
 * the corpus) — the caller disables the affordance in that case.
 */
export function resolvePreview(
  card: CardData,
  edges: OperationalEdge[],
  nodeById: Map<string, NodeDto>,
): { recipePath: string | null; mappingPath: string | null } {
  const recipeId =
    card.kind === 'recipe'
      ? card.id
      : edges.find(e => e.kind === 'writes' && e.toId === card.id)?.fromId
  const node = recipeId ? nodeById.get(recipeId) : undefined
  const mappingPath = node?.mappingPath ?? null
  const name = node?.name ?? null
  if (!mappingPath || !name) return { recipePath: null, mappingPath }
  return { recipePath: `${mappingPath}/${name}`, mappingPath }
}

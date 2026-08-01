import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client'
import type { components } from './types.gen'

export type TreeNode = components['schemas']['TreeNodeDto']
export type XmlNode = components['schemas']['XmlNodeDto']
export type MappingModel = components['schemas']['MappingModelDto']
export type RecipeFile = components['schemas']['RecipeDto']
export type RecipeValidation = components['schemas']['RecipeValidationDto']
export type RecipeValidationError = components['schemas']['RecipeValidationErrorDto']
// Hand alias: the `RecipeHistoryEntryDto` schema IS present in the generated
// components (Task 8's regen captured it), but the two Spring mappings sharing
// `/api/recipes/history/{*path}` (params=!version vs params=version, Task 7)
// collapse to a single OpenAPI path item, so only one `operations[...]` entry
// (`historyVersion_1`, the `?version=` shape) survived codegen — the no-version
// list shape has no captured operation. `apiGet<T>` doesn't consult `operations`
// anyway (see `useDdl` above), so aliasing the schema directly is sufficient;
// no operation lookup needed.
export type RecipeHistoryEntry = components['schemas']['RecipeHistoryEntryDto']
export type ExpressionEntry = components['schemas']['ExpressionEntryDto']
export type AppConfig = components['schemas']['AppConfigDto']

const STALE_MS = 30_000

export const useTree = () =>
  useQuery({ queryKey: ['tree'], queryFn: () => apiGet<TreeNode>('/tree'), staleTime: STALE_MS })

export const useMappingDom = (path: string) =>
  useQuery({ queryKey: ['dom', path], queryFn: () => apiGet<XmlNode>(`/mappings/dom/${path}`), staleTime: STALE_MS, enabled: !!path })

export const useMappingModel = (path: string) =>
  useQuery({ queryKey: ['model', path], queryFn: () => apiGet<MappingModel>(`/mappings/model/${path}`), staleTime: STALE_MS, enabled: !!path })

export const useRecipe = (path: string) =>
  useQuery({ queryKey: ['recipe', path], queryFn: () => apiGet<RecipeFile>(`/recipes/${path}`), staleTime: STALE_MS, enabled: !!path })

export const useDdl = (path: string) =>
  useQuery({ queryKey: ['ddl', path], queryFn: () => apiGet<Record<string, unknown>>(`/ddl/${path}`), staleTime: STALE_MS, enabled: !!path })

export const useExpressions = () =>
  useQuery({ queryKey: ['expressions'], queryFn: () => apiGet<ExpressionEntry[]>('/expressions'), staleTime: STALE_MS })

export const useAppConfig = () =>
  useQuery({ queryKey: ['config'], queryFn: () => apiGet<AppConfig>('/config'), staleTime: Infinity })

// Task 16: static corpus counts (xml/recipe/ddl/dir totals, layers) for the
// view-aware corpus summary Tabs 1/2/4 dock into their left rail (spec §7.1).
export type Summary = components['schemas']['SummaryDto']

export const useSummary = () =>
  useQuery({ queryKey: ['summary'], queryFn: () => apiGet<Summary>('/summary'), staleTime: STALE_MS })

export type RelationshipGraph = components['schemas']['RelationshipsDto']
export type OperationalSnapshot = components['schemas']['OperationalSnapshotDto']
export type B15Row = components['schemas']['B15RowDto']
export type OperationalDates = components['schemas']['OperationalDatesDto']
export type OperationalSummary = components['schemas']['OperationalSummaryDto']

export const useRelationships = () =>
  useQuery({ queryKey: ['relationships'], queryFn: () => apiGet<RelationshipGraph>('/relationships'), staleTime: STALE_MS })

export const useOperationalDates = () =>
  useQuery({ queryKey: ['operationalDates'], queryFn: () => apiGet<OperationalDates>('/operational/dates'), staleTime: STALE_MS })

export const useOperational = (date: string) =>
  useQuery({ queryKey: ['operational', date], queryFn: () => apiGet<OperationalSnapshot>(`/operational/${date}`), staleTime: STALE_MS, enabled: !!date })

export const useOperationalSummary = () =>
  useQuery({ queryKey: ['operationalSummary'], queryFn: () => apiGet<OperationalSummary>('/operational/summary'), staleTime: STALE_MS })

export type IpcRules = components['schemas']['IpcRulesDto']
export type IpcRuleMeta = components['schemas']['IpcRuleMetaDto']
export type IpcKeySpec = components['schemas']['IpcKeySpecDto']
export type IpcCheck = components['schemas']['IpcCheckDto']
// Task 9: the connection adjacency matrix Task 8 authored, served through GET /api/ipc/rules
// so the frontend holds no second copy of the recipe grammar — the same principle keySchema
// follows. `active` classifies the kind's IPC active/passive-transformation status (nullable —
// null means "cannot be determined") for the fan-in rule (spec §6.2).
export type IpcConnections = IpcRules['connections']

export const useIpcRules = () =>
  useQuery({ queryKey: ['ipcRules'], queryFn: () => apiGet<IpcRules>('/ipc/rules'), staleTime: Infinity })

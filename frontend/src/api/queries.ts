import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client'
import type { components } from './types.gen'

export type TreeNode = components['schemas']['TreeNodeDto']
export type XmlNode = components['schemas']['XmlNodeDto']
export type MappingModel = components['schemas']['MappingModelDto']
export type RecipeFile = components['schemas']['RecipeDto']
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

export type RelationshipGraph = components['schemas']['RelationshipsDto']
export type OperationalSnapshot = components['schemas']['OperationalSnapshotDto']
export type B15Row = components['schemas']['B15RowDto']
export type OperationalDates = components['schemas']['OperationalDatesDto']

export const useRelationships = () =>
  useQuery({ queryKey: ['relationships'], queryFn: () => apiGet<RelationshipGraph>('/relationships'), staleTime: STALE_MS })

export const useOperationalDates = () =>
  useQuery({ queryKey: ['operationalDates'], queryFn: () => apiGet<OperationalDates>('/operational/dates'), staleTime: STALE_MS })

export const useOperational = (date: string) =>
  useQuery({ queryKey: ['operational', date], queryFn: () => apiGet<OperationalSnapshot>(`/operational/${date}`), staleTime: STALE_MS, enabled: !!date })

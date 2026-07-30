import { useMemo } from 'react'
import { useTree } from '../../api/queries'
import { toFilesystem } from '../../api/filesystemAdapter'
import type { ApiError } from '../../api/client'
import type { FSDir } from '../../types'

export function useFilesystem(): { fs: FSDir | null; loading: boolean; error: ApiError | null } {
  const { data, isLoading, error } = useTree()
  const fs = useMemo(() => (data ? toFilesystem(data) : null), [data])
  return { fs, loading: isLoading, error: (error as ApiError | null) ?? null }
}

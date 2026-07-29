export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail?: string,
  ) {
    super(detail ?? title)
    this.name = 'ApiError'
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`)
  if (!res.ok) {
    let problem: { title?: string; detail?: string } = {}
    try { problem = await res.json() } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, problem.title ?? res.statusText, problem.detail)
  }
  return res.json() as Promise<T>
}

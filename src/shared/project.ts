// ── 项目类型 ──

export interface Project {
  id: string
  name: string
  path: string
}

// ── 项目校验 ──

export function validateProject(data: any): Project | null {
  if (!data || typeof data !== 'object') return null
  if (typeof data.id !== 'string' || data.id.length === 0 || data.id.length > 100) return null
  if (typeof data.name !== 'string' || data.name.length === 0 || data.name.length > 200) return null
  if (typeof data.path !== 'string' || data.path.length === 0 || data.path.length > 2000) return null
  return {
    id: data.id,
    name: data.name,
    path: data.path
  }
}

export function validateProjectList(data: any): Project[] {
  if (!Array.isArray(data)) return []
  return data
    .map(validateProject)
    .filter((p): p is Project => p !== null)
}

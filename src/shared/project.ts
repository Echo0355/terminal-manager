/**
 * 项目模块
 *
 * 负责项目数据的类型定义和校验。
 * 项目代表用户收藏的常用目录，可快速在新标签或分屏中打开。
 * 项目列表持久化存储在用户数据目录的 projects.json 文件中。
 */

// ── 项目类型 ──

/**
 * 项目数据接口
 *
 * 表示一个用户收藏的项目目录。
 * 项目以目录路径为唯一标识，名称自动取自目录名。
 */
export interface Project {
  /** 项目唯一标识符，格式为 'proj_<timestamp>_<random>' */
  id: string
  /** 项目显示名称，通常为目录名 */
  name: string
  /** 项目的绝对路径 */
  path: string
}

// ── 项目校验 ──

/**
 * 校验并规范化单个项目数据
 *
 * 对输入数据进行严格校验，确保所有字段类型正确且在长度限制内。
 * 用于防止恶意或损坏的项目数据导致应用异常。
 *
 * @param data - 待校验的原始数据（可能来自 JSON 文件或 IPC 消息）
 * @returns 校验后的项目对象，如果数据无效则返回 null
 */
export function validateProject(data: any): Project | null {
  // 输入必须是非 null 对象
  if (!data || typeof data !== 'object') return null

  // id：必须是非空字符串，长度 1-100
  if (typeof data.id !== 'string' || data.id.length === 0 || data.id.length > 100) return null

  // name：必须是非空字符串，长度 1-200
  if (typeof data.name !== 'string' || data.name.length === 0 || data.name.length > 200) return null

  // path：必须是非空字符串，长度 1-2000
  if (typeof data.path !== 'string' || data.path.length === 0 || data.path.length > 2000) return null

  return {
    id: data.id,
    name: data.name,
    path: data.path
  }
}

/**
 * 校验项目列表数据
 *
 * 对数组中的每个元素进行校验，过滤掉无效项目。
 * 用于加载项目列表时确保数据完整性。
 *
 * @param data - 待校验的原始数组数据
 * @returns 校验后的项目数组，无效元素被过滤掉
 */
export function validateProjectList(data: any): Project[] {
  // 输入必须是数组
  if (!Array.isArray(data)) return []

  return data
    .map(validateProject)
    .filter((p): p is Project => p !== null)
}

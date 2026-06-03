/**
 * 外部 IDE 启动服务
 *
 * 根据当前平台构造安全的编辑器启动命令，用于从终端面板打开工作目录。
 */

import { execFileSync, spawn } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { win32 } from 'path'

export type ExternalEditor = 'vscode' | 'idea' | 'pycharm'

interface LaunchCommand {
  command: string
  args: string[]
  shell?: boolean
  waitForExit?: boolean
}

type LaunchCommandTemplate = Omit<LaunchCommand, 'args'>

interface CommandBuildOptions {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  exists?: (path: string) => boolean
  readDir?: (path: string) => string[]
  readRegistry?: (key: string) => string | null
  readRegistrySubKeys?: (root: string) => string[]
}

const EDITOR_LABELS: Record<ExternalEditor, string> = {
  vscode: 'VS Code',
  idea: 'IntelliJ IDEA',
  pycharm: 'PyCharm'
}

const launchCommandCache = new Map<ExternalEditor, LaunchCommandTemplate>()

const WINDOWS_UNINSTALL_REGISTRY_ROOTS = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
]

const VSCODE_UNINSTALL_REGISTRY_KEYS = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Microsoft Visual Studio Code',
  'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Microsoft Visual Studio Code',
  'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Microsoft Visual Studio Code',
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{771FD6B0-FA20-440A-A002-3B3BAC16DC50}_is1',
  'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{EA457B21-F73E-494C-ACAB-524FDE069978}_is1',
  'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{EA457B21-F73E-494C-ACAB-524FDE069978}_is1',
  'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{D628A17A-9713-46B5-A44A-CB7105384B00}_is1',
  'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{D628A17A-9713-46B5-A44A-CB7105384B00}_is1'
]

/**
 * 获取编辑器显示名称
 *
 * @param editor - 编辑器标识
 * @returns 显示名称
 */
export function getEditorLabel(editor: ExternalEditor): string {
  return EDITOR_LABELS[editor]
}

/**
 * 判断是否为允许启动的编辑器
 *
 * @param value - 待校验的编辑器标识
 * @returns 是否为支持的编辑器
 */
export function isExternalEditor(value: unknown): value is ExternalEditor {
  return value === 'vscode' || value === 'idea' || value === 'pycharm'
}

/**
 * 构造当前平台的编辑器启动命令候选列表
 *
 * @param editor - 编辑器标识
 * @param folderPath - 要打开的目录
 * @param options - 测试注入选项
 * @returns 命令候选列表，按优先级排序
 */
export function buildEditorLaunchCommands(
  editor: ExternalEditor,
  folderPath: string,
  options: CommandBuildOptions = {}
): LaunchCommand[] {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const exists = options.exists ?? existsSync
  const readDir = options.readDir ?? ((path: string) => readdirSync(path))
  const readRegistry = options.readRegistry ?? readWindowsRegistryKey
  const readRegistrySubKeys = options.readRegistrySubKeys ?? readWindowsRegistrySubKeys

  if (platform === 'darwin') {
    return buildDarwinCommands(editor, folderPath)
  }

  if (platform === 'win32') {
    return buildWindowsCommands(
      editor,
      folderPath,
      env,
      exists,
      readDir,
      readRegistry,
      readRegistrySubKeys
    )
  }

  return buildLinuxCommands(editor, folderPath)
}

/**
 * 启动外部编辑器打开目录
 *
 * @param editor - 编辑器标识
 * @param folderPath - 要打开的目录
 * @returns 启动结果
 */
export async function openFolderInEditor(
  editor: ExternalEditor,
  folderPath: string
): Promise<{ success: boolean; error?: string }> {
  const cachedCommand = launchCommandCache.get(editor)
  if (cachedCommand) {
    const launched = await tryLaunch(applyFolderPath(cachedCommand, folderPath))
    if (launched) {
      return { success: true }
    }

    launchCommandCache.delete(editor)
  }

  const commands = buildEditorLaunchCommands(editor, folderPath)

  for (const command of commands) {
    const launched = await tryLaunch(command)
    if (launched) {
      launchCommandCache.set(editor, toLaunchCommandTemplate(command))
      return { success: true }
    }
  }

  return {
    success: false,
    error: `未找到 ${getEditorLabel(editor)}，请确认已安装并配置命令行启动器`
  }
}

function buildDarwinCommands(editor: ExternalEditor, folderPath: string): LaunchCommand[] {
  const appNames: Record<ExternalEditor, string[]> = {
    vscode: ['Visual Studio Code'],
    idea: ['IntelliJ IDEA'],
    pycharm: ['PyCharm']
  }

  return appNames[editor].map((appName) => ({
    command: 'open',
    args: ['-a', appName, folderPath],
    waitForExit: true
  }))
}

function buildLinuxCommands(editor: ExternalEditor, folderPath: string): LaunchCommand[] {
  const commands: Record<ExternalEditor, string[]> = {
    vscode: ['code'],
    idea: ['idea', 'intellij-idea-ultimate', 'intellij-idea-community'],
    pycharm: ['pycharm', 'pycharm-professional', 'pycharm-community']
  }

  return commands[editor].map((command) => ({
    command,
    args: [folderPath]
  }))
}

function buildWindowsCommands(
  editor: ExternalEditor,
  folderPath: string,
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean,
  readDir: (path: string) => string[],
  readRegistry: (key: string) => string | null,
  readRegistrySubKeys: (root: string) => string[]
): LaunchCommand[] {
  if (editor === 'vscode') {
    return firstAvailableCommands([
      () =>
        existingExecutables([
          env.LOCALAPPDATA ? win32.join(env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe') : '',
          env.ProgramFiles ? win32.join(env.ProgramFiles, 'Microsoft VS Code', 'Code.exe') : '',
          env['ProgramFiles(x86)'] ? win32.join(env['ProgramFiles(x86)'], 'Microsoft VS Code', 'Code.exe') : ''
        ], folderPath, exists),
      () => findVsCodePathExecutables(folderPath, env, exists),
      () => findVsCodeRegistryExecutables(folderPath, exists, readRegistry)
    ])
  }

  if (editor === 'idea') {
    return firstAvailableCommands([
      () => findJetBrainsExecutables(['IntelliJ IDEA'], 'idea64.exe', folderPath, env, exists, readDir),
      () => findJetBrainsToolboxExecutables(['IDEA-U', 'IDEA-C'], 'idea64.exe', folderPath, env, exists, readDir),
      () => findWindowsPathCommands(['idea64.exe'], folderPath, env, exists),
      () => findJetBrainsRegistryExecutables(['IntelliJ IDEA'], 'idea64.exe', folderPath, exists, readRegistry, readRegistrySubKeys)
    ])
  }

  return firstAvailableCommands([
    () => findJetBrainsExecutables(['PyCharm'], 'pycharm64.exe', folderPath, env, exists, readDir),
    () => findJetBrainsToolboxExecutables(['PyCharm-P', 'PyCharm-C'], 'pycharm64.exe', folderPath, env, exists, readDir),
    () => findWindowsPathCommands(['pycharm64.exe'], folderPath, env, exists),
    () => findJetBrainsRegistryExecutables(['PyCharm'], 'pycharm64.exe', folderPath, exists, readRegistry, readRegistrySubKeys)
  ])
}

function firstAvailableCommands(commandBuilders: Array<() => LaunchCommand[]>): LaunchCommand[] {
  for (const buildCommands of commandBuilders) {
    const commands = uniqueLaunchCommands(buildCommands())
    if (commands.length > 0) return commands
  }

  return []
}

function toLaunchCommandTemplate(command: LaunchCommand): LaunchCommandTemplate {
  return {
    command: command.command,
    shell: command.shell,
    waitForExit: command.waitForExit
  }
}

function applyFolderPath(command: LaunchCommandTemplate, folderPath: string): LaunchCommand {
  return {
    ...command,
    args: [folderPath]
  }
}

function readWindowsRegistryKey(key: string): string | null {
  try {
    return execFileSync('reg', ['query', key], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    })
  } catch {
    return null
  }
}

function readWindowsRegistrySubKeys(root: string): string[] {
  try {
    const output = execFileSync('reg', ['query', root], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    })

    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.toLowerCase().startsWith('hkey_') && line.toLowerCase() !== root.toLowerCase())
  } catch {
    return []
  }
}

function findVsCodeRegistryExecutables(
  folderPath: string,
  exists: (path: string) => boolean,
  readRegistry: (key: string) => string | null
): LaunchCommand[] {
  const executablePaths: string[] = []

  for (const key of VSCODE_UNINSTALL_REGISTRY_KEYS) {
    const registryOutput = readRegistry(key)
    if (!registryOutput) continue

    const installLocation = readRegistryStringValue(registryOutput, 'InstallLocation')
    if (installLocation) {
      executablePaths.push(win32.join(trimTrailingPathSeparators(installLocation), 'Code.exe'))
    }

    const displayIcon = readRegistryStringValue(registryOutput, 'DisplayIcon')
    const displayIconPath = displayIcon ? extractWindowsExecutablePath(displayIcon) : null
    if (displayIconPath && win32.basename(displayIconPath).toLowerCase() === 'code.exe') {
      executablePaths.push(displayIconPath)
    }

    const uninstallString = readRegistryStringValue(registryOutput, 'UninstallString')
    const uninstallerPath = uninstallString ? extractWindowsExecutablePath(uninstallString) : null
    if (uninstallerPath) {
      executablePaths.push(win32.join(win32.dirname(uninstallerPath), 'Code.exe'))
    }
  }

  return existingExecutables(uniquePaths(executablePaths), folderPath, exists)
}

function findVsCodePathExecutables(
  folderPath: string,
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean
): LaunchCommand[] {
  const executablePaths: string[] = []

  for (const pathEntry of getWindowsPathEntries(env)) {
    // VS Code 自定义安装目录通常把 <安装目录>\bin 放入 PATH，这里反推出真正的 Code.exe。
    executablePaths.push(win32.join(pathEntry, 'Code.exe'))
    executablePaths.push(win32.join(pathEntry, '..', 'Code.exe'))
  }

  return existingExecutables(uniquePaths(executablePaths), folderPath, exists)
}

function findJetBrainsToolboxExecutables(
  productCodes: string[],
  executableName: string,
  folderPath: string,
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean,
  readDir: (path: string) => string[]
): LaunchCommand[] {
  const toolboxAppsRoot = env.LOCALAPPDATA
    ? win32.join(env.LOCALAPPDATA, 'JetBrains', 'Toolbox', 'apps')
    : ''
  if (!toolboxAppsRoot || !exists(toolboxAppsRoot)) return []

  const executablePaths: string[] = []
  for (const productCode of productCodes) {
    const productRoot = win32.join(toolboxAppsRoot, productCode)
    if (!exists(productRoot)) continue

    let channels: string[]
    try {
      channels = readDir(productRoot)
    } catch {
      continue
    }

    for (const channel of channels) {
      const channelRoot = win32.join(productRoot, channel)
      if (!exists(channelRoot)) continue

      let builds: string[]
      try {
        builds = readDir(channelRoot)
      } catch {
        continue
      }

      for (const build of builds) {
        executablePaths.push(win32.join(channelRoot, build, 'bin', executableName))
      }
    }
  }

  return existingExecutables(executablePaths.sort().reverse(), folderPath, exists)
}

function findJetBrainsRegistryExecutables(
  productPrefixes: string[],
  executableName: string,
  folderPath: string,
  exists: (path: string) => boolean,
  readRegistry: (key: string) => string | null,
  readRegistrySubKeys: (root: string) => string[]
): LaunchCommand[] {
  const executablePaths: string[] = []

  for (const root of WINDOWS_UNINSTALL_REGISTRY_ROOTS) {
    for (const key of readRegistrySubKeys(root)) {
      const registryOutput = readRegistry(key)
      if (!registryOutput) continue

      const displayName = readRegistryStringValue(registryOutput, 'DisplayName')
      if (!displayName || !productPrefixes.some((prefix) => displayName.startsWith(prefix))) {
        continue
      }

      const installLocation = readRegistryStringValue(registryOutput, 'InstallLocation')
      if (installLocation) {
        executablePaths.push(
          win32.join(trimTrailingPathSeparators(installLocation), 'bin', executableName)
        )
      }

      const displayIcon = readRegistryStringValue(registryOutput, 'DisplayIcon')
      const displayIconPath = displayIcon ? extractWindowsExecutablePath(displayIcon) : null
      if (displayIconPath && win32.basename(displayIconPath).toLowerCase() === executableName) {
        executablePaths.push(displayIconPath)
      }

      const uninstallString = readRegistryStringValue(registryOutput, 'UninstallString')
      const uninstallerPath = uninstallString ? extractWindowsExecutablePath(uninstallString) : null
      if (uninstallerPath) {
        executablePaths.push(win32.join(win32.dirname(uninstallerPath), executableName))
      }
    }
  }

  return existingExecutables(executablePaths.sort().reverse(), folderPath, exists)
}

function findWindowsPathCommands(
  commandNames: string[],
  folderPath: string,
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean
): LaunchCommand[] {
  const commands: LaunchCommand[] = []

  for (const pathEntry of getWindowsPathEntries(env)) {
    for (const commandName of commandNames) {
      const commandPath = win32.join(pathEntry, commandName)
      if (!exists(commandPath)) continue
      commands.push({
        command: commandPath,
        args: [folderPath],
        shell: commandName.toLowerCase().endsWith('.cmd'),
        waitForExit: commandName.toLowerCase().endsWith('.cmd')
      })
    }
  }

  return commands
}

function getWindowsPathEntries(env: NodeJS.ProcessEnv): string[] {
  const pathValue = env.Path || env.PATH || ''
  return pathValue
    .split(';')
    .map((pathEntry) => pathEntry.trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
}

function existingExecutables(
  executablePaths: string[],
  folderPath: string,
  exists: (path: string) => boolean
): LaunchCommand[] {
  return uniquePaths(executablePaths)
    .filter((executablePath) => executablePath && exists(executablePath))
    .map((command) => ({ command, args: [folderPath] }))
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const path of paths) {
    if (!path) continue
    const normalized = win32.normalize(path)
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }

  return result
}

function uniqueLaunchCommands(commands: LaunchCommand[]): LaunchCommand[] {
  const seen = new Set<string>()
  const result: LaunchCommand[] = []

  for (const command of commands) {
    const key = [
      win32.normalize(command.command).toLowerCase(),
      command.args.join('\0'),
      command.shell ? 'shell' : 'direct',
      command.waitForExit ? 'wait' : 'nowait'
    ].join('\0')
    if (seen.has(key)) continue
    seen.add(key)
    result.push(command)
  }

  return result
}

function readRegistryStringValue(registryOutput: string, name: string): string | null {
  const expectedName = name.toLowerCase()

  for (const line of registryOutput.split(/\r?\n/)) {
    const trimmed = line.trim()
    const parts = trimmed.split(/\s{2,}/)
    if (parts.length < 3 || parts[0].toLowerCase() !== expectedName) continue
    return parts.slice(2).join('  ').trim() || null
  }

  return null
}

function extractWindowsExecutablePath(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('"')) {
    const endQuote = trimmed.indexOf('"', 1)
    return endQuote > 1 ? trimmed.slice(1, endQuote) : null
  }

  const exeIndex = trimmed.toLowerCase().indexOf('.exe')
  if (exeIndex === -1) return null
  return trimmed.slice(0, exeIndex + 4).trim()
}

function trimTrailingPathSeparators(path: string): string {
  return path.replace(/[\\/]+$/, '')
}

function findJetBrainsExecutables(
  productPrefixes: string[],
  executableName: string,
  folderPath: string,
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean,
  readDir: (path: string) => string[]
): LaunchCommand[] {
  const roots = [
    env.ProgramFiles ? win32.join(env.ProgramFiles, 'JetBrains') : '',
    env.LOCALAPPDATA ? win32.join(env.LOCALAPPDATA, 'Programs', 'JetBrains') : ''
  ].filter(Boolean)

  const candidates: string[] = []
  for (const root of roots) {
    if (!exists(root)) continue

    let entries: string[]
    try {
      entries = readDir(root)
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!productPrefixes.some((prefix) => entry.startsWith(prefix))) continue
      candidates.push(win32.join(root, entry, 'bin', executableName))
    }
  }

  return existingExecutables(candidates.sort().reverse(), folderPath, exists)
}

function tryLaunch(command: LaunchCommand): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    let exitTimer: NodeJS.Timeout | null = null

    const child = spawn(command.command, command.args, {
      detached: true,
      stdio: 'ignore',
      shell: command.shell
    })

    child.once('error', () => {
      if (settled) return
      settled = true
      if (exitTimer) clearTimeout(exitTimer)
      resolve(false)
    })

    child.once('exit', (code) => {
      if (!command.waitForExit || settled) return
      settled = true
      if (exitTimer) clearTimeout(exitTimer)
      resolve(code === 0)
    })

    child.once('spawn', () => {
      if (settled) return
      child.unref()

      if (command.waitForExit) {
        // 部分启动器会保持前台进程；超过短暂窗口后视为已成功交给外部应用。
        exitTimer = setTimeout(() => {
          if (settled) return
          settled = true
          resolve(true)
        }, 2000)
        return
      }

      settled = true
      resolve(true)
    })
  })
}

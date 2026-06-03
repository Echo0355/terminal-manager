/**
 * 外部 IDE 启动服务
 *
 * 根据当前平台构造安全的编辑器启动命令，用于从终端面板打开工作目录。
 */

import { spawn } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { win32 } from 'path'

export type ExternalEditor = 'vscode' | 'idea' | 'pycharm'

interface LaunchCommand {
  command: string
  args: string[]
  shell?: boolean
  waitForExit?: boolean
}

interface CommandBuildOptions {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  exists?: (path: string) => boolean
  readDir?: (path: string) => string[]
}

const EDITOR_LABELS: Record<ExternalEditor, string> = {
  vscode: 'VS Code',
  idea: 'IntelliJ IDEA',
  pycharm: 'PyCharm'
}

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

  if (platform === 'darwin') {
    return buildDarwinCommands(editor, folderPath)
  }

  if (platform === 'win32') {
    return buildWindowsCommands(editor, folderPath, env, exists, readDir)
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
  const commands = buildEditorLaunchCommands(editor, folderPath)

  for (const command of commands) {
    const launched = await tryLaunch(command)
    if (launched) {
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
  readDir: (path: string) => string[]
): LaunchCommand[] {
  const commands: LaunchCommand[] = []

  if (editor === 'vscode') {
    commands.push(
      ...existingExecutables([
        env.LOCALAPPDATA ? win32.join(env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe') : '',
        env.ProgramFiles ? win32.join(env.ProgramFiles, 'Microsoft VS Code', 'Code.exe') : '',
        env['ProgramFiles(x86)'] ? win32.join(env['ProgramFiles(x86)'], 'Microsoft VS Code', 'Code.exe') : ''
      ], folderPath, exists),
      ...findWindowsPathCommands(['code.cmd', 'code.exe'], folderPath, env, exists)
    )
  } else if (editor === 'idea') {
    commands.push(
      ...findJetBrainsExecutables(['IntelliJ IDEA'], 'idea64.exe', folderPath, env, exists, readDir),
      ...findWindowsPathCommands(['idea64.exe', 'idea.cmd', 'idea.exe'], folderPath, env, exists)
    )
  } else {
    commands.push(
      ...findJetBrainsExecutables(['PyCharm'], 'pycharm64.exe', folderPath, env, exists, readDir),
      ...findWindowsPathCommands(['pycharm64.exe', 'pycharm.cmd', 'pycharm.exe'], folderPath, env, exists)
    )
  }

  return commands
}

function findWindowsPathCommands(
  commandNames: string[],
  folderPath: string,
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean
): LaunchCommand[] {
  const pathValue = env.Path || env.PATH || ''
  const pathEntries = pathValue.split(';').filter(Boolean)
  const commands: LaunchCommand[] = []

  for (const pathEntry of pathEntries) {
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

function existingExecutables(
  executablePaths: string[],
  folderPath: string,
  exists: (path: string) => boolean
): LaunchCommand[] {
  return executablePaths
    .filter((executablePath) => executablePath && exists(executablePath))
    .map((command) => ({ command, args: [folderPath] }))
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

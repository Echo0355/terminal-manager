/**
 * 外部 IDE 启动服务测试
 *
 * 覆盖不同平台的命令构造、Windows 常见安装目录探测和编辑器白名单校验。
 */

import { describe, expect, it } from 'vitest'
import {
  buildEditorLaunchCommands,
  getEditorLabel,
  isExternalEditor
} from './editor-launcher.service'

describe('isExternalEditor', () => {
  it('允许受支持的编辑器标识', () => {
    expect(isExternalEditor('vscode')).toBe(true)
    expect(isExternalEditor('idea')).toBe(true)
    expect(isExternalEditor('pycharm')).toBe(true)
  })

  it('拒绝未知编辑器标识', () => {
    expect(isExternalEditor('vim')).toBe(false)
    expect(isExternalEditor('')).toBe(false)
    expect(isExternalEditor(undefined)).toBe(false)
  })
})

describe('getEditorLabel', () => {
  it('返回中文提示可用的编辑器名称', () => {
    expect(getEditorLabel('vscode')).toBe('VS Code')
    expect(getEditorLabel('idea')).toBe('IntelliJ IDEA')
    expect(getEditorLabel('pycharm')).toBe('PyCharm')
  })
})

describe('buildEditorLaunchCommands', () => {
  it('macOS 使用 open -a 启动应用', () => {
    expect(buildEditorLaunchCommands('vscode', '/workspace/demo', { platform: 'darwin' })).toEqual([
      { command: 'open', args: ['-a', 'Visual Studio Code', '/workspace/demo'], waitForExit: true }
    ])
  })

  it('Linux 使用常见命令行启动器', () => {
    expect(buildEditorLaunchCommands('pycharm', '/workspace/demo', { platform: 'linux' })).toEqual([
      { command: 'pycharm', args: ['/workspace/demo'] },
      { command: 'pycharm-professional', args: ['/workspace/demo'] },
      { command: 'pycharm-community', args: ['/workspace/demo'] }
    ])
  })

  it('Windows 优先使用 VS Code 常见安装路径', () => {
    const codePath = 'C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe'
    const commands = buildEditorLaunchCommands('vscode', 'C:\\work\\demo', {
      platform: 'win32',
      env: {
        LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
        ProgramFiles: 'C:\\Program Files',
        Path: 'C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\bin'
      },
      exists: (path) => {
        return [
          codePath,
          'C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd'
        ].includes(path)
      },
      readRegistry: () => {
        throw new Error('should not query registry after common install path is found')
      }
    })

    expect(commands[0]).toEqual({ command: codePath, args: ['C:\\work\\demo'] })
    expect(commands).toHaveLength(1)
  })

  it('Windows 使用注册表中的 VS Code 自定义安装目录', () => {
    const codePath = 'D:\\Apps\\Microsoft VS Code\\Code.exe'
    const cursorCodeCmd = 'D:\\cursor\\resources\\app\\bin\\code.cmd'
    const commands = buildEditorLaunchCommands('vscode', 'C:\\work\\demo', {
      platform: 'win32',
      env: {
        Path: 'D:\\cursor\\resources\\app\\bin'
      },
      exists: (path) => [codePath, cursorCodeCmd].includes(path),
      readRegistry: (key) => {
        if (!key.includes('{771FD6B0-FA20-440A-A002-3B3BAC16DC50}')) return null
        return [
          'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{771FD6B0-FA20-440A-A002-3B3BAC16DC50}_is1',
          '    DisplayName    REG_SZ    Microsoft Visual Studio Code',
          '    InstallLocation    REG_SZ    D:\\Apps\\Microsoft VS Code\\',
          '    DisplayIcon    REG_SZ    D:\\Apps\\Microsoft VS Code\\Code.exe,0'
        ].join('\r\n')
      }
    })

    expect(commands[0]).toEqual({ command: codePath, args: ['C:\\work\\demo'] })
    expect(commands.map((command) => command.command)).not.toContain(cursorCodeCmd)
  })

  it('Windows 从 PATH 中的 VS Code bin 目录反推 Code.exe', () => {
    const codePath = 'D:\\Visual Studio Code\\Microsoft VS Code\\Code.exe'
    const cursorCodeCmd = 'D:\\cursor\\resources\\app\\bin\\code.cmd'
    const commands = buildEditorLaunchCommands('vscode', 'C:\\work\\demo', {
      platform: 'win32',
      env: {
        Path: 'D:\\cursor\\resources\\app\\bin;D:\\Visual Studio Code\\Microsoft VS Code\\bin'
      },
      exists: (path) => [codePath, cursorCodeCmd].includes(path),
      readRegistry: () => {
        throw new Error('should not query registry after PATH-derived Code.exe is found')
      }
    })

    expect(commands[0]).toEqual({ command: codePath, args: ['C:\\work\\demo'] })
    expect(commands.map((command) => command.command)).not.toContain(cursorCodeCmd)
  })

  it('Windows 探测 JetBrains 安装目录并优先使用较新的目录名', () => {
    const commands = buildEditorLaunchCommands('idea', 'C:\\work\\demo', {
      platform: 'win32',
      env: {
        ProgramFiles: 'C:\\Program Files'
      },
      exists: (path) => {
        return [
          'C:\\Program Files\\JetBrains',
          'C:\\Program Files\\JetBrains\\IntelliJ IDEA 2024.1\\bin\\idea64.exe',
          'C:\\Program Files\\JetBrains\\IntelliJ IDEA 2025.2\\bin\\idea64.exe'
        ].includes(path)
      },
      readDir: () => ['IntelliJ IDEA 2024.1', 'IntelliJ IDEA 2025.2', 'PyCharm 2025.1'],
      readRegistrySubKeys: () => {
        throw new Error('should not query registry after JetBrains install path is found')
      }
    })

    expect(commands[0]).toEqual({
      command: 'C:\\Program Files\\JetBrains\\IntelliJ IDEA 2025.2\\bin\\idea64.exe',
      args: ['C:\\work\\demo']
    })
  })

  it('Windows 使用注册表中的 IntelliJ IDEA 自定义安装目录', () => {
    const ideaPath = 'D:\\JetBrains\\IntelliJ IDEA 2026.1\\bin\\idea64.exe'
    const oldIdeaCmd = 'D:\\old-tools\\idea.cmd'
    const registryKey =
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\IntelliJ IDEA 2026.1'
    const commands = buildEditorLaunchCommands('idea', 'C:\\work\\demo', {
      platform: 'win32',
      env: {
        Path: 'D:\\old-tools'
      },
      exists: (path) => [ideaPath, oldIdeaCmd].includes(path),
      readDir: () => [],
      readRegistrySubKeys: () => [registryKey],
      readRegistry: (key) => {
        if (key !== registryKey) return null
        return [
          registryKey,
          '    DisplayName    REG_SZ    IntelliJ IDEA 2026.1',
          '    InstallLocation    REG_SZ    D:\\JetBrains\\IntelliJ IDEA 2026.1',
          '    DisplayIcon    REG_SZ    D:\\JetBrains\\IntelliJ IDEA 2026.1\\bin\\idea64.exe'
        ].join('\r\n')
      }
    })

    expect(commands[0]).toEqual({ command: ideaPath, args: ['C:\\work\\demo'] })
  })

  it('Windows 探测 JetBrains Toolbox 中的 PyCharm 安装目录', () => {
    const localAppData = 'C:\\Users\\me\\AppData\\Local'
    const toolboxRoot = `${localAppData}\\JetBrains\\Toolbox\\apps`
    const productRoot = `${toolboxRoot}\\PyCharm-P`
    const channelRoot = `${productRoot}\\ch-0`
    const pycharmPath = `${channelRoot}\\252.2\\bin\\pycharm64.exe`
    const oldPycharmCmd = 'D:\\old-tools\\pycharm.cmd'
    const commands = buildEditorLaunchCommands('pycharm', 'C:\\work\\demo', {
      platform: 'win32',
      env: {
        LOCALAPPDATA: localAppData,
        Path: 'D:\\old-tools'
      },
      exists: (path) => {
        return [toolboxRoot, productRoot, channelRoot, pycharmPath, oldPycharmCmd].includes(path)
      },
      readDir: (path) => {
        if (path === productRoot) return ['ch-0']
        if (path === channelRoot) return ['251.1', '252.2']
        return []
      },
      readRegistrySubKeys: () => {
        throw new Error('should not query registry after Toolbox install path is found')
      }
    })

    expect(commands[0]).toEqual({ command: pycharmPath, args: ['C:\\work\\demo'] })
  })

  it('Windows 不添加未探测到的命令行启动器', () => {
    const commands = buildEditorLaunchCommands('pycharm', 'C:\\work\\demo', {
      platform: 'win32',
      env: {
        Path: 'C:\\Tools'
      },
      exists: () => false,
      readRegistrySubKeys: () => []
    })

    expect(commands).toEqual([])
  })
})

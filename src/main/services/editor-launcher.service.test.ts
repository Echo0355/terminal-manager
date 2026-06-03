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
      }
    })

    expect(commands[0]).toEqual({ command: codePath, args: ['C:\\work\\demo'] })
    expect(commands).toContainEqual({
      command: 'C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd',
      args: ['C:\\work\\demo'],
      shell: true,
      waitForExit: true
    })
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
      readDir: () => ['IntelliJ IDEA 2024.1', 'IntelliJ IDEA 2025.2', 'PyCharm 2025.1']
    })

    expect(commands[0]).toEqual({
      command: 'C:\\Program Files\\JetBrains\\IntelliJ IDEA 2025.2\\bin\\idea64.exe',
      args: ['C:\\work\\demo']
    })
  })

  it('Windows 不添加未探测到的命令行启动器', () => {
    const commands = buildEditorLaunchCommands('pycharm', 'C:\\work\\demo', {
      platform: 'win32',
      env: {
        Path: 'C:\\Tools'
      },
      exists: () => false
    })

    expect(commands).toEqual([])
  })
})

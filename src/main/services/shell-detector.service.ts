/**
 * Shell 检测和白名单验证
 */

import { existsSync } from 'fs'
import { basename } from 'path'

export interface ShellInfo {
  name: string
  path: string
  args?: string[]
}

export function detectShells(): ShellInfo[] {
  const shells: ShellInfo[] = []

  if (process.platform === 'win32') {
    shells.push({ name: 'PowerShell', path: 'powershell.exe' })
    const comspec = process.env.COMSPEC || 'cmd.exe'
    shells.push({ name: 'CMD', path: comspec })
    const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe'
    if (existsSync(gitBash)) {
      shells.push({ name: 'Git Bash', path: gitBash, args: ['--login', '-i'] })
    }
    const wsl = 'C:\\Windows\\System32\\wsl.exe'
    if (existsSync(wsl)) {
      shells.push({ name: 'WSL', path: wsl })
    }
  } else {
    const shellPaths = ['/bin/zsh', '/bin/bash', '/bin/sh', '/usr/bin/fish']
    for (const sp of shellPaths) {
      if (existsSync(sp)) {
        shells.push({ name: basename(sp), path: sp })
      }
    }
    const homebrewFish = '/opt/homebrew/bin/fish'
    if (existsSync(homebrewFish)) {
      shells.push({ name: 'fish', path: homebrewFish })
    }
  }

  return shells
}

export function createShellValidator(detectedShells: ShellInfo[], getDefaultShell: () => string) {
  return {
    isAllowed(shellPath: string): boolean {
      if (detectedShells.some((s) => s.path === shellPath)) return true
      if (getDefaultShell() === shellPath) return true
      return false
    },
    resolve(requestedShell?: string, configShell?: string): string {
      const shell = requestedShell || configShell || getDefaultShell()
      if (this.isAllowed(shell)) return shell
      return getDefaultShell()
    },
    resolveInfo(requestedShell?: string, configShell?: string): ShellInfo {
      const shellPath = this.resolve(requestedShell, configShell)
      const detectedShell = detectedShells.find((shell) => shell.path === shellPath)
      if (detectedShell) {
        return {
          ...detectedShell,
          args: detectedShell.args ? [...detectedShell.args] : undefined
        }
      }
      return { name: basename(shellPath) || shellPath, path: shellPath }
    }
  }
}

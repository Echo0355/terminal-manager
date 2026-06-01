/**
 * xterm 输入法组合定位辅助
 *
 * 在组合输入期间固定 xterm 的 textarea 和预编辑文字位置，避免终端输出触发
 * render 后将输入法候选框反复移动到新的终端光标位置。
 */

const IME_COMPOSING_CLASS = 'ime-composing'
const IME_ANCHOR_LEFT = '--ime-anchor-left'
const IME_ANCHOR_TOP = '--ime-anchor-top'

interface IMEAnchor {
  left: string
  top: string
}

function findIMETextarea(target: EventTarget | null): HTMLTextAreaElement | null {
  if (!(target instanceof HTMLTextAreaElement) || !target.classList.contains('xterm-helper-textarea')) {
    return null
  }

  return target
}

function readIMEAnchor(textarea: HTMLTextAreaElement): IMEAnchor | null {
  const bounds = textarea.getBoundingClientRect()
  const left = bounds.left
  const top = bounds.top
  if (!Number.isFinite(left) || !Number.isFinite(top) || left < 0 || top < 0) {
    return null
  }

  return {
    left: `${left}px`,
    top: `${top}px`
  }
}

/**
 * 固定当前输入法组合位置。
 *
 * @param target - composition 事件目标，应为 xterm 的隐藏 textarea。
 * @returns 成功固定时返回所属 xterm 元素，否则返回 null。
 */
export function pinIMECompositionAnchor(target: EventTarget | null): HTMLElement | null {
  const textarea = findIMETextarea(target)
  const terminal = textarea?.closest('.xterm') as HTMLElement | null
  if (!textarea || !terminal) return null

  // 已固定的锚点不能被后续终端 render 写入的 inline 坐标覆盖。
  if (terminal.classList.contains(IME_COMPOSING_CLASS)) {
    return terminal
  }

  const anchor = readIMEAnchor(textarea)
  if (!anchor) return null

  terminal.style.setProperty(IME_ANCHOR_LEFT, anchor.left)
  terminal.style.setProperty(IME_ANCHOR_TOP, anchor.top)
  terminal.classList.add(IME_COMPOSING_CLASS)
  return terminal
}

/**
 * 释放输入法组合位置。
 *
 * @param terminal - 之前由 pinIMECompositionAnchor 返回的 xterm 元素。
 */
export function releaseIMECompositionAnchor(terminal: HTMLElement | null): void {
  if (!terminal) return

  terminal.classList.remove(IME_COMPOSING_CLASS)
  terminal.style.removeProperty(IME_ANCHOR_LEFT)
  terminal.style.removeProperty(IME_ANCHOR_TOP)
}

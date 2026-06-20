/**
 * 终端命令输入框
 *
 * 提供一个可见的文本框用于编辑整条命令，按 Enter 后发送到 PTY。
 */

/**
 * 终端命令输入框配置。
 */
export interface TerminalCommandInputOptions {
  /** 提交命令时触发，参数为输入框中的原始文本。 */
  onSubmit: (command: string) => void
  /** 输入框获得焦点时触发。 */
  onFocus?: () => void
  /** 输入框高度变化后触发。 */
  onResize?: () => void
}

/**
 * 创建终端命令输入框。
 *
 * @param options - 输入框事件回调。
 * @returns 包含容器和 textarea 的 DOM 元素。
 */
export function createTerminalCommandInput(options: TerminalCommandInputOptions): {
  container: HTMLElement
  textarea: HTMLTextAreaElement
} {
  const container = document.createElement('div')
  container.className = 'terminal-command-input'

  const prompt = document.createElement('span')
  prompt.className = 'terminal-command-input-prompt'
  prompt.textContent = '>'

  const textarea = document.createElement('textarea')
  textarea.className = 'terminal-command-input-box'
  textarea.rows = 1
  textarea.spellcheck = false
  textarea.placeholder = '输入命令，Enter 执行'
  textarea.setAttribute('aria-label', '终端命令输入')

  textarea.addEventListener('input', () => {
    if (autosizeTerminalCommandInput(textarea)) {
      options.onResize?.()
    }
  })

  textarea.addEventListener('focus', () => {
    options.onFocus?.()
  })

  textarea.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) {
      return
    }

    event.preventDefault()
    const command = textarea.value

    options.onSubmit(command)
    textarea.value = ''
    if (autosizeTerminalCommandInput(textarea)) {
      options.onResize?.()
    }
  })

  container.appendChild(prompt)
  container.appendChild(textarea)

  return { container, textarea }
}

/**
 * 根据内容自动调整命令输入框高度。
 *
 * @param textarea - 需要调整高度的 textarea。
 * @returns 高度发生变化时返回 true。
 */
export function autosizeTerminalCommandInput(textarea: HTMLTextAreaElement): boolean {
  const previousHeight = textarea.style.height
  textarea.style.height = 'auto'
  textarea.style.height = `${textarea.scrollHeight}px`
  return textarea.style.height !== previousHeight
}

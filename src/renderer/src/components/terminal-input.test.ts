/**
 * 终端命令输入框测试
 *
 * 覆盖命令提交、换行编辑和焦点回调。
 *
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi } from 'vitest'
import { createTerminalCommandInput } from './terminal-input'

describe('createTerminalCommandInput', () => {
  it('按 Enter 提交命令并清空文本框', () => {
    const onSubmit = vi.fn()
    const { textarea } = createTerminalCommandInput({ onSubmit })
    textarea.value = 'npm run dev'

    textarea.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true
    }))

    expect(onSubmit).toHaveBeenCalledWith('npm run dev')
    expect(textarea.value).toBe('')
  })

  it('空白命令会作为回车提交', () => {
    const onSubmit = vi.fn()
    const { textarea } = createTerminalCommandInput({ onSubmit })
    textarea.value = ''

    textarea.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true
    }))

    expect(onSubmit).toHaveBeenCalledWith('')
    expect(textarea.value).toBe('')
  })

  it('Shift+Enter 保留给多行编辑', () => {
    const onSubmit = vi.fn()
    const { textarea } = createTerminalCommandInput({ onSubmit })
    textarea.value = 'echo one'

    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: true,
      bubbles: true,
      cancelable: true
    })
    textarea.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(textarea.value).toBe('echo one')
  })

  it('输入框聚焦时触发 onFocus', () => {
    const onFocus = vi.fn()
    const { textarea } = createTerminalCommandInput({
      onSubmit: vi.fn(),
      onFocus
    })

    textarea.dispatchEvent(new FocusEvent('focus'))

    expect(onFocus).toHaveBeenCalledOnce()
  })

  it('输入高度变化时触发 onResize', () => {
    const onResize = vi.fn()
    const { textarea } = createTerminalCommandInput({
      onSubmit: vi.fn(),
      onResize
    })
    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      value: 42
    })

    textarea.dispatchEvent(new Event('input'))

    expect(onResize).toHaveBeenCalledOnce()
    expect(textarea.style.height).toBe('42px')
  })
})

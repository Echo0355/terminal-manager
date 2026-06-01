/**
 * xterm 输入法组合定位辅助测试
 *
 * 覆盖锚点固定、重复 render 后保持原锚点、释放和异常输入。
 *
 * @vitest-environment happy-dom
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { pinIMECompositionAnchor, releaseIMECompositionAnchor } from './ime-handling'

function createIMETextarea(left = '120px', top = '48px'): HTMLTextAreaElement {
  document.body.innerHTML = `
    <div class="xterm">
      <div class="xterm-helpers">
        <textarea class="xterm-helper-textarea"></textarea>
      </div>
    </div>
  `

  const textarea = document.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement
  textarea.style.left = left
  textarea.style.top = top
  textarea.getBoundingClientRect = () => ({
    bottom: Number.parseFloat(top),
    height: 0,
    left: Number.parseFloat(left),
    right: Number.parseFloat(left),
    top: Number.parseFloat(top),
    width: 0,
    x: Number.parseFloat(left),
    y: Number.parseFloat(top),
    toJSON: () => ({})
  })
  return textarea
}

describe('pinIMECompositionAnchor', () => {
  beforeEach(() => {
    document.body.replaceChildren()
  })

  it('固定 textarea 当前坐标', () => {
    const textarea = createIMETextarea()
    const terminal = pinIMECompositionAnchor(textarea)

    expect(terminal?.classList.contains('ime-composing')).toBe(true)
    expect(terminal?.style.getPropertyValue('--ime-anchor-left')).toBe('120px')
    expect(terminal?.style.getPropertyValue('--ime-anchor-top')).toBe('48px')
  })

  it('使用窗口坐标固定锚点，而不是 xterm 内部相对坐标', () => {
    const textarea = createIMETextarea('20px', '16px')
    textarea.getBoundingClientRect = () => ({
      bottom: 264,
      height: 16,
      left: 320,
      right: 328,
      top: 248,
      width: 8,
      x: 320,
      y: 248,
      toJSON: () => ({})
    })

    const terminal = pinIMECompositionAnchor(textarea)

    expect(terminal?.style.getPropertyValue('--ime-anchor-left')).toBe('320px')
    expect(terminal?.style.getPropertyValue('--ime-anchor-top')).toBe('248px')
  })

  it('终端 render 更新 inline 坐标后仍保留初始锚点', () => {
    const textarea = createIMETextarea()
    const terminal = pinIMECompositionAnchor(textarea)

    textarea.style.left = '360px'
    textarea.style.top = '240px'
    expect(pinIMECompositionAnchor(textarea)).toBe(terminal)
    expect(terminal?.style.getPropertyValue('--ime-anchor-left')).toBe('120px')
    expect(terminal?.style.getPropertyValue('--ime-anchor-top')).toBe('48px')
  })

  it('释放时清除组合状态和锚点变量', () => {
    const terminal = pinIMECompositionAnchor(createIMETextarea())

    releaseIMECompositionAnchor(terminal)

    expect(terminal?.classList.contains('ime-composing')).toBe(false)
    expect(terminal?.style.getPropertyValue('--ime-anchor-left')).toBe('')
    expect(terminal?.style.getPropertyValue('--ime-anchor-top')).toBe('')
  })

  it('忽略尚未同步到光标位置的 textarea', () => {
    const textarea = createIMETextarea('-9999em', '0px')

    expect(pinIMECompositionAnchor(textarea)).toBeNull()
  })

  it('忽略非 xterm textarea', () => {
    const textarea = document.createElement('textarea')

    expect(pinIMECompositionAnchor(textarea)).toBeNull()
    expect(pinIMECompositionAnchor(null)).toBeNull()
  })
})

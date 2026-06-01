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

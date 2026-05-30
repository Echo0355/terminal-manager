/**
 * UI 工具函数：通知和确认对话框
 */

import {
  notification,
  confirmOverlay,
  confirmTitle,
  confirmBody,
  confirmOk,
  confirmCancel
} from './state'

// ── 通知系统 ──

let notificationTimer: ReturnType<typeof setTimeout> | null = null

const NOTIFICATION_ICONS: Record<string, string> = {
  info: 'ℹ',
  error: '✗',
  warning: '⚠',
  success: '✓'
}

/**
 * 显示通知提示
 */
export function showNotification(
  message: string,
  type: 'info' | 'error' | 'warning' | 'success' = 'info',
  duration = 3000
): void {
  if (notificationTimer) {
    clearTimeout(notificationTimer)
    notificationTimer = null
  }

  const icon = NOTIFICATION_ICONS[type] || NOTIFICATION_ICONS.info
  notification.innerHTML = `<span class="notification-icon">${icon}</span><span class="notification-text">${escapeHtml(message)}</span>`
  notification.className = type
  notification.classList.add('visible')

  if (duration > 0) {
    notificationTimer = setTimeout(() => {
      notification.classList.remove('visible')
      notificationTimer = null
    }, duration)
  }
}

// ── 确认对话框 ──

let confirmResolve: ((value: boolean) => void) | null = null

/**
 * 显示确认对话框
 */
export function showConfirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    confirmTitle.textContent = title
    confirmBody.textContent = message
    confirmOverlay.classList.add('visible')
    confirmResolve = resolve
  })
}

function handleConfirmOk(): void {
  confirmOverlay.classList.remove('visible')
  if (confirmResolve) {
    confirmResolve(true)
    confirmResolve = null
  }
}

function handleConfirmCancel(): void {
  confirmOverlay.classList.remove('visible')
  if (confirmResolve) {
    confirmResolve(false)
    confirmResolve = null
  }
}

// 绑定确认对话框事件
confirmOk.addEventListener('click', handleConfirmOk)
confirmCancel.addEventListener('click', handleConfirmCancel)
confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) handleConfirmCancel()
})

// ── 工具函数 ──

/**
 * HTML 转义
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export { handleConfirmCancel }

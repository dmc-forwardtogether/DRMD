// 全局 Toast 通知 composable
// 用法: const toast = useToast(); toast.success('操作成功'); toast.error('操作失败');

import type { Toast } from '~/components/ToastContainer.vue'

interface ToastAPI {
  success: (msg: string, durationMs?: number) => void
  error: (msg: string, durationMs?: number) => void
  warning: (msg: string, durationMs?: number) => void
  info: (msg: string, durationMs?: number) => void
}

let globalAddToast: ((type: Toast['type'], message: string, durationMs?: number) => void) | null = null

export function registerToast(addFn: (type: Toast['type'], message: string, durationMs?: number) => void): void {
  globalAddToast = addFn
}

export function useToast(): ToastAPI {
  const emit = (type: Toast['type'], message: string, durationMs?: number) => {
    if (globalAddToast) {
      globalAddToast(type, message, durationMs)
    } else {
      // 兜底：使用 console
      const prefix = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' }[type]
      console.log(`${prefix} ${message}`)
    }
  }
  return {
    success: (msg, dur) => emit('success', msg, dur),
    error: (msg, dur) => emit('error', msg, dur ?? 5000),
    warning: (msg, dur) => emit('warning', msg, dur),
    info: (msg, dur) => emit('info', msg, dur),
  }
}

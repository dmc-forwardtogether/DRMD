<script setup lang="ts">
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-vue-next'

export interface Toast {
  id: number
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
}

const toasts = ref<Toast[]>([])
let nextId = 1

function addToast(type: Toast['type'], message: string, durationMs = 3000): void {
  const id = nextId++
  toasts.value.push({ id, type, message })
  if (durationMs > 0) {
    setTimeout(() => removeToast(id), durationMs)
  }
}

function removeToast(id: number): void {
  toasts.value = toasts.value.filter(t => t.id !== id)
}

defineExpose({ addToast, removeToast })

const iconMap: Record<Toast['type'], typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const colorMap: Record<Toast['type'], string> = {
  success: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  error: 'border-red-300 bg-red-50 text-red-800',
  warning: 'border-amber-300 bg-amber-50 text-amber-800',
  info: 'border-blue-300 bg-blue-50 text-blue-800',
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto rounded-lg border px-4 py-3 shadow-lg flex items-start gap-2.5 text-sm"
          :class="colorMap[toast.type]"
        >
          <component :is="iconMap[toast.type]" class="w-4 h-4 shrink-0 mt-0.5" />
          <span class="flex-1">{{ toast.message }}</span>
          <button
            class="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
            @click="removeToast(toast.id)"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active {
  transition: all 0.3s ease-out;
}
.toast-leave-active {
  transition: all 0.2s ease-in;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(40px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(40px);
}
</style>

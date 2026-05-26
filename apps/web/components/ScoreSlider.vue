<script setup lang="ts">
const props = defineProps<{
  modelValue: number
  label: string
}>()

const emit = defineEmits<{
  "update:modelValue": [value: number]
}>()

const dots = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

function select(v: number): void {
  emit("update:modelValue", v)
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-1">
      <label class="text-xs font-medium text-slate-600">{{ label }}</label>
      <span class="text-sm font-bold text-slate-800">{{ modelValue }}</span>
    </div>
    <div class="flex gap-1">
      <button
        v-for="v in dots"
        :key="v"
        @click="select(v)"
        class="flex-1 h-7 rounded text-xs font-medium transition-all"
        :class="v <= modelValue
          ? 'bg-amber-400 text-white shadow-sm'
          : 'bg-slate-100 text-slate-300 hover:bg-slate-200'"
      >
        {{ v }}
      </button>
    </div>
  </div>
</template>

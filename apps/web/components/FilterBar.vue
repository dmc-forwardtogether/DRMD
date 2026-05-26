<script setup lang="ts" generic="T extends string">
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-vue-next"
import type { FilterOption, PaginationState } from "~/types"

const props = defineProps<{
  /** 单组筛选项列表 (向后兼容) */
  filters?: FilterOption[]
  /** 多组筛选 (每组一个标签) */
  filterGroups?: { label: string; options: FilterOption[]; modelValue: T | "" }[]
  /** 当前选中 (单组模式) */
  modelValue?: T | ""
  /** 搜索文字 */
  searchQuery?: string
  /** 搜索占位符 */
  searchPlaceholder?: string
  /** 分页状态 */
  pagination?: PaginationState
  /** 是否显示搜索 */
  showSearch?: boolean
  /** 每页条数选项 */
  pageSizeOptions?: number[]
}>()

const emit = defineEmits<{
  "update:modelValue": [value: T | ""]
  "update:searchQuery": [value: string]
  "update:filterGroups": [groups: { label: string; options: FilterOption[]; modelValue: T | "" }[]]
  "page-change": [page: number]
  "page-size-change": [pageSize: number]
}>()

function selectFilter(key: T | ""): void {
  emit("update:modelValue", key)
}

function pageCount(): number {
  if (!props.pagination) return 1
  return Math.ceil(props.pagination.total / props.pagination.pageSize)
}
</script>

<template>
  <div class="space-y-2">
    <!-- 多组筛选模式 -->
    <div v-if="filterGroups && filterGroups.length > 0" class="flex gap-4 flex-wrap">
      <div v-for="(group, gi) in filterGroups" :key="gi" class="flex items-center gap-2">
        <span class="text-xs text-slate-400 font-medium whitespace-nowrap">{{ group.label }}</span>
        <div class="flex gap-1 flex-wrap">
          <button
            v-for="f in group.options"
            :key="f.key"
            @click="group.modelValue = f.key as T | ''; emit('update:filterGroups', [...filterGroups])"
            class="px-2.5 py-1 text-xs font-medium rounded-full border transition-colors flex items-center gap-1"
            :class="group.modelValue === f.key
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'"
          >
            <span v-if="f.icon" class="text-xs">{{ f.icon }}</span>
            {{ f.label }}
            <span v-if="f.count !== undefined" class="text-[10px] px-1 rounded-full" :class="group.modelValue === f.key ? 'bg-white/20' : 'bg-slate-100'">{{ f.count }}</span>
          </button>
        </div>
      </div>
    </div>

    <div class="flex items-center gap-3 flex-wrap">
      <!-- 单组筛选项 chips (向后兼容) -->
      <div v-if="filters && filters.length > 0" class="flex gap-1.5 flex-wrap">
        <button
          v-for="f in filters"
          :key="f.key"
          @click="selectFilter(f.key as T | '')"
          class="px-3 py-1.5 text-xs font-medium rounded-full border transition-colors flex items-center gap-1.5"
          :class="modelValue === f.key
            ? 'bg-indigo-600 text-white border-indigo-600'
            : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'"
        >
          <span v-if="f.icon" class="text-sm">{{ f.icon }}</span>
          {{ f.label }}
          <span
            v-if="f.count !== undefined"
            class="text-[10px] px-1 rounded-full"
            :class="modelValue === f.key ? 'bg-white/20' : 'bg-slate-100'"
          >{{ f.count }}</span>
        </button>
      </div>

      <!-- 搜索框 -->
      <div v-if="showSearch !== false" class="relative flex-1 min-w-[200px] max-w-xs">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          :value="searchQuery"
          @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
          class="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
          :placeholder="searchPlaceholder || '搜索...'"
        />
      </div>

      <!-- 分页 -->
      <div v-if="pagination" class="flex items-center gap-1.5 ml-auto text-xs text-slate-500">
        <!-- 每页条数 -->
        <select
          v-if="pageSizeOptions && pageSizeOptions.length > 0"
          :value="pagination.pageSize"
          @change="emit('page-size-change', Number(($event.target as HTMLSelectElement).value))"
          class="border border-slate-200 rounded px-2 py-1 text-xs bg-white outline-none"
        >
          <option v-for="ps in pageSizeOptions" :key="ps" :value="ps">{{ ps }}/页</option>
        </select>

        <span class="text-slate-400">
          {{ Math.min((pagination.page - 1) * pagination.pageSize + 1, pagination.total) }}-{{ Math.min(pagination.page * pagination.pageSize, pagination.total) }}
          / {{ pagination.total }}
        </span>

        <button :disabled="pagination.page <= 1" @click="emit('page-change', 1)" class="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronsLeft class="w-3 h-3" />
        </button>
        <button :disabled="pagination.page <= 1" @click="emit('page-change', pagination.page - 1)" class="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronLeft class="w-3.5 h-3.5" />
        </button>

        <!-- 页码 -->
        <template v-for="p in Math.min(pageCount(), 7)" :key="p">
          <button
            v-if="pageCount() <= 7 || p <= 3 || p >= pageCount() - 2 || Math.abs(p - pagination.page) <= 1"
            @click="emit('page-change', p)"
            class="w-6 h-6 rounded text-xs font-medium transition-colors"
            :class="p === pagination.page ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 text-slate-500'"
          >{{ p }}</button>
          <span v-else-if="p === 4 || p === pageCount() - 3" class="text-slate-300">…</span>
        </template>

        <button :disabled="pagination.page >= pageCount()" @click="emit('page-change', pagination.page + 1)" class="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronRight class="w-3.5 h-3.5" />
        </button>
        <button :disabled="pagination.page >= pageCount()" @click="emit('page-change', pageCount())" class="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronsRight class="w-3 h-3" />
        </button>
      </div>
    </div>
  </div>
</template>

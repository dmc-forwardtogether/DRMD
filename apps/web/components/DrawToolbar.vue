<script setup lang="ts">
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Download,
  Droplets,
  Eye,
  EyeOff,
  Factory,
  Landmark,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  RefreshCw,
  Square,
  Train,
  Trash,
  Trash2,
  TreePine,
  Upload,
  Waypoints
} from "lucide-vue-next"
import type { DrawMode, FeatureKind, KindStyleConfig, SavedProject } from "~/types"

const props = withDefaults(defineProps<{
  activeMode: DrawMode
  activeKind: FeatureKind
  allowedKinds?: FeatureKind[]
  kindStyles: KindStyleConfig[]
  projectName?: string
  featureCount?: number
  countByKind?: Partial<Record<FeatureKind, number>>
}>(), {
  allowedKinds: () => ["parcel_residential", "parcel_public", "parcel_commercial", "parcel_industrial", "parcel_transport", "parcel_green", "parcel_water", "road"],
  projectName: "",
  featureCount: 0,
  countByKind: () => ({})
})

const emit = defineEmits<{
  (e: "mode-change", mode: DrawMode): void
  (e: "kind-change", kind: FeatureKind): void
  (e: "kind-styles-change", styles: KindStyleConfig[]): void
  (e: "locate"): void
  (e: "delete-selected"): void
  (e: "clear-all"): void
  (e: "save"): void
  (e: "load", payload: SavedProject): void
  (e: "refresh"): void
}>()

const collapsed = ref(false)
const showClearConfirm = ref(false)
const localStyles = ref<KindStyleConfig[]>([])
const layerStylesOpen = ref(true)
const fileInputRef = ref<HTMLInputElement>()

function triggerLoad(): void {
  fileInputRef.value?.click()
}

const modeTools = [
  { mode: "select" as DrawMode, icon: MousePointer2, label: "Select" },
  { mode: "edit" as DrawMode, icon: Pencil, label: "Draw" }
]

const kindOptions = [
  { kind: "parcel_residential" as FeatureKind, label: "Residential (R)", icon: Square },
  { kind: "parcel_public" as FeatureKind, label: "Public (A)", icon: Landmark },
  { kind: "parcel_commercial" as FeatureKind, label: "Commercial (B)", icon: Building2 },
  { kind: "parcel_industrial" as FeatureKind, label: "Industrial (M)", icon: Factory },
  { kind: "parcel_transport" as FeatureKind, label: "Transport (S)", icon: Train },
  { kind: "parcel_green" as FeatureKind, label: "Green (G)", icon: TreePine },
  { kind: "parcel_water" as FeatureKind, label: "Water (E)", icon: Droplets },
  { kind: "road" as FeatureKind, label: "Road", icon: Waypoints }
]

const kindGroups: Array<{ label: string; kinds: FeatureKind[] }> = [
  { label: "Urban Land Use", kinds: ["parcel_residential", "parcel_public", "parcel_commercial", "parcel_industrial", "parcel_transport", "parcel_green", "parcel_water"] },
  { label: "Network", kinds: ["road"] }
]

const kindOptionMap = computed(() => {
  return new Map(kindOptions.map((option) => [option.kind, option]))
})

watch(
  () => props.kindStyles,
  (styles) => {
    localStyles.value = styles.map((style) => ({ ...style }))
  },
  { immediate: true, deep: true }
)

watch(
  localStyles,
  (styles) => {
    emit("kind-styles-change", styles.map((style) => ({ ...style })))
  },
  { deep: true }
)

async function handleLoad(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const payload = JSON.parse(await file.text()) as SavedProject
    if (payload.type !== "FeatureCollection") {
      alert("Invalid file: expected FeatureCollection")
      return
    }
    emit("load", payload)
  } catch {
    alert("Invalid file: parse error")
  } finally {
    if (fileInputRef.value) {
      fileInputRef.value.value = ""
    }
  }
}

function handleClearAll(): void {
  if (!showClearConfirm.value) {
    showClearConfirm.value = true
    window.setTimeout(() => {
      showClearConfirm.value = false
    }, 2000)
    return
  }
  showClearConfirm.value = false
  emit("clear-all")
}

function toggleVisibility(kind: FeatureKind): void {
  const target = localStyles.value.find((style) => style.kind === kind)
  if (!target) return
  target.visible = !target.visible
}

function isKindDisabled(kind: FeatureKind): boolean {
  return !props.allowedKinds.includes(kind)
}

function handleKindClick(kind: FeatureKind): void {
  if (isKindDisabled(kind)) {
    return
  }
  emit("kind-change", kind)
}
</script>

<template>
  <!-- Collapsed: thin bar with toggle -->
  <aside
    v-if="collapsed"
    class="w-11 h-full bg-white border-r border-slate-200 flex flex-col items-center py-3 gap-3 shadow-panel transition-all"
  >
    <button class="text-slate-500 hover:text-slate-800 transition" @click="collapsed = false" title="Expand panel">
      <PanelLeftOpen class="w-4 h-4" />
    </button>
    <div class="w-6 h-px bg-slate-200" />
    <button
      v-for="tool in modeTools"
      :key="tool.mode"
      class="rounded-lg p-1.5 transition"
      :class="activeMode === tool.mode ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'"
      :title="tool.label"
      @click="emit('mode-change', tool.mode)"
    >
      <component :is="tool.icon" class="w-4 h-4" />
    </button>
  </aside>

  <!-- Expanded: full sidebar -->
  <aside
    v-else
    class="w-72 h-full bg-white border-r border-slate-200 flex flex-col shadow-panel transition-all overflow-hidden"
  >
    <!-- Header with project info + collapse -->
    <div class="px-4 pt-3 pb-2 border-b border-slate-100">
      <div class="flex items-center justify-between mb-2">
        <NuxtLink to="/" class="text-[11px] text-slate-400 hover:text-slate-600 transition">← Projects</NuxtLink>
        <button class="text-slate-400 hover:text-slate-600 transition" @click="collapsed = true" title="Collapse panel">
          <PanelLeftClose class="w-4 h-4" />
        </button>
      </div>
      <p class="text-sm font-semibold text-slate-800 truncate">{{ projectName || 'Project' }}</p>
      <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <span class="text-[10px] text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 font-medium">{{ featureCount }} total</span>
        <template v-for="(count, kind) in countByKind" :key="kind">
          <span v-if="count && count > 0" class="text-[10px] rounded-full px-1.5 py-0.5 font-medium"
            :class="{
              'text-amber-700 bg-amber-50': kind === 'parcel_residential',
              'text-orange-700 bg-orange-50': kind === 'parcel_public',
              'text-red-700 bg-red-50': kind === 'parcel_commercial',
              'text-yellow-700 bg-yellow-50': kind === 'parcel_industrial',
              'text-gray-700 bg-gray-100': kind === 'parcel_transport',
              'text-green-700 bg-green-50': kind === 'parcel_green',
              'text-blue-700 bg-blue-50': kind === 'parcel_water',
              'text-slate-600 bg-slate-100': kind === 'road'
            }"
          >{{ kindOptionMap.get(kind as FeatureKind)?.label?.split(' ')[0] || kind }}: {{ count }}</span>
        </template>
      </div>
    </div>

    <!-- Scrollable content -->
    <div class="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
      <!-- Mode -->
      <div>
        <p class="text-[10px] font-semibold tracking-wider text-slate-400 uppercase mb-2">Mode</p>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="tool in modeTools"
            :key="tool.mode"
            class="rounded-lg border px-3 py-2 text-xs font-medium flex items-center gap-2 transition"
            :class="activeMode === tool.mode ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'"
            @click="emit('mode-change', tool.mode)"
          >
            <component :is="tool.icon" class="w-3.5 h-3.5" />
            {{ tool.label }}
          </button>
        </div>
      </div>

      <!-- Feature Library (only in draw mode) -->
      <div v-if="activeMode === 'edit'">
        <p class="text-[10px] font-semibold tracking-wider text-slate-400 uppercase mb-2">Feature Library</p>
        <div class="space-y-2">
          <div
            v-for="group in kindGroups"
            :key="group.label"
            class="rounded-lg border border-slate-200 bg-slate-50 p-2"
          >
            <p class="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">{{ group.label }}</p>
            <div class="mt-1.5 grid grid-cols-1 gap-1.5">
              <button
                v-for="kind in group.kinds"
                :key="kind"
                class="rounded-lg border px-2.5 py-1.5 text-xs font-medium flex items-center gap-2 transition"
                :class="[
                  activeKind === kind ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400',
                  isKindDisabled(kind) ? 'opacity-40 cursor-not-allowed' : ''
                ]"
                :disabled="isKindDisabled(kind)"
                @click="handleKindClick(kind)"
              >
                <component :is="kindOptionMap.get(kind)?.icon || MousePointer2" class="w-3.5 h-3.5" />
                {{ kindOptionMap.get(kind)?.label || kind }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Layer Styles (collapsible drawer) -->
      <div>
        <button
          class="w-full flex items-center justify-between text-[10px] font-semibold tracking-wider text-slate-400 uppercase group"
          @click="layerStylesOpen = !layerStylesOpen"
        >
          <span>Layer Styles</span>
          <ChevronRight
            class="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition-transform duration-200"
            :class="layerStylesOpen ? 'rotate-90' : 'rotate-0'"
          />
        </button>
        <transition
          enter-active-class="transition-all duration-200 ease-out overflow-hidden"
          leave-active-class="transition-all duration-150 ease-in overflow-hidden"
          enter-from-class="opacity-0 max-h-0"
          enter-to-class="opacity-100 max-h-[500px]"
          leave-from-class="opacity-100 max-h-[500px]"
          leave-to-class="opacity-0 max-h-0"
        >
          <div v-show="layerStylesOpen" class="space-y-0.5 mt-2">
            <div
              v-for="style in localStyles"
              :key="style.kind"
              class="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50 transition"
            >
              <div class="relative shrink-0">
                <input
                  :value="style.color"
                  type="color"
                  class="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                  @input="style.color = ($event.target as HTMLInputElement).value"
                />
                <div
                  class="w-5 h-5 rounded border border-slate-200 shadow-sm pointer-events-none"
                  :style="{ backgroundColor: style.color }"
                />
              </div>
              <span class="text-[11px] text-slate-600 flex-1 truncate">{{ kindOptionMap.get(style.kind)?.label || style.kind }}</span>
              <button
                class="shrink-0 transition"
                :class="style.visible ? 'text-slate-400 hover:text-slate-600' : 'text-slate-300'"
                @click="toggleVisibility(style.kind)"
                :title="style.visible ? 'Hide layer' : 'Show layer'"
              >
                <Eye v-if="style.visible" class="w-3.5 h-3.5" />
                <EyeOff v-else class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </transition>
      </div>
    </div>

    <!-- Bottom actions -->
    <div class="px-4 py-3 border-t border-slate-100">
      <div class="grid grid-cols-2 gap-1.5">
        <button class="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-1.5" @click="emit('refresh')">
          <RefreshCw class="w-3 h-3" />
          Refresh
        </button>
        <button class="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-1.5" @click="emit('locate')">
          <Crosshair class="w-3 h-3" />
          Locate
        </button>
        <button class="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-1.5" @click="emit('delete-selected')">
          <Trash2 class="w-3 h-3" />
          Delete
        </button>
        <button
          class="rounded-lg px-2 py-1.5 text-[11px] font-medium flex items-center justify-center gap-1.5"
          :class="showClearConfirm ? 'bg-rose-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-rose-50'"
          @click="handleClearAll"
        >
          <Trash class="w-3 h-3" />
          {{ showClearConfirm ? "Confirm?" : "Clear" }}
        </button>
        <button class="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-1.5" @click="emit('save')">
          <Download class="w-3 h-3" />
          Save
        </button>
        <button class="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-1.5" @click="triggerLoad">
          <Upload class="w-3 h-3" />
          Load
        </button>
      </div>
    </div>

    <input ref="fileInputRef" type="file" accept=".json,application/json" class="hidden" @change="handleLoad" />
  </aside>
</template>

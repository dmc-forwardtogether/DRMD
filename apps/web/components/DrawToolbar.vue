<script setup lang="ts">
import {
  Building2,
  Crosshair,
  Download,
  Droplets,
  Eye,
  EyeOff,
  Factory,
  Landmark,
  MapPin,
  MousePointer2,
  Package,
  Pencil,
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
}>(), {
  allowedKinds: () => ["parcel_residential", "parcel_public", "parcel_commercial", "parcel_industrial", "parcel_logistics", "parcel_transport", "parcel_green", "parcel_water", "parcel_mixed", "road", "poi"]
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
}>()

const fileInputRef = ref<HTMLInputElement>()
const showClearConfirm = ref(false)
const localStyles = ref<KindStyleConfig[]>([])

const modeTools = [
  { mode: "select" as DrawMode, icon: MousePointer2, label: "Select" },
  { mode: "edit" as DrawMode, icon: Pencil, label: "Draw" }
]

const kindOptions = [
  { kind: "parcel_residential" as FeatureKind, label: "Residential (R)", icon: Square },
  { kind: "parcel_public" as FeatureKind, label: "Public (A)", icon: Landmark },
  { kind: "parcel_commercial" as FeatureKind, label: "Commercial (B)", icon: Building2 },
  { kind: "parcel_industrial" as FeatureKind, label: "Industrial (M)", icon: Factory },
  { kind: "parcel_logistics" as FeatureKind, label: "Logistics (W)", icon: Package },
  { kind: "parcel_transport" as FeatureKind, label: "Transport (S)", icon: Train },
  { kind: "parcel_green" as FeatureKind, label: "Green (G)", icon: TreePine },
  { kind: "parcel_water" as FeatureKind, label: "Water (E)", icon: Droplets },
  { kind: "parcel_mixed" as FeatureKind, label: "Mixed Use", icon: MapPin },
  { kind: "road" as FeatureKind, label: "Road", icon: Waypoints }
]

const kindGroups: Array<{ label: string; kinds: FeatureKind[] }> = [
  { label: "Urban Land Use", kinds: ["parcel_residential", "parcel_public", "parcel_commercial", "parcel_industrial", "parcel_logistics", "parcel_transport", "parcel_green", "parcel_water", "parcel_mixed"] },
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

function triggerLoad(): void {
  fileInputRef.value?.click()
}

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
  <aside class="w-72 h-full bg-white border-r border-slate-200 p-4 flex flex-col gap-4 shadow-panel">
    <div>
      <p class="text-xs font-semibold tracking-wider text-slate-400 uppercase">Interaction</p>
      <div class="grid grid-cols-2 gap-2 mt-2">
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

    <div v-if="activeMode === 'edit'">
      <p class="text-xs font-semibold tracking-wider text-slate-400 uppercase">Feature Library</p>
      <div class="mt-2 space-y-2">
        <div
          v-for="group in kindGroups"
          :key="group.label"
          class="rounded-lg border border-slate-200 bg-slate-50 p-2"
        >
          <p class="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{{ group.label }}</p>
          <div class="mt-2 grid grid-cols-1 gap-2">
            <button
              v-for="kind in group.kinds"
              :key="kind"
              class="rounded-lg border px-3 py-2 text-xs font-medium flex items-center gap-2 transition"
              :class="[
                activeKind === kind ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400',
                isKindDisabled(kind) ? 'opacity-40 cursor-not-allowed hover:border-slate-200' : ''
              ]"
              :disabled="isKindDisabled(kind)"
              @click="handleKindClick(kind)"
            >
              <component :is="kindOptionMap.get(kind)?.icon || MapPin" class="w-3.5 h-3.5" />
              {{ kindOptionMap.get(kind)?.label || kind }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div>
      <p class="text-xs font-semibold tracking-wider text-slate-400 uppercase">Layer Styles</p>
      <div class="mt-2 space-y-1">
        <div
          v-for="style in localStyles"
          :key="style.kind"
          class="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 transition group"
        >
          <div class="relative shrink-0">
            <input
              :value="style.color"
              type="color"
              class="absolute inset-0 w-full h-full cursor-pointer opacity-0"
              @input="style.color = ($event.target as HTMLInputElement).value"
            />
            <div
              class="w-6 h-6 rounded-md border border-slate-200 shadow-sm pointer-events-none"
              :style="{ backgroundColor: style.color }"
            />
          </div>
          <span class="text-xs text-slate-600 flex-1 truncate">{{ kindOptionMap.get(style.kind)?.label || style.kind }}</span>
          <button
            class="text-slate-400 hover:text-slate-600 transition shrink-0"
            @click="toggleVisibility(style.kind)"
          >
            <Eye v-if="style.visible" class="w-3.5 h-3.5" />
            <EyeOff v-else class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <div class="mt-auto grid grid-cols-2 gap-2">
      <button class="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-2" @click="emit('locate')">
        <Crosshair class="w-3.5 h-3.5" />
        Locate Center
      </button>
      <button class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-2" @click="emit('delete-selected')">
        <Trash2 class="w-3.5 h-3.5" />
        Delete
      </button>
      <button
        class="rounded-lg px-3 py-2 text-xs font-medium flex items-center justify-center gap-2"
        :class="showClearConfirm ? 'bg-rose-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-rose-50'"
        @click="handleClearAll"
      >
        <Trash class="w-3.5 h-3.5" />
        {{ showClearConfirm ? "Confirm" : "Clear" }}
      </button>
      <button class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-2" @click="emit('save')">
        <Download class="w-3.5 h-3.5" />
        Save
      </button>
      <button class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-2" @click="triggerLoad">
        <Upload class="w-3.5 h-3.5" />
        Load
      </button>
    </div>

    <div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-800">
      <p class="font-semibold tracking-wide uppercase text-[10px] text-amber-700">Drawing Tips</p>
      <p>Finish: double-click (line/polygon) or single click (point).</p>
      <p>Delete last point: press Backspace/Delete or click Delete while drawing.</p>
    </div>

    <input ref="fileInputRef" type="file" accept=".json,application/json" class="hidden" @change="handleLoad" />
  </aside>
</template>

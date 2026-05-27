<script setup lang="ts">
import type { DrawMode, FeatureKind, FeatureProperties, KindStyleConfig, MallProfile, SavedProject, SelectedFeatureInfo } from "~/types"
import { useEditorStore } from "~/store/editor.store"
import { useToast } from "~/composables/useToast"

const route = useRoute()
const store = useEditorStore()
const toast = useToast()
const { public: { apiBase } } = useRuntimeConfig()

const projectId = computed(() => Number(route.params.id))

interface MapRef {
  loadData: (data: GeoJSON.FeatureCollection) => void
  updateProperties: (id: string, properties: FeatureProperties) => void
  deleteSelected: () => void
  clearAll: () => void
  applyKindStyles: () => void
  centerToCurrentLocation: () => Promise<void>
  updateFeatureId: (oldId: string, newId: string) => void
  setView: (lng: number, lat: number, zoom?: number) => void
  getView: () => { lng: number; lat: number; zoom: number } | null
  getMap: () => maplibregl.Map | null
}
const mapRef = ref<MapRef | null>(null)

// ===== 项目信息（名称 + 视口 + 配置） =====
const projectName = ref("")
const projectConfig = ref<Record<string, unknown>>({})
const initialView = ref<{ lng: number; lat: number; zoom: number } | null>(null)
const viewApplied = ref(false)
let viewSaveTimer: ReturnType<typeof setTimeout> | null = null

const projectBaseStyleId = computed(() => {
  const mapStyle = projectConfig.value?.mapStyle as Record<string, unknown> | undefined
  return (mapStyle?.baseStyleId as string) || undefined
})

// ===== 视口：URL hash 优先（Google Maps / Mapbox 标准做法） =====

function readHashView(): { lng: number; lat: number; zoom: number } | null {
  if (typeof window === 'undefined') return null
  const m = window.location.hash.match(/^#map=(\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/)
  if (m) return { zoom: +m[1], lat: +m[2], lng: +m[3] }
  return null
}

function writeHashView(lng: number, lat: number, zoom: number): void {
  if (typeof window === 'undefined') return
  history.replaceState(history.state, '', `#map=${zoom.toFixed(1)}/${lat.toFixed(4)}/${lng.toFixed(4)}`)
}

function saveViewToBackend(lng: number, lat: number, zoom: number): void {
  $fetch(`${apiBase}/api/projects/${projectId.value}`, {
    method: "PATCH",
    body: { centerLng: lng, centerLat: lat, zoom }
  }).catch(() => {})
}

function onMapMoveEnd(): void {
  const view = mapRef.value?.getView()
  if (!view) return
  writeHashView(view.lng, view.lat, view.zoom)
  if (viewSaveTimer) clearTimeout(viewSaveTimer)
  viewSaveTimer = setTimeout(() => saveViewToBackend(view.lng, view.lat, view.zoom), 2000)
}

async function fetchProjectInfo(): Promise<void> {
  try {
    const res = await $fetch<{ project: { name: string; centerLng?: number; centerLat?: number; zoom?: number; config?: Record<string, unknown> } }>(
      `${apiBase}/api/projects/${projectId.value}`
    )
    projectName.value = res.project.name
    projectConfig.value = res.project.config || {}
    if (!initialView.value && res.project.centerLng && res.project.centerLat) {
      initialView.value = {
        lng: res.project.centerLng,
        lat: res.project.centerLat,
        zoom: res.project.zoom ?? 13
      }
    }
  } catch (error) {
    console.error("Failed to fetch project info", error)
  }
}

// ===== Editor 状态 =====
const activeMode = ref<DrawMode>("select")
const activeKind = ref<FeatureKind>("parcel_commercial")
const selectedFeature = ref<SelectedFeatureInfo | null>(null)
const statusMessage = ref("")
let statusTimer: ReturnType<typeof setTimeout> | null = null
const allowedKinds: FeatureKind[] = ["parcel_residential", "parcel_public", "parcel_commercial", "parcel_industrial", "parcel_transport", "parcel_green", "parcel_water", "road"]

// 首次加载：读 hash → 拉项目信息 → 等 map + projectName 就绪后加载
const hasHash = ref(false)
if (typeof window !== 'undefined') {
  const hashView = readHashView()
  hasHash.value = !!hashView
  if (hashView) initialView.value = hashView
}

watch(projectId, (newId) => {
  if (newId) {
    viewApplied.value = false
    initialView.value = readHashView()
    fetchProjectInfo()
  }
}, { immediate: true })

// mapRef 就绪 + projectName 已加载 → 加载 features 并绑定事件
watch([mapRef, projectName], ([ref, name]) => {
  if (ref && name && projectId.value && !viewApplied.value) {
    loadProjectFeatures(projectId.value)
    const map = ref.getMap()
    if (map) {
      map.on("moveend", onMapMoveEnd)
      map.on("zoomend", onMapMoveEnd)
    }
  }
})

async function loadProjectFeatures(pid: number): Promise<void> {
  try {
    const res = await $fetch<{ featureCollection: GeoJSON.FeatureCollection }>(
      `${apiBase}/api/projects/${pid}/features`
    )
    mapRef.value?.loadData(res.featureCollection)
    store.updateFeatures(res.featureCollection)
    selectedFeature.value = null

    if (initialView.value && !viewApplied.value) {
      viewApplied.value = true
      nextTick(() => {
        mapRef.value?.setView(initialView.value!.lng, initialView.value!.lat, initialView.value!.zoom)
        writeHashView(initialView.value!.lng, initialView.value!.lat, initialView.value!.zoom)
      })
    }

    showStatus(`Loaded: ${projectName.value}`)
  } catch (error) {
    showStatus("Failed to load project features", "error")
  }
}

function handleModeChange(mode: DrawMode): void { activeMode.value = mode }
function handleKindChange(kind: FeatureKind): void { activeKind.value = kind }
function handleMapUpdate(features: GeoJSON.FeatureCollection): void { store.updateFeatures(features) }
function handleMapSelection(feature: SelectedFeatureInfo | null): void { selectedFeature.value = feature }

function handleRefresh(): void {
  loadProjectFeatures(projectId.value)
}

function handleKindStylesChange(styles: KindStyleConfig[]): void {
  store.setKindStyles(styles)
  mapRef.value?.applyKindStyles()
}

function handleLoad(payload: SavedProject): void {
  store.loadFromData(payload)
  selectedFeature.value = null
  mapRef.value?.loadData({ type: "FeatureCollection", features: payload.features })
}

function handleSaveProperties(id: string, properties: FeatureProperties): void {
  mapRef.value?.updateProperties(id, properties)
  if (selectedFeature.value?.id === id) {
    selectedFeature.value = {
      ...selectedFeature.value,
      properties: { ...selectedFeature.value.properties, ...properties }
    }
  }
  showStatus("Properties saved", "success")
}

async function handleSaveMallProfile(_featureId: string, profile: MallProfile): Promise<void> {
  try {
    const pid = projectId.value
    const idNum = Number(_featureId)
    let dbFeatureId: number
    if (Number.isInteger(idNum) && idNum > 0) {
      dbFeatureId = idNum
    } else {
      const feature = store.features.features.find(f => String(f.id) === _featureId)
      if (!feature) { showStatus("Feature not found locally", "error"); return }
      const saveResult = await $fetch<{ featureId: number }>(`${apiBase}/api/projects/${pid}/features`, { method: "POST", body: feature })
      dbFeatureId = saveResult.featureId
      mapRef.value?.updateFeatureId(_featureId, String(dbFeatureId))
    }
    await $fetch(`${apiBase}/api/features/${dbFeatureId}/mall-profile`, {
      method: "PUT",
      body: { name: profile.name, commercialAreaSqm: profile.commercialAreaSqm, floorCount: profile.floorCount, openingDate: profile.openingDate }
    })
    showStatus("Mall profile saved to server", "success")
  } catch (error) {
    showStatus(error instanceof Error ? error.message : "Failed to save mall profile", "error")
  }
}

async function handleFetchPoi(_featureId: string, lat: number, lng: number): Promise<void> {
  try {
    const pid = projectId.value
    showStatus("Fetching nearby POIs from Amap...")
    const result = await $fetch<{ fetched: number; insertedIds: number[] }>(`${apiBase}/api/projects/${pid}/poi/fetch`, {
      method: "POST", body: { lat, lng, radiusMeters: 500, source: "amap" }
    })
    showStatus(`Fetched ${result.fetched} POI(s) from Amap`, "success")
  } catch (error) {
    showStatus(error instanceof Error ? error.message : "POI fetch failed", "error")
  }
}

const drawingHint = computed(() => {
  if (activeMode.value === "select") return ""
  if (activeKind.value === "road") return "Road: click to add waypoints, double-click to finish."
  if (activeKind.value === "parcel_residential") return "Residential (R): click to draw boundary, double-click to close."
  if (activeKind.value === "parcel_public") return "Public (A): click to draw boundary, double-click to close."
  if (activeKind.value === "parcel_commercial") return "Commercial (B): click to draw boundary, double-click to close."
  if (activeKind.value === "parcel_industrial") return "Industrial (M): click to draw boundary, double-click to close."
  if (activeKind.value === "parcel_transport") return "Transport (S): click to draw boundary, double-click to close."
  if (activeKind.value === "parcel_green") return "Green (G): click to draw boundary, double-click to close."
  if (activeKind.value === "parcel_water") return "Water (E): click to draw boundary, double-click to close."
  return "Parcel: click to add polygon vertices, double-click to close."
})

const drawingSubHint = computed(() => "Delete last point: Backspace/Delete or toolbar Delete button while drawing.")

// ===== 底图样式变更 → 保存到 project config =====
function handleBaseStyleChange(styleId: string): void {
  // 本地立即更新
  projectConfig.value = {
    ...projectConfig.value,
    mapStyle: { baseStyleId: styleId }
  }
  // 异步保存到后端
  $fetch(`${apiBase}/api/projects/${projectId.value}`, {
    method: "PATCH",
    body: { config: { mapStyle: { baseStyleId: styleId } } }
  }).catch(() => {})
}

function showStatus(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info'): void {
  statusMessage.value = message
  if (statusTimer) clearTimeout(statusTimer)
  statusTimer = setTimeout(() => { statusMessage.value = ""; statusTimer = null }, 2600)
  toast[type](message)
}

async function handleLocateCenter(): Promise<void> {
  try {
    await mapRef.value?.centerToCurrentLocation()
    showStatus("Centered map to current location", "success")
  } catch (error) {
    showStatus(error instanceof Error ? error.message : "Unable to locate current position", "error")
  }
}

onUnmounted(() => {
  if (statusTimer) { clearTimeout(statusTimer); statusTimer = null }
  if (viewSaveTimer) { clearTimeout(viewSaveTimer); viewSaveTimer = null }
  const view = mapRef.value?.getView()
  if (view) saveViewToBackend(view.lng, view.lat, view.zoom)
})
</script>

<template>
  <main class="h-screen w-screen flex bg-slate-100">
    <DrawToolbar
      :active-mode="activeMode"
      :active-kind="activeKind"
      :allowed-kinds="allowedKinds"
      :kind-styles="store.kindStyles"
      :project-name="projectName"
      :feature-count="store.featureCount"
      :count-by-kind="{
        parcel_residential: store.residentialCount,
        parcel_commercial: store.commercialCount,
        parcel_industrial: store.roadCount,
        road: store.roadCount,
      }"
      @mode-change="handleModeChange"
      @kind-change="handleKindChange"
      @kind-styles-change="handleKindStylesChange"
      @locate="handleLocateCenter"
      @delete-selected="mapRef?.deleteSelected()"
      @clear-all="mapRef?.clearAll(); activeMode = 'select'"
      @save="store.saveToFile()"
      @load="handleLoad"
      @refresh="handleRefresh"
    />

    <section class="relative flex-1">
      <!-- 状态消息 -->
      <div v-if="statusMessage" class="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-slate-900 text-white rounded-lg px-4 py-2 text-xs shadow-lg">
        {{ statusMessage }}
      </div>

      <!-- 地图 -->
      <ClientOnly>
        <MapEditor
          ref="mapRef"
          :active-mode="activeMode"
          :active-kind="activeKind"
          :kind-styles="store.kindStyles"
          :base-style-id="projectBaseStyleId"
          class="w-full h-full"
          @update="handleMapUpdate"
          @select="handleMapSelection"
          @base-style-change="handleBaseStyleChange"
        />
        <template #fallback>
          <div class="h-full w-full grid place-items-center text-slate-400">Loading map...</div>
        </template>
      </ClientOnly>

      <!-- 属性面板 -->
      <FeaturePanel
        :feature="selectedFeature"
        :project-id="projectId"
        @close="selectedFeature = null"
        @save="handleSaveProperties"
        @save-mall-profile="handleSaveMallProfile"
        @fetch-poi="handleFetchPoi"
      />
    </section>
  </main>
</template>

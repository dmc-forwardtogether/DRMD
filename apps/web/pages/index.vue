<script setup lang="ts">
import type { DrawMode, FeatureKind, FeatureProperties, KindStyleConfig, MallProfile, SavedProject, SelectedFeatureInfo } from "~/types"
import { useEditorStore } from "~/store/editor.store"
import { useToast } from "~/composables/useToast"

const store = useEditorStore()
const toast = useToast()
const { public: { apiBase } } = useRuntimeConfig()
const mapRef = ref<{ loadData: (data: GeoJSON.FeatureCollection) => void; updateProperties: (id: string, properties: FeatureProperties) => void; deleteSelected: () => void; clearAll: () => void; applyKindStyles: () => void; centerToCurrentLocation: () => Promise<void>; updateFeatureId: (oldId: string, newId: string) => void } | null>(null)

const activeMode = ref<DrawMode>("select")
const activeKind = ref<FeatureKind>("parcel_commercial")
const selectedFeature = ref<SelectedFeatureInfo | null>(null)
const statusMessage = ref("")
let statusTimer: ReturnType<typeof setTimeout> | null = null

// Project state
interface ProjectItem { id: number; name: string; srid: number; createdAt: string; updatedAt: string }
const projects = ref<ProjectItem[]>([])
const currentProjectId = ref<number | null>(null)
const projectsLoading = ref(false)

async function fetchProjects(): Promise<void> {
  projectsLoading.value = true
  try {
    const res = await $fetch<{ projects: ProjectItem[] }>(`${apiBase}/api/projects`)
    projects.value = res.projects || []
    if (projects.value.length > 0 && currentProjectId.value === null) {
      currentProjectId.value = projects.value[0].id
    }
  } catch (error) {
    console.error("Failed to fetch projects", error)
  } finally {
    projectsLoading.value = false
  }
}

// 当项目ID变更 且 mapRef 就绪时，自动加载features到地图
watch([currentProjectId, mapRef], ([pid, _mapRef]) => {
  if (pid !== null && _mapRef) {
    loadProjectFeatures(pid)
  }
})

async function loadProjectFeatures(projectId: number): Promise<void> {
  try {
    const res = await $fetch<{ featureCollection: GeoJSON.FeatureCollection }>(
      `${apiBase}/api/projects/${projectId}/features`
    )
    mapRef.value?.loadData(res.featureCollection)
    store.updateFeatures(res.featureCollection)
    selectedFeature.value = null
    showStatus(`Loaded project #${projectId}`)
  } catch (error) {
    showStatus("Failed to load project features", "error")
  }
}

async function selectProject(projectId: number): Promise<void> {
  currentProjectId.value = projectId
  // watch 会自动触发 loadProjectFeatures
}

async function createProject(): Promise<void> {
  const name = window.prompt("Project name:", "New Project")
  if (!name) return
  try {
    const res = await $fetch<{ project: ProjectItem }>(`${apiBase}/api/projects`, {
      method: "POST",
      body: { name, srid: 4326 }
    })
    await fetchProjects()
    currentProjectId.value = res.project.id
    showStatus(`Created project: ${res.project.name}`, "success")
  } catch (error) {
    showStatus("Failed to create project", "error")
  }
}

onMounted(() => {
  fetchProjects()
})

const allowedKinds: FeatureKind[] = ["parcel_residential", "parcel_commercial", "parcel_mixed", "road"]

function handleModeChange(mode: DrawMode): void {
  activeMode.value = mode
}

function handleKindChange(kind: FeatureKind): void {
  activeKind.value = kind
}

function handleMapUpdate(features: GeoJSON.FeatureCollection): void {
  store.updateFeatures(features)
}

function handleMapSelection(feature: SelectedFeatureInfo | null): void {
  selectedFeature.value = feature
}

function handleKindStylesChange(styles: KindStyleConfig[]): void {
  store.setKindStyles(styles)
  mapRef.value?.applyKindStyles()
}

function handleLoad(payload: SavedProject): void {
  store.loadFromData(payload)
  selectedFeature.value = null
  mapRef.value?.loadData({
    type: "FeatureCollection",
    features: payload.features
  })
}

function handleSaveProperties(id: string, properties: FeatureProperties): void {
  mapRef.value?.updateProperties(id, properties)
  if (selectedFeature.value?.id === id) {
    selectedFeature.value = {
      ...selectedFeature.value,
      properties: {
        ...selectedFeature.value.properties,
        ...properties
      }
    }
  }
  showStatus("Properties saved", "success")
}

async function handleSaveMallProfile(_featureId: string, profile: MallProfile): Promise<void> {
  try {
    if (!currentProjectId.value) { showStatus("No project selected"); return }
    const pid = currentProjectId.value

    // 检查 feature 是否已有 DB ID（纯数字 ID = 已持久化）
    const idNum = Number(_featureId)
    let dbFeatureId: number
    if (Number.isInteger(idNum) && idNum > 0) {
      dbFeatureId = idNum
    } else {
      const feature = store.features.features.find(f => String(f.id) === _featureId)
      if (!feature) {
        showStatus("Feature not found locally", "error")
        return
      }
      const saveResult = await $fetch<{ featureId: number }>(
        `${apiBase}/api/projects/${pid}/features`,
        { method: "POST", body: feature }
      )
      dbFeatureId = saveResult.featureId
      mapRef.value?.updateFeatureId(_featureId, String(dbFeatureId))
    }

    await $fetch(`${apiBase}/api/features/${dbFeatureId}/mall-profile`, {
      method: "PUT",
      body: { 
        name: profile.name,
        commercialAreaSqm: profile.commercialAreaSqm,
        floorCount: profile.floorCount,
        openingDate: profile.openingDate,
      }
    })
    showStatus("Mall profile saved to server", "success")
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save mall profile"
    showStatus(message, "error")
  }
}

async function handleFetchPoi(_featureId: string, lat: number, lng: number): Promise<void> {
  try {
    if (!currentProjectId.value) { showStatus("No project selected"); return }
    const pid = currentProjectId.value
    showStatus("Fetching nearby POIs from Amap...")

    const result = await $fetch<{ fetched: number; insertedIds: number[] }>(
      `${apiBase}/api/projects/${pid}/poi/fetch`,
      {
        method: "POST",
        body: { lat, lng, radiusMeters: 500, source: "amap" }
      }
    )
    showStatus(`Fetched ${result.fetched} POI(s) from Amap`, "success")
  } catch (error) {
    const message = error instanceof Error ? error.message : "POI fetch failed"
    showStatus(message, "error")
  }
}

const drawingHint = computed(() => {
  if (activeMode.value === "select") {
    return "选择模式：点击要素编辑属性。"
  }
  if (activeKind.value === "road") {
    return "道路：点击添加路径点，双击完成。"
  }
  if (activeKind.value === "parcel_commercial") {
    return "商业地块：点击绘制用地边界，双击闭合完成。"
  }
  if (activeKind.value === "parcel_residential") {
    return "住宅地块：点击绘制用地边界，双击闭合完成。"
  }
  if (activeKind.value === "parcel_mixed") {
    return "混合用地：点击绘制用地边界，双击闭合完成。"
  }
  return "地块：点击添加多边形顶点，双击闭合完成。"
})

const drawingSubHint = computed(() => {
  return "Delete last point: Backspace/Delete or toolbar Delete button while drawing."
})

function showStatus(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info'): void {
  statusMessage.value = message
  if (statusTimer) {
    clearTimeout(statusTimer)
  }
  statusTimer = setTimeout(() => {
    statusMessage.value = ""
    statusTimer = null
  }, 2600)
  toast[type](message)
}

async function handleLocateCenter(): Promise<void> {
  try {
    await mapRef.value?.centerToCurrentLocation()
    showStatus("Centered map to current location", "success")
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to locate current position"
    showStatus(message, "error")
  }
}

onUnmounted(() => {
  if (statusTimer) {
    clearTimeout(statusTimer)
    statusTimer = null
  }
})
</script>

<template>
  <main class="h-screen w-screen flex bg-slate-100">
    <DrawToolbar
      :active-mode="activeMode"
      :active-kind="activeKind"
      :allowed-kinds="allowedKinds"
      :kind-styles="store.kindStyles"
      @mode-change="handleModeChange"
      @kind-change="handleKindChange"
      @kind-styles-change="handleKindStylesChange"
      @locate="handleLocateCenter"
      @delete-selected="mapRef?.deleteSelected()"
      @clear-all="
        mapRef?.clearAll();
        activeMode = 'select'
      "
      @save="store.saveToFile()"
      @load="handleLoad"
    />

    <section class="relative flex-1">
      <!-- 顶部栏：项目选择 + 统计 -->
      <div class="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-white/95 border border-slate-200 rounded-xl shadow-panel px-4 py-2 flex items-center gap-3">
        <!-- Project 切换下拉 -->
        <select
          :value="currentProjectId ?? ''"
          class="text-sm font-medium bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 outline-none cursor-pointer"
          @change="selectProject(Number(($event.target as HTMLSelectElement).value))"
        >
          <option value="" disabled>Select Project</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button
          class="text-xs text-blue-600 hover:text-blue-800 font-medium"
          @click="createProject"
        >+ New</button>

        <span class="text-slate-300">|</span>
        <input
          v-model="store.projectName"
          class="text-sm font-medium bg-transparent border-b border-slate-200 focus:border-slate-900 outline-none px-1 w-32"
          maxlength="40"
          placeholder="Layer name"
        />
        <span class="text-xs text-slate-500">Total: {{ store.featureCount }}</span>
        <span class="text-xs text-emerald-600">住: {{ store.residentialCount }}</span>
        <span class="text-xs text-teal-600">商: {{ store.commercialCount }}</span>
        <span class="text-xs text-violet-600">混: {{ store.mixedCount }}</span>
        <span class="text-xs text-orange-600">路: {{ store.roadCount }}</span>
        <span class="text-slate-300">|</span>
        <NuxtLink to="/buildings" class="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1">
          🏢 建筑中心
        </NuxtLink>
        <NuxtLink to="/commercial" class="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
          🏷️ 商业中心
        </NuxtLink>
      </div>

      <div class="absolute top-20 left-1/2 -translate-x-1/2 z-20 bg-white/95 border border-amber-200 rounded-xl shadow-panel px-4 py-2 text-xs text-slate-700 min-w-[380px]">
        <p class="font-medium text-amber-700">{{ drawingHint }}</p>
        <p class="text-slate-500 mt-0.5">{{ drawingSubHint }}</p>
      </div>

      <div
        v-if="statusMessage"
        class="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-slate-900 text-white rounded-lg px-4 py-2 text-xs shadow-lg"
      >
        {{ statusMessage }}
      </div>

      <ClientOnly>
        <MapEditor
          ref="mapRef"
          :active-mode="activeMode"
          :active-kind="activeKind"
          :kind-styles="store.kindStyles"
          class="w-full h-full"
          @update="handleMapUpdate"
          @select="handleMapSelection"
        />
        <template #fallback>
          <div class="h-full w-full grid place-items-center text-slate-400">Loading map...</div>
        </template>
      </ClientOnly>

      <FeaturePanel
        :feature="selectedFeature"
        :project-id="currentProjectId"
        @close="selectedFeature = null"
        @save="handleSaveProperties"
        @save-mall-profile="handleSaveMallProfile"
        @fetch-poi="handleFetchPoi"
      />
    </section>
  </main>
</template>

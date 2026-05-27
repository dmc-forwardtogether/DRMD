<script setup lang="ts">
import { MapPin, Crosshair, Globe, Loader2 } from "lucide-vue-next"
import type { BBox, ProjectCreateRequest, ProjectCreateResponse } from "@drmd/shared-types"

const props = defineProps<{
  visible: boolean
  loading: boolean
  error: string
}>()

const emit = defineEmits<{
  (e: "close"): void
  (e: "created", response: ProjectCreateResponse): void
}>()

const { public: { apiBase } } = useRuntimeConfig()

// Tab 状态
type CreateTab = "district" | "bbox"
const activeTab = ref<CreateTab>("district")

// 表单数据
const projectName = ref("")
const selectedDistrict = ref("")
const districtSearch = ref("")
const bbox = ref<BBox>({ south: 0, west: 0, north: 0, east: 0 })
const includeBuildings = ref(true)
const includeLanduse = ref(true)
const localError = ref("")

// 已知城市列表
const CITIES = [
  { key: "beijing", name: "北京市", province: "北京" },
  { key: "shanghai", name: "上海市", province: "上海" },
  { key: "guangzhou", name: "广州市", province: "广东" },
  { key: "shenzhen", name: "深圳市", province: "广东" },
  { key: "chengdu", name: "成都市", province: "四川" },
  { key: "hangzhou", name: "杭州市", province: "浙江" },
  { key: "wuhan", name: "武汉市", province: "湖北" },
  { key: "nanjing", name: "南京市", province: "江苏" },
  { key: "chongqing", name: "重庆市", province: "重庆" },
  { key: "xian", name: "西安市", province: "陕西" },
  { key: "tianjin", name: "天津市", province: "天津" },
  { key: "suzhou", name: "苏州市", province: "江苏" },
  { key: "changsha", name: "长沙市", province: "湖南" },
  { key: "zhengzhou", name: "郑州市", province: "河南" },
  { key: "jinan", name: "济南市", province: "山东" },
  { key: "qingdao", name: "青岛市", province: "山东" },
  { key: "dalian", name: "大连市", province: "辽宁" },
  { key: "xiamen", name: "厦门市", province: "福建" },
  { key: "fuzhou", name: "福州市", province: "福建" },
  { key: "kunming", name: "昆明市", province: "云南" }
]

const filteredCities = computed(() => {
  const q = districtSearch.value.trim().toLowerCase()
  if (!q) return CITIES
  return CITIES.filter(
    (c) => c.name.includes(q) || c.key.includes(q) || c.province.includes(q)
  )
})

function selectCity(key: string, name: string): void {
  selectedDistrict.value = key
  districtSearch.value = name
  if (!projectName.value) {
    projectName.value = name
  }
}

// BBox 快捷预设
function useBBoxPreset(preset: string): void {
  const presets: Record<string, BBox> = {
    beijing_center: { south: 39.85, west: 116.30, north: 39.98, east: 116.50 },
    shanghai_center: { south: 31.18, west: 121.40, north: 31.30, east: 121.55 },
    shenzhen_nanshan: { south: 22.48, west: 113.90, north: 22.55, east: 113.98 }
  }
  const preset_bbox = presets[preset]
  if (preset_bbox) {
    bbox.value = { ...preset_bbox }
  }
}

async function handleCreate(): Promise<void> {
  localError.value = ""

  if (!projectName.value.trim()) {
    localError.value = "Please enter a project name"
    return
  }

  const payload: ProjectCreateRequest = {
    name: projectName.value.trim(),
    srid: 4326,
    importOsm: true,
    osmOptions: {
      includeBuildings: includeBuildings.value,
      includeLanduse: includeLanduse.value
    }
  }

  if (activeTab.value === "district") {
    if (!selectedDistrict.value) {
      localError.value = "Please select a city"
      return
    }
    payload.sourceType = "admin_district"
    payload.districtCode = selectedDistrict.value
  } else {
    const { south, west, north, east } = bbox.value
    if (south === 0 && west === 0 && north === 0 && east === 0) {
      localError.value = "Please enter valid coordinates"
      return
    }
    if (south >= north || west >= east) {
      localError.value = "Invalid bounds: south < north, west < east"
      return
    }
    payload.sourceType = "bbox"
    payload.bbox = { south, west, north, east }
  }

  try {
    const response = await $fetch<ProjectCreateResponse>(`${apiBase}/api/projects`, {
      method: "POST",
      body: payload
    })
    emit("created", response)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project creation failed"
    localError.value = message
  }
}

function handleClose(): void {
  localError.value = ""
  emit("close")
}

// Reset form when dialog opens
watch(() => props.visible, (v) => {
  if (v) {
    projectName.value = ""
    selectedDistrict.value = ""
    districtSearch.value = ""
    bbox.value = { south: 0, west: 0, north: 0, east: 0 }
    localError.value = ""
    activeTab.value = "district"
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center"
    >
      <!-- Backdrop -->
      <div
        class="absolute inset-0 bg-black/40 backdrop-blur-sm"
        @click="handleClose"
      />

      <!-- Dialog -->
      <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <!-- Header -->
        <div class="px-6 pt-6 pb-4">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Globe class="w-5 h-5 text-blue-600" />
              New Project
            </h2>
            <button
              class="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              @click="handleClose"
            >✕</button>
          </div>
        </div>

        <!-- Tabs -->
        <div class="px-6 flex border-b border-slate-200">
          <button
            class="pb-3 px-4 -mb-px text-sm font-medium transition-colors border-b-2"
            :class="activeTab === 'district'
              ? 'text-blue-600 border-blue-600'
              : 'text-slate-500 border-transparent hover:text-slate-700'"
            @click="activeTab = 'district'"
          >
            <MapPin class="w-4 h-4 inline mr-1.5" />
            By District
          </button>
          <button
            class="pb-3 px-4 -mb-px text-sm font-medium transition-colors border-b-2"
            :class="activeTab === 'bbox'
              ? 'text-blue-600 border-blue-600'
              : 'text-slate-500 border-transparent hover:text-slate-700'"
            @click="activeTab = 'bbox'"
          >
            <Crosshair class="w-4 h-4 inline mr-1.5" />
            By Bounding Box
          </button>
        </div>

        <!-- Body -->
        <div class="px-6 py-4 space-y-4">
          <!-- Project Name -->
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1.5">Project Name</label>
            <input
              v-model="projectName"
              type="text"
              placeholder="e.g. Shenzhen Nanshan Tech Park"
              maxlength="80"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>

          <!-- District Tab -->
          <div v-if="activeTab === 'district'">
            <label class="block text-xs font-medium text-slate-600 mb-1.5">Select City</label>
            <input
              v-model="districtSearch"
              type="text"
              placeholder="Search cities..."
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none mb-2"
            />
            <div class="max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
              <button
                v-for="city in filteredCities"
                :key="city.key"
                class="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors flex items-center justify-between"
                :class="selectedDistrict === city.key ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'"
                @click="selectCity(city.key, city.name)"
              >
                <span>{{ city.name }}</span>
                <span class="text-xs text-slate-400">{{ city.province }}</span>
              </button>
              <div
                v-if="filteredCities.length === 0"
                class="px-3 py-4 text-center text-sm text-slate-400"
              >
                No matching cities. Try Bounding Box instead.
              </div>
            </div>
            <p class="text-xs text-slate-400 mt-1.5">
              DRMD will auto-import roads, buildings, and parcels from OpenStreetMap for the selected city.
            </p>
          </div>

          <!-- BBox Tab -->
          <div v-if="activeTab === 'bbox'">
            <p class="text-xs text-slate-500 mb-3">
              Define the project area by entering lat/lng bounds. You can refine the area in the editor later.
            </p>

            <!-- Quick presets -->
            <div class="flex gap-2 mb-3">
              <button
                v-for="preset in [
                  { key: 'beijing_center', label: 'Beijing Center' },
                  { key: 'shanghai_center', label: 'Shanghai Center' },
                  { key: 'shenzhen_nanshan', label: 'Shenzhen Nanshan' }
                ]"
                :key="preset.key"
                class="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
                @click="useBBoxPreset(preset.key)"
              >{{ preset.label }}</button>
            </div>

            <div class="grid grid-cols-2 gap-2.5">
              <div>
                <label class="block text-xs text-slate-500 mb-1">南 (South)</label>
                <input
                  v-model.number="bbox.south"
                  type="number"
                  step="0.01"
                  placeholder="22.48"
                  class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">北 (North)</label>
                <input
                  v-model.number="bbox.north"
                  type="number"
                  step="0.01"
                  placeholder="22.55"
                  class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">西 (West)</label>
                <input
                  v-model.number="bbox.west"
                  type="number"
                  step="0.01"
                  placeholder="113.90"
                  class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">东 (East)</label>
                <input
                  v-model.number="bbox.east"
                  type="number"
                  step="0.01"
                  placeholder="113.98"
                  class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          <!-- OSM Options -->
          <div class="border-t border-slate-100 pt-3">
            <p class="text-xs font-medium text-slate-600 mb-2">OSM Import Options</p>
            <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer mb-2">
              <input
                v-model="includeBuildings"
                type="checkbox"
                class="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Import building footprints
            </label>
            <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                v-model="includeLanduse"
                type="checkbox"
                class="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Import land use (auto-generate parcels)
            </label>
          </div>

          <!-- Error -->
          <div
            v-if="localError || error"
            class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700"
          >
            {{ localError || error }}
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
          <button
            class="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium transition-colors"
            @click="handleClose"
          >
            Cancel
          </button>
          <button
            class="px-5 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            :disabled="loading"
            @click="handleCreate"
          >
            <Loader2 v-if="loading" class="w-4 h-4 animate-spin" />
            <span>{{ loading ? 'Creating...' : 'Create Project' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

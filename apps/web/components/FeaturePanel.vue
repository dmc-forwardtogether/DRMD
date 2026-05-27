<script setup lang="ts">
import { X } from "lucide-vue-next"
import type { FeatureKind, FeatureProperties, MallProfile, PoiCategory, SelectedFeatureInfo, Structure, Entity, Brand } from "~/types"
import { useEditorStore } from "~/store/editor.store"
import { useToast } from "~/composables/useToast"
import AppIcon from "~/components/AppIcon.vue"
import { subtypeIcon, subtypeLabel, kindIcon, kindLabel as kindLabelUtil } from "~/utils/icons"

const toast = useToast()

const props = defineProps<{
  feature: SelectedFeatureInfo | null
  projectId: number | string | null
}>()

const emit = defineEmits<{
  (e: "close"): void
  (e: "save", id: string, properties: FeatureProperties): void
  (e: "save-mall-profile", featureId: string, profile: MallProfile): void
  (e: "fetch-poi", featureId: string, lat: number, lng: number): void
}>()

const { public: { apiBase } } = useRuntimeConfig()

// ===== Tab state =====
type PanelTab = "properties" | "config" | "scores" | "children"
const activeTab = ref<PanelTab>("properties")
const statusMsg = ref("")
let statusTimer: ReturnType<typeof setTimeout> | null = null

function showStatus(msg: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  statusMsg.value = msg
  if (statusTimer) clearTimeout(statusTimer)
  statusTimer = setTimeout(() => { statusMsg.value = "" }, 2600)
  toast[type](msg)
}

// ===== Basic properties =====
const name = ref("")
const description = ref("")
const kind = ref<FeatureKind>("parcel_residential")
const speedKph = ref(30)
const capacity = ref(1000)
const oneWay = ref(false)
const isRoadKind = computed(() => kind.value === "road")
const isCommercialKind = computed(() => kind.value === "commercial" || kind.value === "parcel_commercial")
const isPoiKind = computed(() => kind.value === "poi")

// Mall profile fields
const commercialAreaSqm = ref<number | undefined>()
const floorCount = ref<number | undefined>()
const openingDate = ref("")

// POI fields
const poiCategoryId = ref<number | undefined>()
const poiSource = ref("")
const categories = ref<PoiCategory[]>([])

// ===== Structure config =====
const structure = ref<Structure | null>(null)
const structureLoading = ref(false)
const entities = ref<Entity[]>([])
const brands = ref<Brand[]>([])
const filteredBrands = computed(() => {
  const eid = selectedOperatorEntityId.value
  if (!eid) return brands.value
  return brands.value.filter(b => b.entityId === eid)
})

const selectedStructureType = ref<"constructed" | "natural" | "hybrid">("constructed")
const selectedStructureSubtype = ref("")
const selectedBrandId = ref<number | undefined>()
const selectedOperatorEntityId = ref<number | undefined>()
const selectedOwnerEntityId = ref<number | undefined>()
const selectedParentStructureId = ref<number | undefined>()

// Parent structure picker - fetch all structures for the project
const parentStructureOptions = ref<{ id: number; name: string; subtype: string }[]>([])

// Link to existing structure
const linkStructureId = ref<number | undefined>()
const linkSaving = ref(false)
const allStructureOptions = ref<{ id: number; name: string; subtype: string; brandName?: string }[]>([])

const structureSubtypes = [
  { value: "mall", label: "Mall" }, { value: "road", label: "Road" },
  { value: "school", label: "School" }, { value: "park", label: "Park" },
  { value: "river", label: "Waterway" }, { value: "office", label: "Office" },
  { value: "residential", label: "Residential" }, { value: "shop", label: "Shop" },
  { value: "other", label: "Other" },
]
const structureTypes = [
  { value: "constructed" as const, label: "Constructed" },
  { value: "natural" as const, label: "Natural" },
  { value: "hybrid" as const, label: "Hybrid" },
]

// ===== Create Building Dialog =====
const showCreateBuildingDialog = ref(false)
const createBuildingForm = reactive({
  name: "",
  structureType: "constructed" as "constructed" | "natural" | "hybrid",
  structureSubtype: "" as string,
  brandId: undefined as number | undefined,
  operatorEntityId: undefined as number | undefined,
  ownerEntityId: undefined as number | undefined,
})
const createBuildingSaving = ref(false)

// Quick-create subtypes filtered by parcel kind
const suggestedSubtypes = computed(() => {
  if (kind.value === "parcel_commercial" || kind.value === "commercial") {
    return [
      { value: "mall", label: "商场", desc: "Shopping complex" },
      { value: "office", label: "写字楼", desc: "Office building" },
      { value: "shop", label: "店铺", desc: "Retail store" },
    ]
  }
  if (kind.value === "parcel_residential" || kind.value === "residential") {
    return [
      { value: "residential", label: "住宅", desc: "Residential building" },
      { value: "shop", label: "零售", desc: "Ground-floor retail" },
    ]
  }
  if (kind.value === "parcel_mixed") {
    return [
      { value: "mall", label: "商场", desc: "Shopping complex" },
      { value: "office", label: "写字楼", desc: "Office building" },
      { value: "residential", label: "住宅", desc: "Residential building" },
      { value: "shop", label: "店铺", desc: "Retail store" },
    ]
  }
  if (kind.value === "road") {
    return [{ value: "road", label: "道路", desc: "Traffic route" }]
  }
  return structureSubtypes.map(s => ({ value: s.value, label: s.label, desc: "" }))
})

function openCreateBuildingDialog(): void {
  createBuildingForm.name = name.value || ""
  createBuildingForm.structureType = "constructed"
  createBuildingForm.structureSubtype = ""
  createBuildingForm.brandId = undefined
  createBuildingForm.operatorEntityId = undefined
  createBuildingForm.ownerEntityId = undefined
  showCreateBuildingDialog.value = true
}

async function confirmCreateBuilding(): Promise<void> {
  if (!createBuildingForm.structureSubtype) {
    showStatus("请选择建筑类型", "warning")
    return
  }
  createBuildingSaving.value = true
  try {
    // Sync form fields to the main config refs
    selectedStructureType.value = createBuildingForm.structureType
    selectedStructureSubtype.value = createBuildingForm.structureSubtype
    selectedBrandId.value = createBuildingForm.brandId
    selectedOperatorEntityId.value = createBuildingForm.operatorEntityId
    selectedOwnerEntityId.value = createBuildingForm.ownerEntityId
    await saveStructureConfig()
    showCreateBuildingDialog.value = false
    showStatus("建筑已创建！", "success")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    showStatus(`创建失败: ${msg}`, "error")
  } finally {
    createBuildingSaving.value = false
  }
}

// ===== Scores =====
const latestScore = ref<any>(null)
const scoresLoading = ref(false)

// ===== Children =====
const childrenList = ref<any[]>([])
const childrenLoading = ref(false)

// 缓存 entities/brands 避免重复请求
let entitiesCache: Entity[] | null = null
let brandsCache: Brand[] | null = null

async function ensureEntitiesBrands(): Promise<void> {
  if (!entitiesCache || !brandsCache) {
    const [entResp, brandResp] = await Promise.all([
      $fetch<Entity[]>(`${apiBase}/api/config/entities`).catch(() => [] as Entity[]),
      $fetch<Brand[]>(`${apiBase}/api/config/brands`).catch(() => [] as Brand[]),
    ])
    entitiesCache = entResp
    brandsCache = brandResp
  }
  entities.value = entitiesCache
  brands.value = brandsCache
}

// ===== Watch feature → load basic data =====
watch(
  () => props.feature,
  async (f) => {
    if (!f) {
      structure.value = null
      latestScore.value = null
      childrenList.value = []
      activeTab.value = "properties"
      return
    }

    // Basic properties
    const source = f.properties || {}
    name.value = String(source.name || "")
    description.value = String(source.description || "")
    kind.value = (source.kind as FeatureKind) || "residential"
    speedKph.value = Number(source.speedKph ?? 30)
    capacity.value = Number(source.capacity ?? 1000)
    oneWay.value = Boolean(source.oneWay ?? false)

    const mp = source.mallProfile as MallProfile | undefined
    commercialAreaSqm.value = mp?.commercialAreaSqm ?? undefined
    floorCount.value = mp?.floorCount ?? undefined
    openingDate.value = mp?.openingDate ?? ""

    poiCategoryId.value = source.poiCategoryId as number | undefined
    poiSource.value = (source.poiSource || "manual") as string

    // Load structure + config data (without scores/children)
    await loadStructureData(f.id)
  },
  { immediate: true }
)

async function loadStructureData(featureId: string) {
  structureLoading.value = true
  try {
    const s = await $fetch<Structure | null>(`${apiBase}/api/features/${featureId}/structure`)
    structure.value = s

    if (s) {
      selectedStructureType.value = s.structureType
      selectedStructureSubtype.value = s.structureSubtype
      // DB returns null for empty fields → convert to undefined for select matching
      selectedBrandId.value = s.brandId ?? undefined
      selectedOperatorEntityId.value = s.operatorEntityId ?? undefined
      selectedOwnerEntityId.value = s.ownerEntityId ?? undefined
      selectedParentStructureId.value = s.parentStructureId ?? undefined
    } else {
      // No structure yet — don't auto-default, let user choose via dialog
      selectedStructureType.value = "constructed"
      selectedStructureSubtype.value = ""
      selectedBrandId.value = undefined
      selectedOperatorEntityId.value = undefined
      selectedOwnerEntityId.value = undefined
      selectedParentStructureId.value = undefined
    }

    // Fetch parent structure options (from same project)
    try {
      const pid = Number(props.projectId)
      if (pid) {
        const allStructs = await $fetch<any[]>(`${apiBase}/api/config/structures?projectId=${pid}`)
        const opts = (allStructs || []).map((s: any) => ({
          id: s.id, name: s.name || `#${s.id}`, subtype: s.structureSubtype, brandName: s.brandName
        }))
        allStructureOptions.value = opts
        parentStructureOptions.value = opts.filter((s: any) => s.id !== structure.value?.id)
        linkStructureId.value = structure.value?.id
      }
    } catch { parentStructureOptions.value = []; allStructureOptions.value = [] }

    // 延迟加载：scores 和 children 在 tab 切换时按需加载
    latestScore.value = null
    childrenList.value = []

    // 缓存 entities/brands（首次）
    await ensureEntitiesBrands()
  } catch {
    structure.value = null
  } finally {
    structureLoading.value = false
  }
}

// 按需加载 scores
watch(activeTab, async (tab) => {
  if (tab === "scores" && structure.value?.id && !latestScore.value) {
    scoresLoading.value = true
    try {
      const score = await $fetch(`${apiBase}/api/config/structures/${structure.value.id}/scores/latest`)
      latestScore.value = score
    } catch { latestScore.value = null }
    scoresLoading.value = false
  }
  if (tab === "children" && structure.value?.id && childrenList.value.length === 0) {
    if (!props.feature) return
    childrenLoading.value = true
    try {
      const kids = await $fetch<any[]>(`${apiBase}/api/features/${props.feature.id}/structure/children`)
      childrenList.value = kids || []
    } catch { childrenList.value = [] }
    childrenLoading.value = false
  }
})

onMounted(async () => {
  try {
    const res = await $fetch<{ categories: PoiCategory[] }>(`${apiBase}/api/poi-categories`)
    categories.value = res.categories || []
  } catch { /* API not available yet */ }
})

// ===== Save handlers =====
function saveProperties() {
  if (!props.feature) return
  const roadProps = isRoadKind.value
    ? { speedKph: speedKph.value, capacity: capacity.value, oneWay: oneWay.value }
    : { speedKph: undefined, capacity: undefined, oneWay: undefined }

  emit("save", props.feature.id, {
    ...props.feature.properties,
    name: name.value,
    description: description.value,
    kind: kind.value,
    ...roadProps,
    poiCategoryId: isPoiKind.value ? poiCategoryId.value : undefined,
    poiSource: (isPoiKind.value ? poiSource.value || "manual" : undefined) as import("~/types").PoiSource | undefined
  })

  if (isCommercialKind.value) {
    emit("save-mall-profile", props.feature.id, {
      featureId: Number(props.feature.id),
      commercialAreaSqm: commercialAreaSqm.value,
      floorCount: floorCount.value,
      openingDate: openingDate.value || undefined
    })
  }
  showStatus("属性已保存", "success")
}

async function saveStructureConfig() {
  if (!props.feature || !props.projectId) return
  if (!selectedStructureSubtype.value) {
    showStatus("请选择建筑类型", "warning")
    return
  }
  const pid = Number(props.projectId)
  if (!pid) return
  try {
    // 品牌关联的企业 → 自动填充运营主体/业主方（如用户已手动选择则保留用户值）
    const brandEntityId = selectedBrandId.value
      ? brands.value.find(b => b.id === selectedBrandId.value)?.entityId
      : undefined
    const operatorId = selectedOperatorEntityId.value ?? brandEntityId ?? null
    const ownerId = selectedOwnerEntityId.value ?? brandEntityId ?? null

    await $fetch(`${apiBase}/api/features/${props.feature.id}/structure`, {
      method: "PUT",
      body: {
        projectId: pid,
        structureType: selectedStructureType.value,
        structureSubtype: selectedStructureSubtype.value,
        name: name.value || undefined,
        brandId: selectedBrandId.value ?? null,
        operatorEntityId: operatorId,
        ownerEntityId: ownerId,
        parentStructureId: selectedParentStructureId.value ?? null,
      }
    })
    showStatus("建筑配置已保存", "success")
    await loadStructureData(props.feature.id)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    showStatus(`保存失败: ${msg}`, "error")
  }
}

async function linkToExistingStructure() {
  if (!props.feature || !linkStructureId.value || !props.projectId) return
  linkSaving.value = true
  try {
    // Ensure the feature is saved to DB and has a numeric ID
    let dbFeatureId = Number(props.feature.id)
    if (!Number.isInteger(dbFeatureId) || dbFeatureId <= 0) {
      // Feature has a temporary ID (e.g., Mapbox Draw UUID) → save to DB first
      const pid = Number(props.projectId)
      const store = useEditorStore()
      const mapFeature = store.features.features.find(
        (f: any) => String(f.id) === props.feature!.id
      )
      if (!mapFeature) {
        showStatus("关联失败：未找到地图要素，请先保存属性", "error")
        linkSaving.value = false
        return
      }
      const saveResult = await $fetch<{ featureId: number }>(
        `${apiBase}/api/projects/${pid}/features`,
        { method: "POST", body: mapFeature }
      )
      dbFeatureId = saveResult.featureId
      showStatus("要素已保存，正在关联...", "info")
    }

    const structId = linkStructureId.value
    const existing = await $fetch<any>(`${apiBase}/api/config/structures/${structId}`)
    const pid = Number(props.projectId)

    await $fetch(`${apiBase}/api/config/structures/${structId}`, {
      method: "PUT",
      body: {
        projectId: pid,
        structureType: existing.structureType,
        structureSubtype: existing.structureSubtype,
        name: existing.name,
        brandId: existing.brandId != null ? Number(existing.brandId) : null,
        operatorEntityId: existing.operatorEntityId != null ? Number(existing.operatorEntityId) : null,
        ownerEntityId: existing.ownerEntityId != null ? Number(existing.ownerEntityId) : null,
        parentStructureId: existing.parentStructureId != null ? Number(existing.parentStructureId) : null,
        featureId: dbFeatureId,
      }
    })

    // Clear previous link
    const prevLinked = structure.value
    if (prevLinked && prevLinked.id !== structId) {
      try {
        await $fetch(`${apiBase}/api/config/structures/${prevLinked.id}`, {
          method: "PUT",
          body: {
            projectId: Number(prevLinked.projectId),
            structureType: prevLinked.structureType,
            structureSubtype: prevLinked.structureSubtype,
            name: prevLinked.name,
            brandId: prevLinked.brandId != null ? Number(prevLinked.brandId) : null,
            operatorEntityId: prevLinked.operatorEntityId != null ? Number(prevLinked.operatorEntityId) : null,
            ownerEntityId: prevLinked.ownerEntityId != null ? Number(prevLinked.ownerEntityId) : null,
            parentStructureId: prevLinked.parentStructureId != null ? Number(prevLinked.parentStructureId) : null,
            featureId: null,
          }
        })
      } catch { /* best effort */ }
    }

    showStatus("已关联到现有建筑", "success")
    // Reload with the new DB feature ID
    await loadStructureData(String(dbFeatureId))
  } catch (e) {
    showStatus("关联失败: " + (e instanceof Error ? e.message : "未知错误"), "error")
  }
  linkSaving.value = false
}

function handleFetchPoi() {
  if (!props.feature) return
  const coords = props.feature.measurement.coordinates
  if (!coords) return
  emit("fetch-poi", props.feature.id, coords[1], coords[0])
}

// ===== Formatters =====
function formatArea(v: number): string {
  if (v > 1_000_000) return `${(v / 1_000_000).toFixed(2)} km²`
  return `${v.toFixed(1)} m²`
}
function formatLength(v: number): string {
  if (v >= 1) return `${v.toFixed(3)} km`
  return `${(v * 1000).toFixed(1)} m`
}
function kindLabel(k: string): string {
  const m: Record<string, string> = {
    "parcel_residential": "住宅用地 (R)",
    "parcel_public": "公共管理用地 (A)",
    "parcel_commercial": "商业用地 (B)",
    "parcel_industrial": "工业用地 (M)",
    "parcel_transport": "交通枢纽用地 (S)",
    "parcel_green": "绿地广场用地 (G)",
    "parcel_water": "水域特殊用地 (E)",
    "residential": "住宅区(旧)",
    "commercial": "商业体(旧)",
    "road": "道路",
    "poi": "POI"
  }
  return m[k] || k
}
function entityLabel(e: Entity): string {
  return `${e.name} (${e.type})`
}
</script>

<template>
  <aside
    v-if="feature"
    class="absolute right-4 top-4 bottom-4 w-80 bg-white rounded-xl border border-slate-200 shadow-panel flex flex-col overflow-hidden z-30"
  >
    <!-- Header -->
    <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
      <div class="min-w-0">
        <p class="text-xs text-slate-400 uppercase tracking-wider">{{ kindLabel(feature.properties?.kind || "") }}</p>
        <p class="text-sm font-semibold text-slate-700 truncate">{{ name || "未命名" }}</p>
      </div>
      <button class="text-slate-400 hover:text-slate-700 ml-2 shrink-0" @click="emit('close')">
        <X class="w-4 h-4" />
      </button>
    </div>

    <!-- Measurement -->
    <div class="px-4 py-2 border-b border-slate-50 shrink-0">
      <div class="rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-0.5">
        <span v-if="feature.measurement.areaSqm !== undefined">📐 {{ formatArea(feature.measurement.areaSqm) }}</span>
        <span v-if="feature.measurement.lengthKm !== undefined">📏 {{ formatLength(feature.measurement.lengthKm) }}</span>
        <span>{{ feature.geometryType }}</span>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-slate-100 shrink-0">
      <button
        v-for="tab in [
          { key: 'properties' as PanelTab, label: '属性', iconName: 'entity' },
          { key: 'config' as PanelTab, label: '配置', iconName: 'mall' },
          { key: 'scores' as PanelTab, label: '评分', iconName: 'score' },
          { key: 'children' as PanelTab, label: '子项', iconName: 'shop' },
        ]"
        :key="tab.key"
        class="flex-1 py-2 text-xs font-medium transition-colors border-b-2 flex items-center justify-center gap-1"
        :class="activeTab === tab.key
          ? 'border-slate-900 text-slate-900'
          : 'border-transparent text-slate-400 hover:text-slate-600'"
        @click="activeTab = tab.key"
      >
        <AppIcon :name="tab.iconName" :size="13" /> {{ tab.label }}
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto px-4 py-3 space-y-3">

      <!-- TAB: 属性 -->
      <template v-if="activeTab === 'properties'">
        <label class="text-xs text-slate-500">名称</label>
        <input v-model="name" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" type="text" />

        <label class="text-xs text-slate-500">描述</label>
        <textarea v-model="description" rows="2" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />

        <label class="text-xs text-slate-500">类型</label>
        <select v-model="kind" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <option value="parcel_residential">住宅用地 Residential (R)</option>
          <option value="parcel_public">公共管理用地 Public (A)</option>
          <option value="parcel_commercial">商业用地 Commercial (B)</option>
          <option value="parcel_industrial">工业用地 Industrial (M)</option>
          <option value="parcel_transport">交通枢纽用地 Transport (S)</option>
          <option value="parcel_green">绿地广场用地 Green (G)</option>
          <option value="parcel_water">水域特殊用地 Water (E)</option>
          <option value="road">道路 Road</option>
          <option value="poi">POI</option>
        </select>

        <template v-if="isCommercialKind">
          <div class="border-t border-slate-100 pt-3 mt-1">
            <p class="text-xs font-semibold text-slate-500 uppercase mb-2">商场属性</p>
            <label class="text-xs text-slate-500">商业面积 (m²)</label>
            <input v-model.number="commercialAreaSqm" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" type="number" min="0" placeholder="e.g. 50000" />
            <label class="text-xs text-slate-500 mt-2 block">楼层数</label>
            <input v-model.number="floorCount" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" type="number" min="1" max="20" placeholder="e.g. 5" />
            <label class="text-xs text-slate-500 mt-2 block">开业时间</label>
            <input v-model="openingDate" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" type="date" />
          </div>
          <!-- 高德 POI 获取功能已暂时禁用 -->
          <div v-if="feature.properties.childFeatureIds?.length" class="text-xs text-slate-400 pt-1">
            {{ feature.properties.childFeatureIds.length }} POI(s) 已挂载
          </div>
        </template>

        <template v-if="isRoadKind">
          <label class="text-xs text-slate-500">速度 (kph)</label>
          <input v-model.number="speedKph" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" type="number" min="1" max="180" />
          <label class="text-xs text-slate-500">容量</label>
          <input v-model.number="capacity" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" type="number" min="1" />
          <label class="flex items-center gap-2 text-xs text-slate-600">
            <input v-model="oneWay" type="checkbox" /> 单行道
          </label>
        </template>

        <template v-if="isPoiKind">
          <label class="text-xs text-slate-500">POI 分类</label>
          <select v-model.number="poiCategoryId" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option :value="undefined">-- 选择分类 --</option>
            <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
          <div v-if="poiSource" class="text-xs text-slate-400 mt-1">来源: {{ poiSource }}</div>
        </template>

        <button class="w-full rounded-lg bg-slate-900 text-white py-2 text-sm font-medium hover:bg-slate-800 mt-2" @click="saveProperties">
          保存属性
        </button>
      </template>

      <!-- TAB: 配置 -->
      <template v-if="activeTab === 'config'">
        <!-- Link to existing structure -->
        <div class="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
          <p class="text-xs font-semibold text-blue-700 mb-2">🔗 关联已有建筑</p>
          <select
            v-model="linkStructureId"
            class="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option :value="undefined">-- 选择已有建筑 --</option>
            <option v-for="s in allStructureOptions" :key="s.id" :value="s.id">
              {{ s.name || '#' + s.id }} [{{ s.subtype }}]{{ s.brandName ? ' · ' + s.brandName : '' }}
            </option>
          </select>
          <button
            class="w-full rounded-lg bg-blue-600 text-white py-1.5 text-xs font-medium hover:bg-blue-700 mt-2 disabled:opacity-50"
            :disabled="!linkStructureId || linkSaving"
            @click="linkToExistingStructure"
          >
            {{ linkSaving ? '关联中...' : '关联到此建筑' }}
          </button>
          <p class="text-xs text-blue-500 mt-1">
            选择已有建筑记录，将当前地图要素关联上去
          </p>
        </div>

        <div v-if="structureLoading" class="text-xs text-slate-400 text-center py-2">加载中...</div>
        <template v-else>
          <div v-if="structure" class="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2 mb-1">
            ✅ 已关联 Structure #{{ structure.id }}
          </div>
          <!-- No structure yet: show prominent CTA -->
          <div v-else class="rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/50 p-4 text-center mb-3">
            <p class="text-sm font-semibold text-amber-700 mb-1">🏗️ 此地块尚未关联建筑</p>
            <p class="text-xs text-amber-500 mb-3">选择下方按钮创建新建筑，或关联已有建筑</p>
            <button
              class="rounded-lg bg-amber-500 text-white px-4 py-2 text-sm font-medium hover:bg-amber-600 transition-colors shadow-sm"
              @click="openCreateBuildingDialog"
            >
              ✨ 创建建筑
            </button>
          </div>

          <label class="text-xs text-slate-500">建筑类型</label>
          <select v-model="selectedStructureType" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option v-for="t in structureTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>

          <label class="text-xs text-slate-500 mt-2 block">子类型</label>
          <select v-model="selectedStructureSubtype" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option v-for="s in structureSubtypes" :key="s.value" :value="s.value">{{ s.label }}</option>
          </select>

          <div class="border-t border-slate-100 pt-3 mt-2">
            <p class="text-xs font-semibold text-slate-500 uppercase mb-2">运营信息</p>

            <label class="text-xs text-slate-500">运营主体</label>
            <select v-model="selectedOperatorEntityId" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option :value="undefined">-- 无 --</option>
              <option v-for="e in entities" :key="e.id" :value="e.id">{{ entityLabel(e) }}</option>
            </select>

            <label class="text-xs text-slate-500 mt-2 block">产权方</label>
            <select v-model="selectedOwnerEntityId" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option :value="undefined">-- 无 --</option>
              <option v-for="e in entities" :key="e.id" :value="e.id">{{ entityLabel(e) }}</option>
            </select>

            <label class="text-xs text-slate-500 mt-2 block">品牌</label>
            <select v-model="selectedBrandId" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option :value="undefined">-- 无 --</option>
              <option v-for="b in filteredBrands" :key="b.id" :value="b.id">
                {{ b.name }}<template v-if="b.entityName"> ({{ b.entityName }})</template>
              </option>
            </select>
            <p class="text-xs text-slate-400 mt-1">品牌列表按所选运营主体过滤</p>

            <div class="border-t border-slate-100 pt-3 mt-2">
              <p class="text-xs font-semibold text-slate-500 uppercase mb-2">层级关系</p>
              <label class="text-xs text-slate-500">父建筑（可选）</label>
              <select v-model="selectedParentStructureId" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option :value="undefined">-- 无（顶层建筑） --</option>
                <option v-for="ps in parentStructureOptions" :key="ps.id" :value="ps.id">
                  {{ ps.name }} [{{ ps.subtype }}]
                </option>
              </select>
              <p class="text-xs text-slate-400 mt-1">选择父建筑可将当前建筑嵌套其下（如店铺→商场）</p>
            </div>
          </div>

          <button class="w-full rounded-lg bg-indigo-600 text-white py-2 text-sm font-medium hover:bg-indigo-700 mt-3" @click="saveStructureConfig">
            保存配置
          </button>
        </template>
      </template>

      <!-- TAB: 评分 -->
      <template v-if="activeTab === 'scores'">
        <div v-if="!structure" class="text-xs text-slate-400 text-center py-4">
          请先在「配置」tab 中关联 Structure
        </div>
        <div v-else-if="scoresLoading" class="text-xs text-slate-400 text-center py-4">加载中...</div>
        <div v-else-if="!latestScore" class="text-xs text-slate-400 text-center py-4">
          暂无评分数据
        </div>
        <template v-else>
          <div class="rounded-lg border border-slate-200 p-3 bg-slate-50">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs text-slate-500">综合评分</span>
              <span class="text-lg font-bold text-amber-600">{{ latestScore.total_score ?? "—" }}</span>
            </div>
            <div class="text-xs text-slate-400">
              版本: {{ latestScore.score_version }} · {{ new Date(latestScore.scored_at).toLocaleDateString() }}
            </div>
          </div>
          <div v-if="latestScore.details" class="space-y-2 mt-2">
            <div v-for="(val, key) in latestScore.details" :key="key" class="flex items-center justify-between text-sm">
              <span class="text-slate-600">{{ key }}</span>
              <span class="font-medium text-slate-800">{{ val }}</span>
            </div>
          </div>
        </template>
      </template>

      <!-- TAB: 子项 -->
      <template v-if="activeTab === 'children'">
        <div v-if="!structure" class="text-xs text-slate-400 text-center py-4">
          请先在「配置」tab 中关联 Structure
        </div>
        <div v-else-if="childrenLoading" class="text-xs text-slate-400 text-center py-4">加载中...</div>
        <div v-else-if="childrenList.length === 0" class="text-xs text-slate-400 text-center py-4">
          暂无子建筑/店铺
        </div>
        <template v-else>
          <div
            v-for="child in childrenList"
            :key="child.id"
            class="rounded-lg border border-slate-200 p-3 hover:border-slate-300 transition-colors"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-slate-700">{{ child.name || "未命名" }}</span>
              <span class="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded">{{ child.structureSubtype }}</span>
            </div>
            <div class="text-xs text-slate-400 mt-1 flex flex-wrap gap-x-3">
              <span v-if="child.brandName">{{ child.brandName }}</span>
              <span v-if="child.shopType">{{ child.shopType }}</span>
              <span v-if="child.floorLocation">{{ child.floorLocation }}</span>
              <span v-if="child.areaSqm">{{ child.areaSqm }}m²</span>
            </div>
          </div>
        </template>
      </template>

    </div>

    <!-- Status toast -->
    <div
      v-if="statusMsg"
      class="absolute bottom-4 left-4 right-4 bg-slate-900 text-white rounded-lg px-4 py-2 text-xs shadow-lg text-center"
    >
      {{ statusMsg }}
    </div>

    <!-- Create Building Dialog Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showCreateBuildingDialog"
          class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          @click.self="showCreateBuildingDialog = false"
        >
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <!-- Header -->
            <div class="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-4">
              <h3 class="text-white font-bold text-lg">🏗️ 创建建筑</h3>
              <p class="text-amber-100 text-xs mt-0.5">在此地块上新建一个建筑结构体</p>
            </div>

            <!-- Body -->
            <div class="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
              <!-- Building name -->
              <div>
                <label class="text-xs font-medium text-slate-600 block mb-1">建筑名称</label>
                <input
                  v-model="createBuildingForm.name"
                  class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none"
                  placeholder="如：万象城、万达广场..."
                  maxlength="120"
                />
              </div>

              <!-- Building subtype -->
              <div>
                <label class="text-xs font-medium text-slate-600 block mb-1">建筑类型 <span class="text-red-400">*</span></label>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    v-for="s in suggestedSubtypes"
                    :key="s.value"
                    type="button"
                    class="rounded-lg border-2 px-3 py-2.5 text-left transition-all"
                    :class="createBuildingForm.structureSubtype === s.value
                      ? 'border-amber-500 bg-amber-50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300'"
                    @click="createBuildingForm.structureSubtype = s.value"
                  >
                    <div class="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                      <AppIcon :name="subtypeIcon(s.value)" :size="14" />
                      {{ s.label }}
                    </div>
                    <div v-if="s.desc" class="text-xs text-slate-400 mt-0.5">{{ s.desc }}</div>
                  </button>
                </div>
                <!-- More types dropdown -->
                <details class="mt-2">
                  <summary class="text-xs text-slate-400 cursor-pointer hover:text-slate-600">更多类型...</summary>
                  <div class="grid grid-cols-2 gap-2 mt-2">
                    <button
                      v-for="s in structureSubtypes"
                      :key="s.value"
                      type="button"
                      class="rounded-lg border px-2 py-1.5 text-xs transition-all"
                      :class="createBuildingForm.structureSubtype === s.value
                        ? 'border-amber-500 bg-amber-50'
                        : 'border-slate-200 hover:border-slate-300'"
                      @click="createBuildingForm.structureSubtype = s.value"
                    >
                      {{ s.label }}
                    </button>
                  </div>
                </details>
              </div>

              <!-- Structure type -->
              <div>
                <label class="text-xs font-medium text-slate-600 block mb-1">结构类型</label>
                <div class="flex gap-2">
                  <button
                    v-for="t in structureTypes"
                    :key="t.value"
                    type="button"
                    class="rounded-lg border px-3 py-1.5 text-xs transition-all flex-1"
                    :class="createBuildingForm.structureType === t.value
                      ? 'border-slate-700 bg-slate-100 font-medium'
                      : 'border-slate-200 hover:border-slate-300'"
                    @click="createBuildingForm.structureType = t.value"
                  >
                    {{ t.label }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="border-t border-slate-100 px-5 py-3 flex justify-end gap-2">
              <button
                class="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                @click="showCreateBuildingDialog = false"
              >
                取消
              </button>
              <button
                class="rounded-lg bg-amber-500 text-white px-5 py-2 text-sm font-medium hover:bg-amber-600 transition-colors disabled:opacity-50 shadow-sm"
                :disabled="!createBuildingForm.structureSubtype || createBuildingSaving"
                @click="confirmCreateBuilding"
              >
                {{ createBuildingSaving ? '创建中...' : '✅ 确认创建' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </aside>
</template>

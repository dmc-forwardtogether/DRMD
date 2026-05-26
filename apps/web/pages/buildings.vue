<script setup lang="ts">
definePageMeta({ pageTransition: false })
import { X, Building2, Store, Star, MapPin, Hash, TrendingUp, TrendingDown, Minus, ChevronRight, ExternalLink, Layers, Plus, Trash2, Settings, Search, Link2 } from "lucide-vue-next"
import type { Entity, Brand, Structure, StructureCategory, FilterOption, ParcelStructure, ParcelStructureRelation } from "~/types"
import FilterBar from "~/components/FilterBar.vue"
import { useToast } from "~/composables/useToast"

const { public: { apiBase } } = useRuntimeConfig()
const configBase = `${apiBase}/api/config`
const toast = useToast()

// ===== Data =====
const structures = ref<Structure[]>([])
const brands = ref<Brand[]>([])
const entities = ref<Entity[]>([])
const categories = ref<StructureCategory[]>([])
const selectedCategory = ref<string>("")
const searchQuery = ref("")
const selectedStructure = ref<Structure | null>(null)
const activeDetailTab = ref<"info" | "brand" | "score" | "children">("info")
const loadingDetail = ref(false)
const scoreDetail = ref<any>(null)
const childStructures = ref<Structure[]>([])
const districtInfo = ref<any[]>([])
const buildingScore = ref<{ totalScore: number; childCount: number; maxScore: number; ratio: number } | null>(null)

// Parcel linking
const linkedParcels = ref<ParcelStructure[]>([])
const loadingParcels = ref(false)
const availableParcels = ref<{ id: number; name: string; featureType: string }[]>([])
const showParcelPicker = ref(false)
const selectedParcelId = ref<number | undefined>()
const selectedParcelRelation = ref<ParcelStructureRelation>("located_in")
const linkParcelSaving = ref(false)

// ===== Filter Options =====
const categoryIcons: Record<string, string> = {
  mall: "🏬", shop: "🏪", office: "🏢", residential: "🏠",
  school: "🏫", park: "🌳", road: "🛣️", river: "💧",
}
const categoryColorMap: Record<string, string> = {
  mall: "bg-amber-100 text-amber-700", shop: "bg-pink-100 text-pink-700",
  office: "bg-indigo-100 text-indigo-700", residential: "bg-orange-100 text-orange-700",
  school: "bg-emerald-100 text-emerald-700", park: "bg-green-100 text-green-700",
  road: "bg-slate-200 text-slate-700", river: "bg-cyan-100 text-cyan-700",
}

const categoryFilters = computed<FilterOption[]>(() => {
  const counts: Record<string, number> = {}
  structures.value.forEach(s => {
    const code = s.structureSubtype; counts[code] = (counts[code] || 0) + 1
  })
  const list: FilterOption[] = [{ key: "", label: "全部", count: structures.value.length }]
  for (const cat of categories.value) {
    list.push({
      key: String(cat.id),
      label: cat.name,
      count: counts[cat.code] || 0,
      icon: categoryIcons[cat.code],
      color: cat.canBeCommercial ? "text-emerald-600" : undefined,
    })
  }
  return list
})

const filteredStructures = computed(() => {
  let list = structures.value
  // 只展示顶层建筑（无父建筑），子建筑/店铺在详情弹窗"子项"tab中查看
  list = list.filter(s => !s.parentStructureId)
  if (selectedCategory.value) {
    list = list.filter(s => String(s.categoryId) === selectedCategory.value)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(s =>
      (s.name || "").toLowerCase().includes(q) ||
      (s.brandName || "").toLowerCase().includes(q) ||
      (s.operatorEntityName || "").toLowerCase().includes(q)
    )
  }
  // Sort by brand score descending, un-scored at bottom
  return [...list].sort((a, b) => (b.brandTotalScore ?? -1) - (a.brandTotalScore ?? -1))
})

// ===== Detail Modal =====
const isEditing = ref(false)

// Edit form fields
const editName = ref("")
const editStructureType = ref<"constructed" | "natural" | "hybrid">("constructed")
const editStructureSubtype = ref("mall")
const editBrandId = ref<number | undefined>()
const editCategoryId = ref<number | undefined>()
const editOperatorEntityId = ref<number | undefined>()
const editOwnerEntityId = ref<number | undefined>()
const editParentStructureId = ref<number | undefined>()
const editSaving = ref(false)
const deleting = ref(false)

async function openDetail(s: Structure): Promise<void> {
  selectedStructure.value = s
  loadingDetail.value = true
  activeDetailTab.value = "info"
  try {
    const [scoreRes, childRes, distRes, bldScore] = await Promise.all([
      $fetch(`${configBase}/structures/${s.id}/scores/latest`).catch(() => null),
      $fetch<Structure[]>(`${configBase}/structures?projectId=${s.projectId}&parentId=${s.id}`).catch(() => []),
      $fetch<any[]>(`${configBase}/structures/${s.id}/districts`).catch(() => []),
      $fetch<{ totalScore: number; childCount: number; maxScore: number; ratio: number } | null>(`${configBase}/structures/${s.id}/building-score`).catch(() => null),
    ])
    scoreDetail.value = scoreRes
    districtInfo.value = distRes
    childStructures.value = childRes
    buildingScore.value = bldScore

    // Load linked parcels if structure has feature_id
    linkedParcels.value = []
    if (s.featureId) {
      try {
        linkedParcels.value = await $fetch<ParcelStructure[]>(`${apiBase}/api/features/${s.featureId}/structures`)
      } catch { /* */ }
    }
  } catch { /* */ }
  loadingDetail.value = false
}

function closeDetail(): void {
  selectedStructure.value = null
  scoreDetail.value = null
  childStructures.value = []
  districtInfo.value = []
  buildingScore.value = null
  isEditing.value = false
}

function startEdit(): void {
  if (!selectedStructure.value) return
  const s = selectedStructure.value
  editName.value = s.name || ""
  editStructureType.value = s.structureType
  editStructureSubtype.value = s.structureSubtype
  // DB returns null for empty fields, but <option :value="undefined"> won't match null
  // Convert null → undefined so the "-- 无 --" option is properly selected
  editBrandId.value = s.brandId ?? undefined
  editCategoryId.value = s.categoryId ?? undefined
  editOperatorEntityId.value = s.operatorEntityId ?? undefined
  editOwnerEntityId.value = s.ownerEntityId ?? undefined
  editParentStructureId.value = s.parentStructureId ?? undefined
  isEditing.value = true
}

function cancelEdit(): void {
  isEditing.value = false
}

async function saveEdit(): Promise<void> {
  if (!selectedStructure.value) return
  editSaving.value = true
  try {
    await $fetch(`${configBase}/structures/${selectedStructure.value.id}`, {
      method: "PUT",
      body: {
        projectId: selectedStructure.value.projectId,
        structureType: editStructureType.value,
        structureSubtype: editStructureSubtype.value,
        name: editName.value || undefined,
        brandId: editBrandId.value ?? null,
        categoryId: editCategoryId.value ?? null,
        operatorEntityId: editOperatorEntityId.value ?? null,
        ownerEntityId: editOwnerEntityId.value ?? null,
        parentStructureId: editParentStructureId.value ?? null,
        featureId: selectedStructure.value.featureId ?? null,
      }
    })
    // 保存后重新拉取完整数据（含 brandName、operatorEntityName 等 JOIN 字段）
    const refreshed = await $fetch<Structure>(`${configBase}/structures/${selectedStructure.value.id}`)
    selectedStructure.value = refreshed
    const idx = structures.value.findIndex(s => s.id === refreshed.id)
    if (idx >= 0) structures.value[idx] = refreshed
    isEditing.value = false
    toast.success('建筑信息已更新')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    toast.error(`保存失败: ${msg}`)
  }
  editSaving.value = false
}

async function deleteStructure(): Promise<void> {
  if (!selectedStructure.value) return
  const s = selectedStructure.value
  if (!confirm(`确定要删除「${s.name || '(未命名)'}」吗？此操作不可撤销。`)) return
  deleting.value = true
  try {
    await $fetch(`${configBase}/structures/${s.id}`, { method: "DELETE" })
    structures.value = structures.value.filter(st => st.id !== s.id)
    closeDetail()
    toast.success('建筑已删除')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    toast.error(`删除失败: ${msg}`)
  }
  deleting.value = false
}

// ===== Parcel Linking =====
async function handleLinkParcel(): Promise<void> {
  if (!selectedStructure.value || !selectedParcelId.value) return
  linkParcelSaving.value = true
  try {
    await $fetch(`${apiBase}/api/features/${selectedParcelId.value}/structures`, {
      method: "POST",
      body: { structureId: selectedStructure.value.id, relation: selectedParcelRelation.value }
    })
    // Refresh
    if (selectedStructure.value.featureId) {
      linkedParcels.value = await $fetch<ParcelStructure[]>(`${apiBase}/api/features/${selectedStructure.value.featureId}/structures`)
    }
    showParcelPicker.value = false
    toast.success('已关联地块')
  } catch (err) {
    toast.error(`关联失败: ${err instanceof Error ? err.message : '未知错误'}`)
  }
  linkParcelSaving.value = false
}

async function handleUnlinkParcel(parcelId: number): Promise<void> {
  if (!selectedStructure.value) return
  try {
    await $fetch(`${apiBase}/api/features/${parcelId}/structures/${selectedStructure.value.id}`, { method: "DELETE" })
    linkedParcels.value = linkedParcels.value.filter(p => p.parcelId !== parcelId)
    toast.success('已解除关联')
  } catch (err) {
    toast.error(`解除关联失败: ${err instanceof Error ? err.message : '未知错误'}`)
  }
}

async function openParcelPicker(): Promise<void> {
  if (!selectedStructure.value) return
  selectedParcelId.value = undefined
  selectedParcelRelation.value = "located_in"
  // Fetch available parcels from the same project
  try {
    const res = await $fetch<{ featureCollection: GeoJSON.FeatureCollection }>(
      `${apiBase}/api/projects/${selectedStructure.value.projectId}/features`
    )
    availableParcels.value = (res.featureCollection.features || [])
      .filter(f => {
        const t = f.geometry?.type
        return t === "Polygon" || t === "MultiPolygon"
      })
      .map(f => ({
        id: Number(f.id),
        name: (f.properties as Record<string, unknown>)?.name as string || `地块 #${f.id}`,
        featureType: (f.properties as Record<string, unknown>)?.kind as string || "unknown"
      }))
  } catch { availableParcels.value = [] }
  showParcelPicker.value = true
}

// ===== Helpers =====
function catName(code: string): string {
  const cat = categories.value.find(c => c.code === code)
  return cat?.name || code
}
function catColor(code: string): string {
  return categoryColorMap[code] || "bg-gray-100 text-gray-600"
}

// 建筑总分：来自 building_scores 表（后端自动维护，子建筑品牌分之和）
const buildingTotalScore = computed(() => buildingScore.value?.totalScore ?? null)
const buildingMaxScore = computed(() => buildingScore.value?.maxScore ?? 0)
const buildingRatio = computed(() => buildingScore.value?.ratio ?? 0)
const isParentBuilding = computed(() => (buildingScore.value?.childCount ?? 0) > 0)

async function toggleCategoryCommercial(cat: StructureCategory): Promise<void> {
  try {
    await $fetch(`${configBase}/categories/${cat.id}`, {
      method: "PUT",
      body: { canBeCommercial: !cat.canBeCommercial },
    })
    cat.canBeCommercial = !cat.canBeCommercial
  } catch { /* */ }
}

// ===== Settings Modal =====
const settingsOpen = ref(false)
const settingsTab = ref<"categories" | "districts">("categories")
const editingCatId = ref<number | null>(null)
const editingCatName = ref("")
const districtSearch = ref("")
const allDistricts = ref<any[]>([])
const districtFormOpen = ref(false)
const districtForm = reactive({ code: "", name: "", level: "district", parentCode: "", fullName: "" })

function startEditCat(cat: StructureCategory): void {
  editingCatId.value = cat.id; editingCatName.value = cat.name
}
function cancelEditCat(): void { editingCatId.value = null; editingCatName.value = "" }
async function saveCatName(cat: StructureCategory): Promise<void> {
  try {
    await $fetch(`${configBase}/categories/${cat.id}`, { method: "PUT", body: { name: editingCatName.value } })
    cat.name = editingCatName.value; cancelEditCat()
  } catch { /* */ }
}

async function openSettings(): Promise<void> {
  settingsOpen.value = true
  try { allDistricts.value = await $fetch<any[]>(`${configBase}/districts?limit=500`) } catch { allDistricts.value = [] }
}
function resetDistrictForm(): void {
  districtForm.code = ""; districtForm.name = ""; districtForm.level = "district"
  districtForm.parentCode = ""; districtForm.fullName = ""
}
function openDistrictCreate(): void { resetDistrictForm(); districtFormOpen.value = true }
async function saveDistrict(): Promise<void> {
  try {
    await $fetch(`${configBase}/districts`, { method: "POST", body: districtForm })
    districtFormOpen.value = false
    allDistricts.value = await $fetch<any[]>(`${configBase}/districts?limit=500`)
  } catch { /* */ }
}
async function deleteDistrict(code: string): Promise<void> {
  if (!confirm(`删除行政区 ${code}？`)) return
  await $fetch(`${configBase}/districts/${code}`, { method: "DELETE" })
  allDistricts.value = await $fetch<any[]>(`${configBase}/districts?limit=500`)
}
const filteredDistricts = computed(() => {
  if (!districtSearch.value) return allDistricts.value
  const q = districtSearch.value.toLowerCase()
  return allDistricts.value.filter((d: any) => (d.name || "").toLowerCase().includes(q) || (d.code || "").includes(q))
})

const shopIconMap: Record<string, string> = {
  "星巴克": "☕", "喜茶": "🍵", "Apple": "🍎", "MUJI": "🛒", "优衣库": "👕",
  "奈雪": "🍰", "泡泡玛特": "🧸", "海底捞": "🍲", "ZARA": "🛍️",
  "麦当劳": "🍔", "肯德基": "🍗", "蔚来": "🚗", "霸王茶姬": "🍶",
  "迪卡侬": "🏃", "乐高": "🧱", "海马体": "📸", "西西弗": "📚",
  "太二": "🐟", "西贝": "🥟", "MANNER": "☕", "H&M": "👗",
}
function shopIcon(name: string): string {
  for (const [key, icon] of Object.entries(shopIconMap)) {
    if (name.includes(key)) return icon
  }
  return "📍"
}

// 品牌图标智能匹配
const BRAND_ICON_FALLBACK_BUILDINGS: Record<string, string> = {
  "肯德基": "🍗", "麦当劳": "🍔", "星巴克": "☕", "喜茶": "🍵", "奈雪": "🍰",
  "海底捞": "🍲", "太二": "🐟", "西贝": "🥟", "优衣库": "👕", "ZARA": "🛍️",
  "H&M": "👗", "MUJI": "🛒", "Apple": "🍎", "蔚来": "🚗", "霸王茶姬": "🍶",
  "泡泡玛特": "🧸", "迪卡侬": "🏃", "乐高": "🧱", "海马体": "📸", "西西弗": "📚",
  "MANNER": "☕", "银泰城": "🏬", "银泰": "🏬", "万达": "🏬", "万象城": "🏬",
  "天街": "🏬", "大悦城": "🏬", "来福士": "🏬", "印象城": "🏬",
}
function brandIcon(brand?: { name: string; icon?: string | null } | null): string {
  if (!brand) return '🏢'
  if (brand.icon && brand.icon.trim()) return brand.icon.trim()
  for (const [key, icon] of Object.entries(BRAND_ICON_FALLBACK_BUILDINGS)) {
    if (brand.name.includes(key)) return icon
  }
  return '🏷️'
}

/** 获取当前选中建筑的关联品牌（模板中安全使用，避免 null 闭包问题） */
function currentBrand(): Brand | undefined {
  const s = selectedStructure.value
  if (!s?.brandId) return undefined
  return brands.value.find(b => b.id === s.brandId)
}

function brandTypeBadgeClass(type?: string): string {
  if (type === 'owner') return 'bg-amber-100 text-amber-700'
  if (type === 'both') return 'bg-purple-100 text-purple-700'
  return 'bg-blue-100 text-blue-700'
}
function brandTypeLabel(type?: string): string {
  if (type === 'owner') return '业主'
  if (type === 'customer') return '客户'
  if (type === 'both') return '均可'
  return ''
}

function scoreBarColor(score: number): string {
  if (score >= 25) return "bg-amber-500"
  if (score >= 18) return "bg-blue-500"
  if (score >= 10) return "bg-emerald-500"
  return "bg-slate-400"
}

// ===== Init =====
onMounted(async () => {
  try {
    const [s, b, e, c] = await Promise.all([
      $fetch<Structure[]>(`${configBase}/structures`),
      $fetch<Brand[]>(`${configBase}/brands`),
      $fetch<Entity[]>(`${configBase}/entities`),
      $fetch<StructureCategory[]>(`${configBase}/categories`),
    ])
    structures.value = s; brands.value = b; entities.value = e; categories.value = c
  } catch { /* */ }
})
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <!-- Header -->
    <header class="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div class="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <NuxtLink to="/" class="text-sm text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors">
            ← 返回编辑器
          </NuxtLink>
          <span class="text-slate-300">|</span>
          <h1 class="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Building2 class="w-5 h-5 text-indigo-600" /> 建筑中心
          </h1>
          <span class="text-slate-300">|</span>
          <NuxtLink to="/commercial" class="text-sm text-slate-500 hover:text-slate-900 transition-colors">商业中心</NuxtLink>
        </div>
        <span class="text-xs text-slate-400">{{ structures.length }} 个建筑</span>
      </div>
    </header>

    <!-- Filter Bar -->
    <div class="max-w-7xl mx-auto px-6 py-4">
      <FilterBar
        v-model="selectedCategory"
        v-model:search-query="searchQuery"
        :filters="categoryFilters"
        search-placeholder="搜索建筑名称、品牌、运营主体..."
      />
    </div>

    <!-- Category Legend -->
    <div class="max-w-7xl mx-auto px-6 pb-2 flex flex-wrap gap-2 text-xs text-slate-500 items-center">
      <span class="text-slate-400 mr-1">分类：</span>
      <button
        v-for="cat in categories"
        :key="cat.id"
        @click="toggleCategoryCommercial(cat)"
        class="px-1.5 py-0.5 rounded border cursor-pointer transition-colors hover:opacity-80"
        :class="cat.canBeCommercial ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-emerald-50 hover:text-emerald-600'"
        :title="cat.canBeCommercial ? '点击取消可商用' : '点击设为可商用'"
      >
        {{ cat.canBeCommercial ? '✓' : '✗' }} {{ cat.name }}
      </button>
      <button @click="openSettings" class="ml-2 p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="管理分类和行政区">
        <Settings class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Structure Grid -->
    <div class="max-w-7xl mx-auto px-6 pb-12">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <button
          v-for="s in filteredStructures"
          :key="s.id"
          @click="openDetail(s)"
          class="bg-white rounded-xl border border-slate-200 p-5 text-left hover:shadow-lg hover:border-indigo-300 transition-all group cursor-pointer"
        >
          <div class="flex items-start justify-between mb-2">
            <span class="text-xs px-2 py-0.5 rounded font-medium" :class="catColor(s.structureSubtype)">
              {{ catName(s.structureSubtype) }}
            </span>
            <ChevronRight class="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <h3 class="font-semibold text-slate-800 mb-1">{{ s.name || '(未命名)' }}</h3>
          <div class="space-y-1 text-xs text-slate-500">
            <div v-if="s.brandName" class="flex items-center gap-1">
              <Store class="w-3 h-3" /> {{ s.brandName }}
              <span v-if="s.brandTotalScore != null" class="ml-auto flex items-center gap-0.5 text-amber-600 font-medium">
                <Star class="w-3 h-3 fill-amber-400 text-amber-400" />{{ s.brandTotalScore }}
              </span>
            </div>
            <div v-if="s.operatorEntityName" class="flex items-center gap-1">
              <Building2 class="w-3 h-3" /> {{ s.operatorEntityName }}
            </div>
            <div v-if="s.parentStructureName" class="text-indigo-400">
              📍 {{ s.parentStructureName }}内
            </div>
          </div>
        </button>
      </div>
      <p v-if="filteredStructures.length === 0" class="text-slate-400 text-sm text-center py-20">
        暂无匹配的建筑
      </p>
    </div>

    <!-- ===== DETAIL MODAL ===== -->
    <Teleport to="body">
      <div
        v-if="selectedStructure"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        @click.self="closeDetail"
      >
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <!-- Modal Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div class="flex items-center gap-3">
              <span class="text-lg">{{ catName(selectedStructure.structureSubtype) === '商场' ? '🏬' : catName(selectedStructure.structureSubtype) === '店铺' ? '🏪' : '🏢' }}</span>
              <div>
                <h2 class="text-xl font-bold text-slate-800">{{ selectedStructure.name || '(未命名)' }}</h2>
                <p class="text-xs text-slate-400">
                  <span class="px-1.5 py-0.5 rounded text-xs font-medium" :class="catColor(selectedStructure.structureSubtype)">{{ catName(selectedStructure.structureSubtype) }}</span>
                  {{ selectedStructure.structureType === 'natural' ? '· 自然基底' : selectedStructure.structureType === 'hybrid' ? '· 改造景观' : '' }}
                </p>
              </div>
            </div>
            <button @click="closeDetail" class="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
              <X class="w-5 h-5" />
            </button>
          </div>

          <!-- Modal Body: 4-panel layout -->
          <div class="flex-1 overflow-y-auto">
            <div v-if="loadingDetail" class="flex items-center justify-center py-20">
              <div class="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
            </div>
            <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
              <!-- LEFT COLUMN: Brand + Score -->
              <div class="p-5 space-y-5">
                <!-- Panel 1: Brand -->
                <div class="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="text-sm font-semibold text-amber-800 flex items-center gap-2">
                      <Store class="w-4 h-4" /> 品牌关联
                    </h3>
                    <button
                      v-if="!isEditing"
                      class="text-xs text-amber-600 hover:text-amber-800 font-medium"
                      @click="startEdit"
                    >编辑</button>
                  </div>

                  <!-- View mode -->
                    <template v-if="!isEditing">
                    <div v-if="selectedStructure && selectedStructure.brandName" class="space-y-2">
                      <div class="flex items-center gap-2">
                        <span class="text-2xl">{{ brandIcon(currentBrand()) }}</span>
                        <div>
                          <p class="font-semibold text-slate-800">{{ selectedStructure.brandName }}</p>
                          <p class="text-xs text-slate-500">
                            {{ currentBrand()?.entityName || '' }}
                            <span v-if="currentBrand()?.brandType" class="ml-1 px-1 py-0.5 rounded text-xs font-medium"
                              :class="brandTypeBadgeClass(currentBrand()?.brandType)">
                              {{ brandTypeLabel(currentBrand()?.brandType) }}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                    <div v-else class="text-sm text-slate-400">未关联品牌</div>
                    <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div class="bg-white rounded-lg p-2 border border-slate-100">
                        <p class="text-slate-400">营运主体</p>
                        <p class="font-medium text-slate-700">{{ selectedStructure?.operatorEntityName || '—' }}</p>
                    </div>
                    <div class="bg-white rounded-lg p-2 border border-slate-100">
                      <p class="text-slate-400">业主方</p>
                      <p class="font-medium text-slate-700">{{ selectedStructure?.ownerEntityName || '—' }}</p>
                    </div>
                  </div>
                  </template>

                  <!-- Edit mode -->
                  <template v-else>
                    <div class="space-y-2">
                      <label class="text-xs text-slate-500">品牌</label>
                      <select v-model="editBrandId" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                        <option :value="undefined">-- 无 --</option>
                        <option v-for="b in brands" :key="b.id" :value="b.id">{{ b.name }} ({{ b.entityName }})</option>
                      </select>

                      <label class="text-xs text-slate-500">营运主体</label>
                      <select v-model="editOperatorEntityId" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                        <option :value="undefined">-- 无 --</option>
                        <option v-for="e in entities" :key="e.id" :value="e.id">{{ e.name }} ({{ e.type }})</option>
                      </select>

                      <label class="text-xs text-slate-500">业主方</label>
                      <select v-model="editOwnerEntityId" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                        <option :value="undefined">-- 无 --</option>
                        <option v-for="e in entities" :key="e.id" :value="e.id">{{ e.name }} ({{ e.type }})</option>
                      </select>

                      <label class="text-xs text-slate-500">父建筑</label>
                      <select v-model="editParentStructureId" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                        <option :value="undefined">-- 无（顶层） --</option>
                        <option v-for="ps in structures.filter(x => x.id !== selectedStructure?.id)" :key="ps.id" :value="ps.id">{{ ps.name || '#' + ps.id }} [{{ ps.structureSubtype }}]</option>
                      </select>
                    </div>
                  </template>
                </div>

                <!-- Panel 2: Score -->
                <div class="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                  <h3 class="text-sm font-semibold text-amber-800 flex items-center gap-2 mb-3">
                    <Star class="w-4 h-4" />
                    {{ isParentBuilding ? '建筑总分' : '品牌打分' }}
                    <span class="text-xs font-normal text-amber-500">
                      {{ isParentBuilding ? `(${buildingScore?.childCount ?? 0}家子店铺品牌分之和)` : '(店铺自动继承)' }}
                    </span>
                  </h3>
                  <div v-if="buildingTotalScore != null" class="space-y-3">
                    <div class="flex items-center justify-between">
                      <span class="text-3xl font-bold text-slate-800">{{ buildingTotalScore }}</span>
                      <span v-if="isParentBuilding" class="text-xs text-slate-400">
                        最高 {{ buildingMaxScore }} · 占比 {{ buildingRatio }}%
                      </span>
                      <span v-else class="text-xs text-slate-400">
                        满分 30 · 品牌: {{ selectedStructure?.brandName }}
                      </span>
                    </div>
                    <!-- 建筑总分进度条（相对全局最高） -->
                    <div v-if="isParentBuilding" class="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div class="h-full rounded-full transition-all bg-amber-500" :style="{ width: Math.min(buildingRatio, 100) + '%' }" />
                    </div>
                    <!-- 品牌分进度条（相对满分30） -->
                    <div v-else class="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div class="h-full rounded-full transition-all" :class="scoreBarColor(buildingTotalScore)" :style="{ width: Math.min(buildingTotalScore / 30 * 100, 100) + '%' }" />
                    </div>
                    <!-- Show brand score details for non-parent buildings -->
                    <template v-if="!isParentBuilding">
                      <div class="grid grid-cols-3 gap-2 text-center text-xs">
                        <div class="bg-white rounded-lg p-2 border border-slate-100">
                          <p class="text-slate-400 text-[10px] uppercase">影响力</p>
                          <p class="font-bold text-amber-600">{{ selectedStructure?.brandInfluenceScore ?? '-' }}</p>
                        </div>
                        <div class="bg-white rounded-lg p-2 border border-slate-100">
                          <p class="text-slate-400 text-[10px] uppercase">客单价</p>
                          <p class="font-bold text-blue-600">{{ selectedStructure?.brandAvgSpendScore ?? '-' }}</p>
                        </div>
                        <div class="bg-white rounded-lg p-2 border border-slate-100">
                          <p class="text-slate-400 text-[10px] uppercase">话题度</p>
                          <p class="font-bold text-emerald-600">{{ selectedStructure?.brandTopicScore ?? '-' }}</p>
                        </div>
                      </div>
                    </template>
                    <!-- Show child breakdown for parent buildings -->
                    <template v-else>
                      <div class="space-y-1 mt-2">
                        <p class="text-xs text-slate-500 mb-1">子店铺品牌分：</p>
                        <div v-for="child in childStructures.filter(c => c.brandTotalScore != null)" :key="child.id" class="flex items-center justify-between text-xs bg-white rounded px-2 py-1">
                          <span class="text-slate-700">{{ child.name || '(未命名)' }}</span>
                          <span class="flex items-center gap-1 font-medium text-amber-600">
                            <Star class="w-3 h-3 fill-amber-400" />{{ child.brandTotalScore }}
                            <span class="text-slate-400 font-normal">· {{ child.brandName }}</span>
                          </span>
                        </div>
                      </div>
                    </template>
                  </div>
                  <div v-else class="text-sm text-slate-400">
                    <span v-if="selectedStructure?.brandName">品牌「{{ selectedStructure.brandName }}」尚未打分</span>
                    <span v-else>未关联品牌，无法获取分数</span>
                  </div>
                </div>

                <!-- Panel 3: District Info -->
                <div v-if="districtInfo.length > 0" class="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                  <h3 class="text-sm font-semibold text-emerald-800 flex items-center gap-2 mb-2">
                    <MapPin class="w-4 h-4" /> 行政区
                  </h3>
                  <div class="flex flex-wrap gap-1.5">
                    <span v-for="d in districtInfo" :key="d.code" class="text-xs px-2 py-0.5 bg-white border border-emerald-200 rounded-full text-emerald-700">
                      {{ d.full_name || d.name }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- CENTER: Basic Info -->
              <div class="p-5 space-y-4">
                <h3 class="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Hash class="w-4 h-4 text-slate-400" /> 基本信息
                </h3>

                <!-- View mode -->
                <template v-if="!isEditing">
                <div class="grid grid-cols-2 gap-3 text-sm">
                  <div class="bg-slate-50 rounded-lg p-3">
                    <p class="text-xs text-slate-400">ID</p>
                    <p class="font-mono text-slate-700">#{{ selectedStructure.id }}</p>
                  </div>
                  <div class="bg-slate-50 rounded-lg p-3">
                    <p class="text-xs text-slate-400">项目 ID</p>
                    <p class="font-mono text-slate-700">{{ selectedStructure.projectId }}</p>
                  </div>
                  <div class="bg-slate-50 rounded-lg p-3">
                    <p class="text-xs text-slate-400">大类</p>
                    <p class="text-slate-700">{{ selectedStructure.structureType === 'constructed' ? '人造构筑物' : selectedStructure.structureType === 'natural' ? '自然基底' : '改造景观' }}</p>
                  </div>
                  <div class="bg-slate-50 rounded-lg p-3">
                    <p class="text-xs text-slate-400">子类型</p>
                    <p class="text-slate-700">{{ catName(selectedStructure.structureSubtype) }}</p>
                  </div>
                  <div class="bg-slate-50 rounded-lg p-3 col-span-2">
                    <p class="text-xs text-slate-400">地图要素</p>
                    <p class="font-mono text-slate-700">{{ selectedStructure.featureId ? `Feature #${selectedStructure.featureId}` : '未关联' }}</p>
                  </div>
                  <!-- Linked Parcels -->
                  <div class="bg-blue-50 rounded-lg p-3 col-span-2">
                    <div class="flex items-center justify-between mb-1">
                      <p class="text-xs text-slate-400">关联地块</p>
                      <button @click="openParcelPicker" class="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                        <Plus class="w-3 h-3" /> 关联
                      </button>
                    </div>
                    <div v-if="linkedParcels.length > 0" class="flex flex-wrap gap-1 mt-1">
                      <span
                        v-for="lp in linkedParcels"
                        :key="lp.parcelId"
                        class="text-xs px-2 py-0.5 bg-white border border-blue-200 rounded-full text-blue-700 flex items-center gap-1"
                      >
                        {{ lp.parcelName || ('地块 #' + lp.parcelId) }}
                        <span class="text-[10px] text-blue-400">({{ lp.relation === 'located_in' ? '坐落' : lp.relation }})</span>
                        <button @click.stop="handleUnlinkParcel(lp.parcelId)" class="text-red-400 hover:text-red-600 ml-0.5">×</button>
                      </span>
                    </div>
                    <div v-else class="text-xs text-slate-400 mt-1">未关联任何地块</div>
                  </div>
                  <div v-if="selectedStructure.parentStructureName" class="bg-indigo-50 rounded-lg p-3 col-span-2">
                    <p class="text-xs text-slate-400">父建筑</p>
                    <p class="text-indigo-700 flex items-center gap-1">
                      <Layers class="w-3.5 h-3.5" /> {{ selectedStructure.parentStructureName }}
                    </p>
                  </div>
                </div>
                </template>

                <!-- Edit mode: basic info -->
                <div v-if="isEditing" class="space-y-2">
                  <label class="text-xs text-slate-500">名称</label>
                  <input v-model="editName" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" type="text" />

                  <label class="text-xs text-slate-500">大类</label>
                  <select v-model="editStructureType" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                    <option value="constructed">人工</option>
                    <option value="natural">自然</option>
                    <option value="hybrid">混合</option>
                  </select>

                  <label class="text-xs text-slate-500">子类型</label>
                  <select v-model="editStructureSubtype" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                    <option value="mall">商场</option><option value="road">道路</option>
                    <option value="school">学校</option><option value="park">公园</option>
                    <option value="river">水系</option><option value="office">写字楼</option>
                    <option value="residential">住宅</option><option value="shop">店铺</option>
                    <option value="other">其他</option>
                  </select>
                </div>

                <!-- Extra JSON Data (view only) -->
                <div v-if="selectedStructure.extraJson && Object.keys(selectedStructure.extraJson).length > 0" class="mt-3">
                  <p class="text-xs text-slate-400 mb-1">扩展属性</p>
                  <pre class="text-xs bg-slate-50 rounded-lg p-3 overflow-x-auto text-slate-600">{{ JSON.stringify(selectedStructure.extraJson, null, 2) }}</pre>
                </div>
              </div>

              <!-- RIGHT: Map Preview + Children -->
              <div class="p-5 space-y-4">
                <!-- Map Preview Placeholder -->
                <div class="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                  <div class="px-4 py-2 border-b border-slate-100 bg-white">
                    <h3 class="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                      <MapPin class="w-3.5 h-3.5" /> 地图预览
                    </h3>
                  </div>
                  <div class="h-48 flex items-center justify-center bg-[#e8f0e0] relative">
                    <div class="absolute inset-0" style="background: 
                      linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px),
                      linear-gradient(0deg, rgba(0,0,0,0.03) 1px, transparent 1px);
                      background-size: 20px 20px;">
                    </div>
                    <div class="relative z-10 text-center">
                      <div class="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-2 shadow-lg">
                        <MapPin class="w-4 h-4 text-white" />
                      </div>
                      <p class="text-xs text-slate-500">
                        {{ selectedStructure.featureId ? '已关联地图要素' : '暂未关联地图' }}
                      </p>
                      <NuxtLink
                        v-if="selectedStructure.featureId"
                        to="/"
                        class="inline-flex items-center gap-1 mt-2 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        在地图中查看 <ExternalLink class="w-3 h-3" />
                      </NuxtLink>
                    </div>
                  </div>
                </div>

                <!-- Children Panel -->
                <div class="rounded-xl border border-purple-200 bg-purple-50/50 p-4">
                  <h3 class="text-sm font-semibold text-purple-800 flex items-center gap-2 mb-3">
                    <Layers class="w-4 h-4" />
                    子建筑
                    <span class="text-xs font-normal text-purple-500">({{ childStructures.length }})</span>
                  </h3>
                  <div v-if="childStructures.length > 0" class="flex flex-wrap gap-2">
                    <div
                      v-for="child in childStructures"
                      :key="child.id"
                      class="flex items-center gap-2 px-3 py-2 bg-white border border-purple-200 rounded-full text-sm hover:border-purple-400 hover:shadow-sm transition-all cursor-pointer group"
                      @click.stop="openDetail(child)"
                    >
                      <span class="text-base">{{ shopIcon(child.name || '') }}</span>
                      <span class="font-medium text-slate-700 text-xs">{{ child.name }}</span>
                      <ChevronRight class="w-3 h-3 text-purple-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <div v-else class="text-xs text-slate-400">
                    暂无子建筑
                    <span v-if="selectedStructure.structureSubtype === 'mall'" class="text-purple-500">（商场可以包含店铺）</span>
                  </div>
                </div>

                <!-- Quick Actions -->
                <div class="flex gap-2">
                  <template v-if="!isEditing">
                    <button
                      class="flex-1 text-center py-2 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                      @click="startEdit"
                    >
                      ✏️ 编辑此建筑
                    </button>
                    <NuxtLink
                      v-if="selectedStructure.featureId"
                      to="/"
                      class="flex-1 py-2 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors text-center"
                    >
                      定位到地图
                    </NuxtLink>
                    <button
                      class="py-2 px-3 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                      :disabled="deleting"
                      @click="deleteStructure"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </template>
                  <template v-else>
                    <button
                      class="flex-1 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                      :disabled="editSaving"
                      @click="saveEdit"
                    >
                      {{ editSaving ? '保存中...' : '💾 保存' }}
                    </button>
                    <button
                      class="flex-1 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      @click="cancelEdit"
                    >
                      取消
                    </button>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ===== SETTINGS MODAL ===== -->
    <Teleport to="body">
      <div v-if="settingsOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" @click.self="settingsOpen = false">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h3 class="text-lg font-bold text-slate-800">⚙ 配置管理</h3>
            <button @click="settingsOpen = false" class="p-2 text-slate-400 hover:text-slate-700 rounded-lg"><X class="w-5 h-5" /></button>
          </div>
          <!-- Settings Tabs -->
          <div class="flex border-b border-slate-100 px-6">
            <button @click="settingsTab = 'categories'" class="px-4 py-2 text-sm font-medium border-b-2 transition-colors" :class="settingsTab === 'categories' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500'">建筑分类</button>
            <button @click="settingsTab = 'districts'" class="px-4 py-2 text-sm font-medium border-b-2 transition-colors" :class="settingsTab === 'districts' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500'">行政区划</button>
          </div>
          <div class="flex-1 overflow-y-auto p-5">
            <!-- Categories Tab -->
            <div v-if="settingsTab === 'categories'">
              <p class="text-xs text-slate-500 mb-3">管理建筑分类，勾选"可商用"后该分类的建筑可作为品牌分店</p>
              <div class="space-y-2">
                <div v-for="cat in categories" :key="cat.id" class="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <button @click="toggleCategoryCommercial(cat)" class="px-2 py-0.5 rounded text-xs font-medium border transition-colors" :class="cat.canBeCommercial ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-slate-200 text-slate-500 border-slate-300'">
                    {{ cat.canBeCommercial ? '✓ 商用' : '✗ 非商用' }}
                  </button>
                  <span class="text-xs text-slate-400 w-16">{{ cat.code }}</span>
                  <template v-if="editingCatId === cat.id">
                    <input v-model="editingCatName" class="flex-1 text-sm border border-indigo-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300" @keyup.enter="saveCatName(cat)" />
                    <button @click="saveCatName(cat)" class="text-xs text-indigo-600 font-medium">保存</button>
                    <button @click="cancelEditCat" class="text-xs text-slate-400">取消</button>
                  </template>
                  <template v-else>
                    <span class="flex-1 text-sm font-medium text-slate-700">{{ cat.name }}</span>
                    <button @click="startEditCat(cat)" class="text-xs text-indigo-500 hover:text-indigo-700 font-medium">重命名</button>
                  </template>
                </div>
              </div>
            </div>
            <!-- Districts Tab -->
            <div v-if="settingsTab === 'districts'">
              <div class="flex items-center justify-between mb-3">
                <p class="text-xs text-slate-500">管理行政区划数据（省/市/区县）</p>
                <button @click="openDistrictCreate" class="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><Plus class="w-3 h-3" /> 添加</button>
              </div>
              <div class="relative mb-3">
                <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input v-model="districtSearch" class="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-200 outline-none" placeholder="搜索名称或编码..." />
              </div>
              <div class="space-y-1 max-h-80 overflow-y-auto">
                <div v-for="d in filteredDistricts.slice(0, 100)" :key="d.code" class="flex items-center gap-3 px-3 py-1.5 hover:bg-slate-50 rounded text-xs">
                  <span class="w-20 text-slate-400 font-mono">{{ d.code }}</span>
                  <span class="flex-1 font-medium text-slate-700">{{ d.full_name || d.name }}</span>
                  <span class="text-xs px-1.5 py-0.5 rounded" :class="d.level === 'province' ? 'bg-red-50 text-red-600' : d.level === 'city' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'">{{ d.level }}</span>
                  <button @click="deleteDistrict(d.code)" class="text-slate-400 hover:text-red-600"><Trash2 class="w-3 h-3" /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- District Form Modal -->
    <Teleport to="body">
      <div v-if="districtFormOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" @click.self="districtFormOpen = false">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
          <h3 class="text-lg font-bold text-slate-800 mb-4">添加行政区</h3>
          <div class="space-y-3">
            <div><label class="block text-xs font-medium text-slate-500 mb-1">编码</label><input v-model="districtForm.code" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="如：330100" /></div>
            <div><label class="block text-xs font-medium text-slate-500 mb-1">名称</label><input v-model="districtForm.name" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="如：杭州市" /></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-medium text-slate-500 mb-1">级别</label><select v-model="districtForm.level" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"><option value="province">省</option><option value="city">市</option><option value="district">区县</option></select></div>
              <div><label class="block text-xs font-medium text-slate-500 mb-1">上级编码</label><input v-model="districtForm.parentCode" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="如：330000" /></div>
            </div>
            <div><label class="block text-xs font-medium text-slate-500 mb-1">全称</label><input v-model="districtForm.fullName" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="如：浙江省杭州市" /></div>
          </div>
          <div class="flex justify-end gap-2 mt-5"><button @click="districtFormOpen = false" class="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button><button @click="saveDistrict" class="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">保存</button></div>
        </div>
      </div>
    </Teleport>
    <!-- Parcel Picker Modal -->
    <Teleport to="body">
      <div v-if="showParcelPicker" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" @click.self="showParcelPicker = false">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
          <h3 class="text-lg font-bold text-slate-800 mb-1">关联地块</h3>
          <p class="text-xs text-slate-500 mb-4">选择「{{ selectedStructure?.name }}」所在地块</p>
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1">选择地块</label>
              <select v-model="selectedParcelId" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option :value="undefined">-- 请选择 --</option>
                <option v-for="p in availableParcels" :key="p.id" :value="p.id">{{ p.name }} ({{ p.featureType }})</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1">关联方式</label>
              <select v-model="selectedParcelRelation" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="located_in">坐落 (located_in)</option>
                <option value="intersects">相交 (intersects)</option>
                <option value="adjacent">相邻 (adjacent)</option>
                <option value="part_of">从属 (part_of)</option>
              </select>
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-5">
            <button @click="showParcelPicker = false" class="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
            <button
              @click="handleLinkParcel"
              :disabled="!selectedParcelId || linkParcelSaving"
              class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
            >
              {{ linkParcelSaving ? '关联中...' : '确认关联' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

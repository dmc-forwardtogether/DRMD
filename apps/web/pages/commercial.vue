<script setup lang="ts">
definePageMeta({ pageTransition: false })
import { X, Building2, Store, Star, MapPin, ChevronRight, Layers, Plus, Search, Edit3, Trash2, TrendingUp, ChevronDown, ChevronRight as ChevronRight2, Hash, Save } from "lucide-vue-next"
import type { Entity, EntityType, Brand, BrandType, BrandScoreInput, Structure, StructureCategory, FilterOption } from "~/types"
import { useToast } from "~/composables/useToast"
import FilterBar from "~/components/FilterBar.vue"
import AppIcon from "~/components/AppIcon.vue"
import { brandTypeIcon, brandTypeLabel as btLabel, brandTypeColor as btColor, subtypeIcon, subtypeLabel, subtypeColor, kindIcon } from "~/utils/icons"

const { public: { apiBase } } = useRuntimeConfig()
const configBase = `${apiBase}/api/config`
const toast = useToast()

// ===== Tab =====
type Tab = "brands" | "entities"
const activeTab = ref<Tab>("brands")
const statusMsg = ref("")
let statusTimer: ReturnType<typeof setTimeout> | null = null
function showStatus(msg: string, type: 'info' | 'success' | 'error' | 'warning' = 'info'): void {
  statusMsg.value = msg
  if (statusTimer) clearTimeout(statusTimer)
  statusTimer = setTimeout(() => { statusMsg.value = "" }, 3000)
  toast[type](msg)
}

// ===== Data =====
const brands = ref<Brand[]>([])
const entities = ref<Entity[]>([])
const categories = ref<StructureCategory[]>([])
const searchQuery = ref("")
const selectedBrandCategory = ref<string>("")
const districts = ref<any[]>([])

// ===== Category Filter =====
const brandCategoryFilters = computed<FilterOption[]>(() => {
  const counts: Record<string, number> = {}
  brands.value.forEach(b => {
    const cat = b.category || 'Uncategorized'
    counts[cat] = (counts[cat] || 0) + 1
  })
  const list: FilterOption[] = [{ key: "", label: "All", count: brands.value.length }]
  for (const [cat, count] of Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))) {
    list.push({ key: cat, label: cat, count })
  }
  return list
})

// ===== BRANDS =====
const filteredBrands = computed(() => {
  let list = brands.value
  if (selectedBrandCategory.value) {
    list = list.filter(b => (b.category || 'Uncategorized') === selectedBrandCategory.value)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(b =>
      b.name.toLowerCase().includes(q) ||
      (b.entityName || "").toLowerCase().includes(q)
    )
  }
  return list
})

// Brand Form Modal
const brandFormOpen = ref(false)
const editingBrandId = ref<number | null>(null)
const brandForm = reactive({ name: "", entityId: 0, brandType: "" as string, description: "", sortOrder: 0, icon: "", category: "" })
function resetBrandForm(): void { brandForm.name = ""; brandForm.entityId = 0; brandForm.brandType = ""; brandForm.description = ""; brandForm.sortOrder = 0; brandForm.icon = ""; brandForm.category = ""; editingBrandId.value = null }
function openBrandCreate(entityId?: number): void { resetBrandForm(); if (entityId) brandForm.entityId = entityId; brandFormOpen.value = true }
function openBrandEdit(b: Brand): void {
  brandForm.name = b.name; brandForm.entityId = b.entityId; brandForm.brandType = b.brandType || ""
  brandForm.description = b.description || ""; brandForm.sortOrder = b.sortOrder; brandForm.icon = b.icon || ""
  brandForm.category = b.category || ""; editingBrandId.value = b.id; brandFormOpen.value = true
}
async function saveBrand(): Promise<void> {
  try {
    const url = editingBrandId.value ? `${configBase}/brands/${editingBrandId.value}` : `${configBase}/brands`
    const body: Record<string, unknown> = { ...brandForm }
    if (!body.brandType) body.brandType = undefined
    await $fetch(url, { method: editingBrandId.value ? "PUT" : "POST", body })
    brandFormOpen.value = false
    await fetchBrands()
    if (editingBrandId.value && selectedBrand.value?.id === editingBrandId.value) {
      const updated = brands.value.find(b => b.id === editingBrandId.value)
      if (updated) selectedBrand.value = updated
    }
    if (!selectedBrand.value) showStatus(editingBrandId.value ? "Brand updated" : "Brand created", "success")
  } catch {
    if (!selectedBrand.value) showStatus("Save failed", "error")
  }
}
async function deleteBrand(id: number): Promise<void> {
  if (!confirm("Delete this brand? This action cannot be undone.")) return
  await $fetch(`${configBase}/brands/${id}`, { method: "DELETE" })
  showStatus("Brand deleted", "success"); await fetchBrands()
}

// ===== BRAND DETAIL MODAL =====
const selectedBrand = ref<Brand | null>(null)
const brandStores = ref<any[]>([])
const loadingStores = ref(false)
const brandScoreForm = reactive({ influenceScore: 5, avgSpendScore: 5, topicScore: 5 })
const brandScoreSaving = ref(false)
const expandedRegions = ref<Set<string>>(new Set())

function toggleRegion(key: string): void {
  if (expandedRegions.value.has(key)) expandedRegions.value.delete(key)
  else expandedRegions.value.add(key)
}

interface RegionGroup { province: string; cities: CityGroup[] }
interface CityGroup { city: string; districts: DistrictGroup[] }
interface DistrictGroup { district: string; stores: any[] }

const storeRegions = computed(() => {
  const provMap = new Map<string, Map<string, Map<string, any[]>>>()
  for (const store of brandStores.value) {
    const p = store.province || "Unknown"
    const c = store.city || "Unknown"
    const d = store.district || "Unknown"
    if (!provMap.has(p)) provMap.set(p, new Map())
    const cityMap = provMap.get(p)!
    if (!cityMap.has(c)) cityMap.set(c, new Map())
    const distMap = cityMap.get(c)!
    if (!distMap.has(d)) distMap.set(d, [])
    distMap.get(d)!.push(store)
  }
  const regions: RegionGroup[] = []
  for (const [province, cityMap] of provMap) {
    const cities: CityGroup[] = []
    for (const [city, distMap] of cityMap) {
      const districts: DistrictGroup[] = []
      for (const [district, stores] of distMap) {
        districts.push({ district, stores })
      }
      cities.push({ city, districts })
    }
    regions.push({ province, cities })
  }
  return regions
})

async function openBrandDetail(b: Brand): Promise<void> {
  selectedBrand.value = b
  brandScoreForm.influenceScore = b.influenceScore ?? 5
  brandScoreForm.avgSpendScore = b.avgSpendScore ?? 5
  brandScoreForm.topicScore = b.topicScore ?? 5
  expandedRegions.value = new Set()
  loadingStores.value = true
  try {
    brandStores.value = await $fetch<any[]>(`${configBase}/brands/${b.id}/structures?projectId=1`)
    if (brandStores.value.length > 0) {
      expandedRegions.value.add(brandStores.value[0].province || "Unknown")
    }
  } catch { brandStores.value = [] }
  loadingStores.value = false
}

function closeBrandDetail(): void {
  selectedBrand.value = null
  brandStores.value = []
  expandedRegions.value = new Set()
}

// ===== ADD STORE TO BRAND =====
const addStoreOpen = ref(false)
const addStoreTab = ref<"structures" | "features">("structures")
const availableStructures = ref<Structure[]>([])
const loadingAvailable = ref(false)
const selectedStoreIds = ref<Set<number>>(new Set())
const addStoreSaving = ref(false)

// Map features that can become new stores
const availableFeatures = ref<any[]>([])
const loadingFeatures = ref(false)
const selectedFeatureIds = ref<Set<number>>(new Set())

async function openAddStore(): Promise<void> {
  if (!selectedBrand.value) return
  selectedStoreIds.value = new Set()
  selectedFeatureIds.value = new Set()
  addStoreTab.value = "structures"
  loadingAvailable.value = true
  loadingFeatures.value = true
  addStoreOpen.value = true
  let all: Structure[] = []
  try {
    all = await $fetch<Structure[]>(`${configBase}/structures?projectId=1`)
    // 包含 categoryCanBeCommercial=true 以及未设置分类(null)的建筑
    availableStructures.value = all.filter(s => s.categoryCanBeCommercial !== false)
  } catch { availableStructures.value = [] }
  loadingAvailable.value = false
  // Fetch map features that are not yet linked to any structure
  try {
    const featRes = await $fetch<any>(`${apiBase}/api/projects/1/features`)
    const features = featRes.featureCollection?.features || []
    const linkedFeatureIds = new Set(all.filter(s => s.featureId).map(s => s.featureId))
    const unlinked = features.filter((f: any) => !linkedFeatureIds.has(Number(f.id)))
    availableFeatures.value = unlinked.map((f: any) => ({
      id: Number(f.id),
      rawId: f.id,
      name: f.properties?.name || '',
      kind: f.properties?.kind || 'unknown',
      geometryType: f.geometry?.type || '',
    }))
  } catch { availableFeatures.value = [] }
  loadingFeatures.value = false
}

function toggleStoreSelection(id: number): void {
  if (selectedStoreIds.value.has(id)) selectedStoreIds.value.delete(id)
  else selectedStoreIds.value.add(id)
}

function toggleFeatureSelection(id: number): void {
  if (selectedFeatureIds.value.has(id)) selectedFeatureIds.value.delete(id)
  else selectedFeatureIds.value.add(id)
}

function inferFeatureSubtype(kind: string, geometryType: string): string {
  if (kind === 'commercial') return 'mall'
  if (kind === 'residential') return 'residential'
  if (kind === 'public') return 'public'
  if (kind === 'industrial') return 'industrial'
  if (kind === 'transport') return 'transport'
  if (kind === 'green') return 'green'
  if (kind === 'water') return 'water'
  if (kind === 'road') return 'road'
  if (kind === 'poi') return 'shop'
  if (geometryType === 'Point') return 'shop'
  if (geometryType === 'LineString' || geometryType === 'MultiLineString') return 'road'
  return 'other'
}

// 子建筑命名规则：品牌名(商场名店)
function childStoreName(brandName: string, parentName?: string | null): string {
  const pn = parentName || '未知商场'
  return `${brandName}(${pn}店)`
}

async function confirmAddStores(): Promise<void> {
  if (!selectedBrand.value) return
  const totalSelected = selectedStoreIds.value.size + selectedFeatureIds.value.size
  if (totalSelected === 0) return
  addStoreSaving.value = true
  let successCount = 0
  const brandEntityId = selectedBrand.value.entityId
  try {
    // Existing structures: create child shop under landlord, or assign directly to shop
    for (const id of selectedStoreIds.value) {
      const struct = availableStructures.value.find(s => s.id === id)
      if (!struct) continue
      if (struct.structureSubtype === 'shop') {
        await $fetch(`${configBase}/structures/${id}/brand`, {
          method: "PUT",
          body: { brandId: selectedBrand.value.id },
        })
      } else {
        // 创建子店铺，命名：品牌名(商场名店)，继承父建筑的运营主体/业主方
        const childName = childStoreName(selectedBrand.value.name, struct.name)
        await $fetch(`${configBase}/structures`, {
          method: "POST",
          body: {
            projectId: 1,
            structureType: "constructed",
            structureSubtype: "shop",
            name: childName,
            parentStructureId: id,
            brandId: selectedBrand.value.id,
            operatorEntityId: struct.operatorEntityId ?? brandEntityId ?? null,
            ownerEntityId: struct.ownerEntityId ?? brandEntityId ?? null,
          },
        })
      }
      successCount++
    }
    // Map features: create structure, then create child shop if feature is not a shop
    for (const fid of selectedFeatureIds.value) {
      const feat = availableFeatures.value.find(f => f.id === fid)
      if (!feat) continue
      const subtype = inferFeatureSubtype(feat.kind, feat.geometryType)
      if (subtype === 'shop') {
        await $fetch(`${apiBase}/api/features/${fid}/structure`, {
          method: "PUT",
          body: {
            projectId: 1,
            structureType: "constructed",
            structureSubtype: subtype,
            name: feat.name || undefined,
            brandId: selectedBrand.value.id,
            operatorEntityId: brandEntityId ?? null,
            ownerEntityId: brandEntityId ?? null,
          },
        })
      } else {
        // 为地图要素创建主建筑，运营主体/业主方默认填品牌关联企业
        const parent = await $fetch<any>(`${apiBase}/api/features/${fid}/structure`, {
          method: "PUT",
          body: {
            projectId: 1,
            structureType: "constructed",
            structureSubtype: subtype,
            name: feat.name || undefined,
            operatorEntityId: brandEntityId ?? null,
            ownerEntityId: brandEntityId ?? null,
          },
        })
        // 创建子店铺，命名：品牌名(商场名店)，继承父建筑
        const childName = childStoreName(selectedBrand.value.name, feat.name)
        const parentOp = parent.operatorEntityId ?? brandEntityId ?? null
        const parentOw = parent.ownerEntityId ?? brandEntityId ?? null
        await $fetch(`${configBase}/structures`, {
          method: "POST",
          body: {
            projectId: 1,
            structureType: "constructed",
            structureSubtype: "shop",
            name: childName,
            parentStructureId: parent.id,
            brandId: selectedBrand.value.id,
            operatorEntityId: parentOp,
            ownerEntityId: parentOw,
          },
        })
      }
      successCount++
    }
    addStoreOpen.value = false
    showStatus(`成功添加 ${successCount} 家分店`, "success")
    await openBrandDetail(selectedBrand.value)
  } catch { showStatus("添加分店失败", "error") }
  addStoreSaving.value = false
}

async function saveBrandScore(): Promise<void> {
  if (!selectedBrand.value) return
  brandScoreSaving.value = true
  try {
    await $fetch(`${configBase}/brands/${selectedBrand.value.id}/scores`, {
      method: "PUT",
      body: brandScoreForm as BrandScoreInput,
    })
    const newTotal = brandScoreForm.influenceScore + brandScoreForm.avgSpendScore + brandScoreForm.topicScore
    selectedBrand.value = { ...selectedBrand.value, ...brandScoreForm, totalScore: newTotal }
    const idx = brands.value.findIndex(b => b.id === selectedBrand.value!.id)
    if (idx >= 0) brands.value[idx] = { ...brands.value[idx], ...brandScoreForm, totalScore: newTotal }
    showStatus("品牌分已更新", "success")
  } catch { showStatus("打分失败", "error") }
  brandScoreSaving.value = false
}

// ===== ENTITIES =====
const entityFormOpen = ref(false)
const editingEntityId = ref<number | null>(null)
const entitySearch = ref("")
const entityTypes: EntityType[] = ["企业", "政府", "事业单位", "个人", "其他"]
const geoScopes = ["国际", "全国", "大区", "省", "市", "区", "本地"]
const entityForm = reactive({
  name: "", type: "企业" as EntityType,
  geoScope: undefined as string | undefined,
  location: "", adminLevel: undefined as string | undefined,
  parentEntityId: undefined as number | undefined, description: "",
  districtCode: undefined as string | undefined,
})
function resetEntityForm(): void {
  entityForm.name = ""; entityForm.type = "企业"; entityForm.geoScope = undefined
  entityForm.location = ""; entityForm.adminLevel = undefined
  entityForm.parentEntityId = undefined; entityForm.description = ""
  entityForm.districtCode = undefined
  editingEntityId.value = null
}
function openEntityCreate(): void { resetEntityForm(); entityFormOpen.value = true }
function openEntityEdit(e: Entity): void {
  entityForm.name = e.name; entityForm.type = e.type
  entityForm.geoScope = e.geoScope || undefined; entityForm.location = e.location || ""
  entityForm.adminLevel = e.adminLevel || undefined; entityForm.parentEntityId = e.parentEntityId || undefined
  entityForm.description = e.description || ""; editingEntityId.value = e.id; entityFormOpen.value = true
}
async function saveEntity(): Promise<void> {
  try {
    const url = editingEntityId.value ? `${configBase}/entities/${editingEntityId.value}` : `${configBase}/entities`
    await $fetch(url, { method: editingEntityId.value ? "PUT" : "POST", body: entityForm })
    entityFormOpen.value = false
    showStatus(editingEntityId.value ? "公司已更新" : "公司已创建", "success")
    await fetchEntities(); await fetchBrands()
  } catch { showStatus("保存失败", "error") }
}
async function deleteEntity(id: number): Promise<void> {
  if (!confirm("确定删除此公司？关联的品牌也将被删除。")) return
  await $fetch(`${configBase}/entities/${id}`, { method: "DELETE" })
  showStatus("已删除", "success"); await fetchEntities(); await fetchBrands()
}
const filteredEntities = computed(() => {
  if (!entitySearch.value) return entities.value
  const q = entitySearch.value.toLowerCase()
  return entities.value.filter(e => e.name.toLowerCase().includes(q) || (e.location || "").toLowerCase().includes(q))
})
function entityTypeBadge(type: EntityType): string {
  const m: Record<string, string> = { "企业":"bg-blue-100 text-blue-700", "政府":"bg-red-100 text-red-700", "事业单位":"bg-purple-100 text-purple-700", "个人":"bg-slate-100 text-slate-600", "其他":"bg-slate-100 text-slate-600" }
  return m[type] || "bg-slate-100 text-slate-600"
}

// ===== INIT =====
async function fetchBrands(): Promise<void> {
  try { brands.value = await $fetch<Brand[]>(`${configBase}/brands`) } catch { /* */ }
}
async function fetchEntities(): Promise<void> {
  try { entities.value = await $fetch<Entity[]>(`${configBase}/entities`) } catch { /* */ }
}
async function fetchCategories(): Promise<void> {
  try { categories.value = await $fetch<StructureCategory[]>(`${configBase}/categories`) } catch { /* */ }
}
async function fetchDistricts(): Promise<void> {
  try { districts.value = await $fetch<any[]>(`${configBase}/districts`) } catch { districts.value = [] }
}

onMounted(async () => {
  await fetchBrands(); await fetchEntities(); await fetchCategories(); await fetchDistricts()
})

function catName(code: string): string {
  const cat = categories.value.find(c => c.code === code)
  return cat?.name || code
}
function catColor(code: string): string {
  const m: Record<string, string> = { mall:"bg-amber-100 text-amber-700", shop:"bg-pink-100 text-pink-700", office:"bg-indigo-100 text-indigo-700", residential:"bg-orange-100 text-orange-700", school:"bg-emerald-100 text-emerald-700", park:"bg-green-100 text-green-700", road:"bg-slate-200 text-slate-700", river:"bg-cyan-100 text-cyan-700", other:"bg-gray-100 text-gray-600" }
  return m[code] || "bg-gray-100 text-gray-600"
}
function brandTypeClass(type?: string): string {
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

// 品牌图标智能匹配：优先使用 DB 中的 icon，为空则按名称关键词匹配，最后兜底
const BRAND_ICON_FALLBACK: Record<string, string> = {
  "肯德基": "🍗", "麦当劳": "🍔", "星巴克": "☕", "喜茶": "🍵", "奈雪": "🍰",
  "海底捞": "🍲", "太二": "🐟", "西贝": "🥟", "优衣库": "👕", "ZARA": "🛍️",
  "H&M": "👗", "MUJI": "🛒", "Apple": "🍎", "蔚来": "🚗", "霸王茶姬": "🍶",
  "泡泡玛特": "🧸", "迪卡侬": "🏃", "乐高": "🧱", "海马体": "📸", "西西弗": "📚",
  "MANNER": "☕", "银泰城": "🏬", "银泰": "🏬", "万达": "🏬", "万象城": "🏬",
  "天街": "🏬", "大悦城": "🏬", "来福士": "🏬", "印象城": "🏬",
}
function brandIcon(brand: { name: string; icon?: string | null }): string {
  if (brand.icon && brand.icon.trim()) return brand.icon.trim()
  for (const [key, icon] of Object.entries(BRAND_ICON_FALLBACK)) {
    if (brand.name.includes(key)) return icon
  }
  return '🏷️'
}
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
          <NuxtLink to="/buildings" class="text-sm text-slate-500 hover:text-slate-900 transition-colors">建筑中心</NuxtLink>
          <span class="text-slate-300">|</span>
          <h1 class="text-lg font-bold text-slate-800">🏷️ 商业中心</h1>
        </div>
        <span class="text-xs text-slate-400">{{ brands.length }} 个品牌</span>
      </div>
    </header>

    <!-- Tab Bar -->
    <div class="bg-white border-b border-slate-200">
      <div class="max-w-7xl mx-auto px-6 flex gap-0">
        <button
          v-for="tab in [
            { key: 'brands' as Tab, label: '品牌管理', icon: Store },
            { key: 'entities' as Tab, label: '公司集团', icon: Building2 },
          ]"
          :key="tab.key"
          @click="activeTab = tab.key"
          class="flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === tab.key ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'"
        >
          <component :is="tab.icon" class="w-4 h-4" /> {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- Status -->
    <div class="max-w-7xl mx-auto px-6 py-4">
      <transition name="fade">
        <div v-if="statusMsg" class="px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-sm">{{ statusMsg }}</div>
      </transition>
    </div>

    <!-- ===== TAB: BRANDS ===== -->
    <section v-if="activeTab === 'brands'" class="max-w-7xl mx-auto px-6 py-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-xl font-bold text-slate-800">品牌管理</h2>
          <p class="text-sm text-slate-500 mt-1">对品牌评分，旗下店铺自动继承分数</p>
        </div>
        <button @click="openBrandCreate()" class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
          <Plus class="w-4 h-4" /> 添加品牌
        </button>
      </div>

      <div class="mb-4">
        <FilterBar
          v-model="selectedBrandCategory"
          v-model:search-query="searchQuery"
          :filters="brandCategoryFilters"
          search-placeholder="搜索品牌或公司..."
        />
      </div>

      <!-- Brand Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <button
          v-for="b in filteredBrands"
          :key="b.id"
          @click="openBrandDetail(b)"
          class="bg-white rounded-xl border border-slate-200 p-5 text-left hover:shadow-lg hover:border-indigo-300 transition-all group cursor-pointer"
        >
          <div class="flex items-start justify-between mb-3">
            <span class="text-3xl">{{ brandIcon(b) }}</span>
            <ChevronRight class="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
          </div>
          <h3 class="font-semibold text-slate-800 mb-1">{{ b.name }}</h3>
            <div class="space-y-1 text-xs text-slate-500">
            <div class="flex items-center gap-1">
              <Building2 class="w-3 h-3" /> {{ b.entityName || '未分配' }}
              <span v-if="b.brandType" class="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium"
                :class="btColor(b.brandType)">
                <AppIcon :name="brandTypeIcon(b.brandType)" :size="11" />
                {{ btLabel(b.brandType) }}
              </span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-400">{{ b.category || '未分类' }}</span>
              <span class="flex items-center gap-0.5 text-amber-600 font-semibold">
                <Star class="w-3.5 h-3.5 fill-amber-400 text-amber-400" />{{ b.totalScore ?? 3 }}
              </span>
            </div>
          </div>
        </button>
      </div>
      <p v-if="filteredBrands.length === 0" class="text-slate-400 text-sm text-center py-20">暂无品牌，点击"添加品牌"创建</p>
    </section>

    <!-- ===== TAB: ENTITIES ===== -->
    <section v-if="activeTab === 'entities'" class="max-w-7xl mx-auto px-6 py-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-xl font-bold text-slate-800">公司集团</h2>
          <p class="text-sm text-slate-500 mt-1">管理品牌所属的公司/集团，支持层级关系</p>
        </div>
        <button @click="openEntityCreate" class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
          <Plus class="w-4 h-4" /> 添加公司
        </button>
      </div>
      <div class="relative max-w-sm mb-4">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input v-model="entitySearch" class="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" placeholder="搜索公司..." />
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="e in filteredEntities" :key="e.id" class="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow group">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="font-bold text-slate-800">{{ e.name }}</h3>
                <span class="text-xs px-1.5 py-0.5 rounded font-medium" :class="entityTypeBadge(e.type)">{{ e.type }}</span>
              </div>
              <div class="flex items-center gap-2 text-xs text-slate-500">
                <span v-if="e.geoScope" class="flex items-center gap-0.5"><MapPin class="w-3 h-3" />{{ e.geoScope }}</span>
                <span v-if="e.location">{{ e.location }}</span>
              </div>
              <p v-if="e.parentEntityName" class="text-xs text-slate-400 mt-1">归属: {{ e.parentEntityName }}</p>
              <p v-if="e.description" class="text-xs text-slate-500 mt-2 line-clamp-2">{{ e.description }}</p>
            </div>
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
              <button @click="openEntityEdit(e)" class="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Edit3 class="w-3.5 h-3.5" /></button>
              <button @click="deleteEntity(e.id)" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 class="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>
      </div>
      <p v-if="filteredEntities.length === 0" class="text-slate-400 text-sm text-center py-12">暂无公司</p>
    </section>

    <!-- ===== BRAND DETAIL MODAL ===== -->
    <Teleport to="body">
      <div
        v-if="selectedBrand"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        @click.self="closeBrandDetail"
      >
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <!-- Modal Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div class="flex items-center gap-3">
              <span class="text-3xl">{{ brandIcon(selectedBrand) }}</span>
              <div>
                <h2 class="text-xl font-bold text-slate-800">{{ selectedBrand.name }}</h2>
                <p class="text-xs text-slate-400">
                  {{ selectedBrand.entityName }}
                  <span v-if="selectedBrand.brandType" class="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium"
                    :class="btColor(selectedBrand.brandType)">
                    <AppIcon :name="brandTypeIcon(selectedBrand.brandType)" :size="11" />
                    {{ btLabel(selectedBrand.brandType) }}
                  </span>
                  <span class="ml-2 inline-flex items-center gap-1 text-amber-600 font-medium">
                    <Star class="w-3 h-3 fill-amber-400" />{{ selectedBrand.totalScore ?? 3 }} 分
                  </span>
                </p>
              </div>
            </div>
            <button @click="closeBrandDetail" class="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
              <X class="w-5 h-5" />
            </button>
          </div>

          <!-- Modal Body: 2-panel -->
          <div class="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
            <!-- LEFT: Score Panel -->
            <div class="p-5 space-y-4">
              <div class="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                <h3 class="text-sm font-semibold text-amber-800 flex items-center gap-2 mb-4">
                  <Star class="w-4 h-4" /> 品牌打分
                  <span class="text-xs font-normal text-amber-500">(店铺自动继承)</span>
                </h3>
                <div class="space-y-4">
                  <div>
                    <div class="flex items-center justify-between mb-1">
                      <label class="text-sm font-medium text-slate-600">影响力</label>
                      <span class="text-sm font-bold text-amber-600">{{ brandScoreForm.influenceScore }}</span>
                    </div>
                    <input type="range" min="1" max="10" v-model.number="brandScoreForm.influenceScore" class="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500" />
                  </div>
                  <div>
                    <div class="flex items-center justify-between mb-1">
                      <label class="text-sm font-medium text-slate-600">客单价</label>
                      <span class="text-sm font-bold text-blue-600">{{ brandScoreForm.avgSpendScore }}</span>
                    </div>
                    <input type="range" min="1" max="10" v-model.number="brandScoreForm.avgSpendScore" class="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                  </div>
                  <div>
                    <div class="flex items-center justify-between mb-1">
                      <label class="text-sm font-medium text-slate-600">话题度</label>
                      <span class="text-sm font-bold text-emerald-600">{{ brandScoreForm.topicScore }}</span>
                    </div>
                    <input type="range" min="1" max="10" v-model.number="brandScoreForm.topicScore" class="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                  </div>
                  <div class="p-3 bg-amber-100/50 rounded-lg border border-amber-300">
                    <div class="flex items-center justify-between">
                      <span class="text-sm font-medium text-amber-800">总分</span>
                      <span class="text-2xl font-bold text-amber-700">{{ brandScoreForm.influenceScore + brandScoreForm.avgSpendScore + brandScoreForm.topicScore }}</span>
                    </div>
                  </div>
                  <button
                    @click="saveBrandScore"
                    :disabled="brandScoreSaving"
                    class="w-full py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <Star class="w-4 h-4" /> {{ brandScoreSaving ? '保存中...' : '保存打分' }}
                  </button>
                </div>
              </div>

              <div class="flex gap-2">
                <button @click="openBrandEdit(selectedBrand)" class="flex-1 py-2 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors">
                  ✏️ 编辑品牌
                </button>
                <button @click="deleteBrand(selectedBrand.id); closeBrandDetail()" class="flex-1 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                  🗑 删除
                </button>
              </div>
            </div>

            <!-- CENTER/RIGHT: Info + Stores -->
            <div class="lg:col-span-2 p-5 space-y-4">
              <!-- Brand Info -->
              <div class="rounded-xl border border-slate-200 p-4">
                <h3 class="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-3">
                  <Hash class="w-4 h-4 text-slate-400" /> 品牌信息
                </h3>
                <div class="grid grid-cols-2 gap-3 text-sm">
                  <div><span class="text-slate-400">名称</span><p class="font-medium text-slate-800">{{ selectedBrand.name }}</p></div>
                  <div><span class="text-slate-400">所属公司</span><p class="font-medium text-slate-800">{{ selectedBrand.entityName }}</p></div>
                  <div><span class="text-slate-400">品牌类型</span><p class="font-medium text-slate-800 flex items-center gap-1"><AppIcon v-if="selectedBrand.brandType" :name="brandTypeIcon(selectedBrand.brandType)" :size="14" /> {{ btLabel(selectedBrand.brandType) || '—' }}</p></div>
                  <div><span class="text-slate-400">品牌类别</span><p class="font-medium text-slate-800">{{ selectedBrand.category || '—' }}</p></div>
                  <div><span class="text-slate-400">店铺数</span><p class="font-medium text-slate-800">{{ brandStores.length }} 家</p></div>
                </div>
                <p v-if="selectedBrand.description" class="text-xs text-slate-500 mt-3">{{ selectedBrand.description }}</p>
              </div>

              <!-- Store Locations -->
              <div class="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="text-sm font-semibold text-emerald-800 flex items-center gap-2">
                    <MapPin class="w-4 h-4" /> 分店分布
                    <span class="text-xs font-normal text-emerald-600">({{ brandStores.length }} 家)</span>
                  </h3>
                  <button @click="openAddStore" class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors">
                    <Plus class="w-3.5 h-3.5" /> 添加分店
                  </button>
                </div>
                <div v-if="loadingStores" class="flex items-center justify-center py-8">
                  <div class="animate-spin w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full" />
                </div>
                <div v-else-if="brandStores.length === 0" class="text-sm text-slate-400 py-4">该品牌暂无店铺实体</div>
                <div v-else class="space-y-2">
                  <div v-for="region in storeRegions" :key="region.province" class="bg-white rounded-lg border border-slate-100 overflow-hidden">
                    <button
                      @click="toggleRegion(region.province)"
                      class="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
                    >
                      <div class="flex items-center gap-2">
                        <component :is="expandedRegions.has(region.province) ? ChevronDown : ChevronRight2" class="w-4 h-4 text-slate-400" />
                        <span class="font-semibold text-sm text-slate-700">📍 {{ region.province }}</span>
                        <span class="text-xs text-slate-400">({{ region.cities.reduce((sum, c) => sum + c.districts.reduce((s, d) => s + d.stores.length, 0), 0) }} 家)</span>
                      </div>
                    </button>
                    <div v-if="expandedRegions.has(region.province)" class="border-t border-slate-100 px-4 py-2 space-y-1.5">
                      <div v-for="city in region.cities" :key="city.city" class="pl-4">
                        <p class="text-xs font-medium text-slate-500 mb-1">🏙 {{ city.city }}</p>
                        <div class="space-y-1 pl-3">
                          <div v-for="dist in city.districts" :key="dist.district" class="text-xs text-slate-400 mb-0.5">
                            📍 {{ dist.district }}
                          </div>
                          <div class="flex flex-wrap gap-1.5">
                            <span
                              v-for="store in city.districts.flatMap(d => d.stores)"
                              :key="store.id"
                              class="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded-full text-xs text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 transition-colors cursor-default"
                            >
                              <span class="inline-flex items-center gap-0.5 text-[10px] px-1 py-0 rounded font-medium" :class="subtypeColor(store.structureSubtype)">
                                <AppIcon :name="subtypeIcon(store.structureSubtype)" :size="10" />
                                {{ subtypeLabel(store.structureSubtype) }}
                              </span>
                              {{ store.name || '#' + store.id }}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ===== ADD STORE MODAL ===== -->
    <Teleport to="body">
      <div v-if="addStoreOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" @click.self="addStoreOpen = false">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h3 class="text-lg font-bold text-slate-800">为「{{ selectedBrand?.name }}」添加分店</h3>
            <button @click="addStoreOpen = false" class="p-2 text-slate-400 hover:text-slate-700 rounded-lg"><X class="w-5 h-5" /></button>
          </div>

          <!-- Tabs -->
          <div class="flex border-b border-slate-100 px-6">
            <button @click="addStoreTab = 'structures'" class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors" :class="addStoreTab === 'structures' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500'">🏗 已有建筑</button>
            <button @click="addStoreTab = 'features'" class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors" :class="addStoreTab === 'features' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500'">🗺 地图要素</button>
          </div>

          <div class="flex-1 overflow-y-auto p-5">
            <!-- TAB: Structures -->
            <template v-if="addStoreTab === 'structures'">
              <p class="text-xs text-slate-500 mb-3">选择可商用的建筑作为品牌分店（已关联其他品牌的也可重新分配）</p>
              <div v-if="loadingAvailable" class="flex justify-center py-8">
                <div class="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full" />
              </div>
              <div v-else-if="availableStructures.length === 0" class="text-sm text-slate-400 py-8 text-center">
                暂无可用建筑。请先在建筑中心创建可商用的建筑。
              </div>
              <div v-else class="space-y-2">
                <label v-for="s in availableStructures" :key="s.id" class="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:border-indigo-300 cursor-pointer transition-colors" :class="{ 'bg-indigo-50 border-indigo-300': selectedStoreIds.has(s.id) }">
                  <input type="checkbox" :checked="selectedStoreIds.has(s.id)" @change="toggleStoreSelection(s.id)" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  <div class="flex-1">
                    <p class="text-sm font-medium text-slate-800">{{ s.name || '(未命名)' }}</p>
                    <div class="flex items-center gap-2 text-xs text-slate-400">
                      <span class="inline-flex items-center gap-1 px-1 py-0 rounded" :class="subtypeColor(s.structureSubtype)">
                        <AppIcon :name="subtypeIcon(s.structureSubtype)" :size="10" />
                        {{ subtypeLabel(s.structureSubtype) }}
                      </span>
                      <span v-if="s.parentStructureName" class="flex items-center gap-1"><AppIcon name="mall" :size="10" /> {{ s.parentStructureName }}内</span>
                      <span v-if="s.brandName" class="flex items-center gap-1 text-amber-600"><AppIcon name="brand" :size="10" /> {{ s.brandName }}</span>
                      <span v-else class="text-emerald-600">未关联品牌</span>
                    </div>
                  </div>
                </label>
              </div>
            </template>

            <!-- TAB: Map Features -->
            <template v-if="addStoreTab === 'features'">
              <p class="text-xs text-slate-500 mb-3">选择地图上未关联建筑的区域自动创建为品牌分店</p>
              <div v-if="loadingFeatures" class="flex justify-center py-8">
                <div class="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full" />
              </div>
              <div v-else-if="availableFeatures.length === 0" class="text-sm text-slate-400 py-8 text-center">
                所有地图要素都已关联建筑，暂无可用要素。
              </div>
              <div v-else class="space-y-2">
                <label v-for="f in availableFeatures" :key="f.id" class="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:border-indigo-300 cursor-pointer transition-colors" :class="{ 'bg-indigo-50 border-indigo-300': selectedFeatureIds.has(f.id) }">
                  <input type="checkbox" :checked="selectedFeatureIds.has(f.id)" @change="toggleFeatureSelection(f.id)" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  <div class="flex-1">
                    <p class="text-sm font-medium text-slate-800">{{ f.name || '(未命名地图要素)' }}</p>
                    <div class="flex items-center gap-2 text-xs text-slate-400">
                      <span class="inline-flex items-center gap-1 px-1 py-0 rounded bg-slate-100 text-slate-600">
                        <AppIcon :name="kindIcon(f.kind)" :size="10" />
                        {{ f.kind }}
                      </span>
                      <span>{{ f.geometryType }}</span>
                      <span class="text-indigo-500">自动创建建筑</span>
                    </div>
                  </div>
                </label>
              </div>
            </template>
          </div>

          <div class="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
            <button @click="addStoreOpen = false" class="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">取消</button>
            <button @click="confirmAddStores" :disabled="addStoreSaving || (selectedStoreIds.size === 0 && selectedFeatureIds.size === 0)" class="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-1">
              <Plus class="w-3.5 h-3.5" /> {{ addStoreSaving ? '关联中...' : `关联 ${selectedStoreIds.size + selectedFeatureIds.size} 家分店` }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ===== BRAND FORM MODAL ===== -->
    <Teleport to="body">
      <div v-if="brandFormOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" @click.self="brandFormOpen = false">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
          <h3 class="text-lg font-bold text-slate-800 mb-4">{{ editingBrandId ? '编辑' : '新建' }}品牌</h3>
          <div class="space-y-3">
            <div><label class="block text-xs font-medium text-slate-500 mb-1">所属公司</label><select v-model="brandForm.entityId" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-200"><option :value="0" disabled>选择公司...</option><option v-for="e in entities" :key="e.id" :value="e.id">{{ e.name }} ({{ e.type }})</option></select></div>
            <div><label class="block text-xs font-medium text-slate-500 mb-1">品牌名称</label><input v-model="brandForm.name" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" placeholder="如：肯德基" /></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-medium text-slate-500 mb-1">图标 (Emoji)</label><input v-model="brandForm.icon" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" placeholder="如：🍗" maxlength="4" /></div>
              <div><label class="block text-xs font-medium text-slate-500 mb-1">排序</label><input v-model.number="brandForm.sortOrder" type="number" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" /></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-medium text-slate-500 mb-1">品牌类型</label>
                <select v-model="brandForm.brandType" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-200">
                  <option value="">-- 选择类型 --</option>
                  <option value="owner">业主品牌（房东）</option>
                  <option value="customer">客户品牌（租户）</option>
                  <option value="both">均可</option>
                </select>
              </div>
              <div><label class="block text-xs font-medium text-slate-500 mb-1">品牌类别</label><input v-model="brandForm.category" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" placeholder="如：餐饮、零售、服饰..." /></div>
            </div>
            <div><label class="block text-xs font-medium text-slate-500 mb-1">描述</label><textarea v-model="brandForm.description" rows="2" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-none" placeholder="简要描述..." /></div>
          </div>
          <div class="flex justify-end gap-2 mt-5"><button @click="brandFormOpen = false" class="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">取消</button><button @click="saveBrand" class="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1"><Save class="w-3.5 h-3.5" /> 保存</button></div>
        </div>
      </div>
    </Teleport>

    <!-- ===== ENTITY FORM MODAL ===== -->
    <Teleport to="body">
      <div v-if="entityFormOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" @click.self="entityFormOpen = false">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
          <h3 class="text-lg font-bold text-slate-800 mb-4">{{ editingEntityId ? '编辑' : '新建' }}公司</h3>
          <div class="space-y-3">
            <div><label class="block text-xs font-medium text-slate-500 mb-1">名称</label><input v-model="entityForm.name" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" placeholder="如：百胜中国" /></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-medium text-slate-500 mb-1">类型</label><select v-model="entityForm.type" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-200"><option v-for="t in entityTypes" :key="t" :value="t">{{ t }}</option></select></div>
              <div><label class="block text-xs font-medium text-slate-500 mb-1">覆盖范围</label><select v-model="entityForm.geoScope" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-200"><option :value="undefined">不限</option><option v-for="s in geoScopes" :key="s" :value="s">{{ s }}</option></select></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-medium text-slate-500 mb-1">位置</label><input v-model="entityForm.location" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" placeholder="如：上海" /></div>
              <div><label class="block text-xs font-medium text-slate-500 mb-1">行政区</label><select v-model="entityForm.districtCode" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-200"><option :value="undefined">不限</option><option v-for="d in districts" :key="d.code" :value="d.code">{{ d.full_name || d.name }} ({{ d.level }})</option></select></div>
            </div>
            <div><label class="block text-xs font-medium text-slate-500 mb-1">上级公司</label>
              <select v-model="entityForm.parentEntityId" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-200">
                <option :value="undefined">无</option>
                <option v-for="e in entities.filter(x => x.id !== editingEntityId)" :key="e.id" :value="e.id">{{ e.name }} ({{ e.type }})</option>
              </select>
            </div>
            <div><label class="block text-xs font-medium text-slate-500 mb-1">描述</label><textarea v-model="entityForm.description" rows="2" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-none" placeholder="简要描述..." /></div>
          </div>
          <div class="flex justify-end gap-2 mt-5"><button @click="entityFormOpen = false" class="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">取消</button><button @click="saveEntity" class="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1"><Save class="w-3.5 h-3.5" /> 保存</button></div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

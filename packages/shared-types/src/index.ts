export type DrawMode = "select" | "edit"

// ===== 地块类型（四层模型 Layer 1） =====
// parcel_* 是用户在地图上绘制的地块（用地级别）
// 一个地块可包含多栋建筑，一栋建筑可跨多个地块
export type FeatureKind =
  | "parcel_residential"   // 住宅地块
  | "parcel_commercial"    // 商业地块
  | "parcel_mixed"         // 混合用地
  | "residential"          // [兼容旧值] 等价于 parcel_residential
  | "commercial"           // [兼容旧值] 等价于 parcel_commercial
  | "road"                 // 道路
  | "poi"                  // 兴趣点

export function inferFeatureKind(geometryType: string, kindValue?: string): FeatureKind {
  // 新格式优先
  if (kindValue === "parcel_residential" || kindValue === "parcel_commercial" || kindValue === "parcel_mixed") {
    return kindValue
  }
  // 兼容旧格式 → 自动映射到新格式
  if (kindValue === "residential") return "parcel_residential"
  if (kindValue === "commercial") return "parcel_commercial"
  if (kindValue === "road") return "road"
  if (kindValue === "poi") return "poi"

  if (geometryType === "Point") return "poi"
  if (geometryType === "LineString" || geometryType === "MultiLineString") return "road"
  return "parcel_residential"
}

/** 判断一个 kind 是否为地块类型（需要多边形绘制） */
export function isParcelKind(kind: FeatureKind): boolean {
  return kind === "parcel_residential" || kind === "parcel_commercial" || kind === "parcel_mixed"
    || kind === "residential" || kind === "commercial"
}

export type PoiSource = "manual" | "amap" | "osm" | "brand_official" | "dianping"

export interface FeatureProperties {
  name?: string
  description?: string
  kind?: FeatureKind
  color?: string
  hidden?: boolean
  speedKph?: number
  capacity?: number
  oneWay?: boolean
  // POI 关联
  poiSource?: PoiSource
  poiCategoryId?: number
  poiCategoryCode?: string
  poiCategoryName?: string
  // 商场关联
  mallProfile?: MallProfile
  // 父子关系
  parentFeatureId?: number
  childFeatureIds?: number[]
  [key: string]: unknown
}

// ===== 商场精细化属性 =====
export interface MallProfile {
  id?: number
  featureId: number
  name?: string                // 商场名称，自动从地图要素的 name 属性填充
  commercialAreaSqm?: number   // 商业面积（总建筑面积）
  floorCount?: number          // 楼层数（不含纯停车层）
  openingDate?: string         // 开业时间 (ISO date)
  extraJson?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

// ===== POI 分类 =====
export interface PoiCategory {
  id: number
  code: string            // e.g. 'dining', 'retail', 'entertainment', 'service'
  name: string            // e.g. '餐饮', '零售', '娱乐', '服务'
  icon?: string
  sortOrder: number
}

// ===== POI 自动获取参数 =====
export interface PoiFetchRequest {
  projectId: number
  parentFeatureId: number   // 商场 feature id
  lat: number
  lng: number
  radiusMeters?: number     // 搜索半径，默认 500
  source: PoiSource         // 'amap' | 'osm' | etc
  categoryFilter?: string[] // 可选分类过滤
}

export interface PoiFetchResult {
  source: PoiSource
  fetched: number
  features: GeoJSON.Feature[]
}

export interface KindStyleConfig {
  kind: FeatureKind
  color: string
  visible: boolean
}

export interface MeasurementInfo {
  areaSqm?: number
  lengthKm?: number
  coordinates?: [number, number]
}

export interface SelectedFeatureInfo {
  id: string
  geometryType: "Point" | "LineString" | "Polygon"
  properties: FeatureProperties
  measurement: MeasurementInfo
}

export interface SavedProject {
  type: "FeatureCollection"
  features: GeoJSON.Feature[]
  metadata: {
    projectName: string
    savedAt: string
    featureCount: number
    kindStyles: KindStyleConfig[]
  }
}

export interface ProjectRecord {
  id: number
  name: string
  srid: number
  createdAt: string
  updatedAt: string
}

// ===== CTI 数据模型 v2 =====

// -- Entity 主体 --

export type EntityType = '企业' | '政府' | '事业单位' | '个人' | '其他'
export type GeoScope = '国际' | '全国' | '大区' | '省' | '市' | '区' | '本地'
export type AdminLevel = '省' | '市' | '区县' | '乡镇'

export interface Entity {
  id: number
  name: string
  type: EntityType
  geoScope?: GeoScope
  location?: string
  adminLevel?: AdminLevel
  parentEntityId?: number
  parentEntityName?: string
  districtCode?: string
  districtFullName?: string
  description?: string
  createdAt?: string
  updatedAt?: string
}

export interface EntityInput {
  name: string
  type: EntityType
  geoScope?: GeoScope
  location?: string
  adminLevel?: AdminLevel
  parentEntityId?: number
  description?: string
}

// -- Brand 品牌/系列 --

export type BrandType = 'owner' | 'customer' | 'both'

export interface Brand {
  id: number
  name: string
  entityId: number
  entityName?: string
  brandType?: BrandType
  description?: string
  sortOrder: number
  icon?: string
  influenceScore: number
  avgSpendScore: number
  topicScore: number
  totalScore: number
  category?: string
  createdAt?: string
  updatedAt?: string
}

export interface BrandInput {
  name: string
  entityId: number
  brandType?: BrandType
  description?: string
  sortOrder?: number
  icon?: string
  category?: string
  influenceScore?: number
  avgSpendScore?: number
  topicScore?: number
}

export interface BrandScoreInput {
  influenceScore: number
  avgSpendScore: number
  topicScore: number
}

// -- Structure 建筑/构筑物 --

export type StructureType = 'constructed' | 'natural' | 'hybrid'
export type StructureSubtype = 'mall' | 'road' | 'school' | 'park' | 'river' | 'office' | 'residential' | 'shop' | 'other'

export interface Structure {
  id: number
  projectId: number
  featureId?: number
  structureType: StructureType
  structureSubtype: StructureSubtype
  name?: string
  brandId?: number
  brandName?: string
  categoryId?: number
  categoryName?: string
  categoryCanBeCommercial?: boolean
  // v2 品牌打分继承字段
  brandInfluenceScore?: number
  brandAvgSpendScore?: number
  brandTopicScore?: number
  brandTotalScore?: number
  operatorEntityId?: number
  operatorEntityName?: string
  ownerEntityId?: number
  ownerEntityName?: string
  parentStructureId?: number
  parentStructureName?: string
  extraJson: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

export interface StructureCategory {
  id: number
  code: string
  name: string
  canBeCommercial: boolean
  sortOrder: number
}

export interface StructureInput {
  projectId: number
  featureId?: number
  structureType: StructureType
  structureSubtype: StructureSubtype
  name?: string
  brandId?: number
  categoryId?: number
  operatorEntityId?: number
  ownerEntityId?: number
  parentStructureId?: number
  extraJson?: Record<string, unknown>
}

// -- Structure 子类型属性 --

export interface MallAttrs {
  structureId: number
  commercialAreaSqm?: number
  rentableAreaSqm?: number
  floorCount?: number
  openingDate?: string
  extraJson: Record<string, unknown>
}

export interface RoadAttrs {
  structureId: number
  speedKph?: number
  capacity?: number
  laneCount?: number
  oneWay: boolean
  roadClass?: string
  extraJson: Record<string, unknown>
}

export interface SchoolAttrs {
  structureId: number
  eduLevel?: string
  studentCount?: number
  teacherCount?: number
  isPublic: boolean
  extraJson: Record<string, unknown>
}

export interface ParkAttrs {
  structureId: number
  areaSqm?: number
  greenCoveragePct?: number
  amenityCount: number
  extraJson: Record<string, unknown>
}

export interface RiverAttrs {
  structureId: number
  widthM?: number
  waterType?: string
  floodSeason?: string
  extraJson: Record<string, unknown>
}

// -- 打分体系 --

export interface StructureScore {
  id: number
  structureId: number
  scoredAt: string
  scoreVersion: string
  totalScore: number
  notes?: string
}

export interface MallScore {
  structureScoreId: number
  influenceScore: number
  avgSpendScore: number
  topicScore: number
}

export interface RoadScore {
  structureScoreId: number
  connectivityScore: number
  trafficVolumeScore: number
  roadQualityScore: number
}

export interface SchoolScore {
  structureScoreId: number
  academicRepScore: number
  facilitiesScore: number
  teacherRatioScore: number
}

export interface ParkScore {
  structureScoreId: number
  accessibilityScore: number
  amenityDensityScore: number
  greenQualityScore: number
}

/** 带汇总信息的结构体打分 */
export interface StructureScoreSummary {
  structureId: number
  structureName?: string
  structureSubtype: string
  brandName?: string
  operatorName?: string
  latestScore?: number
  scoreCount: number
}

// -- 行政区划 --

export type DistrictLevel = 'country' | 'province' | 'city' | 'district'

export interface AdminDistrict {
  id: number
  code: string
  name: string
  level: DistrictLevel
  parentCode?: string
  fullName?: string
  centerLng?: number
  centerLat?: number
  population?: number
  extraJson: Record<string, unknown>
}

// ===== 项目创建 v2 =====

export type ProjectSourceType = 'manual' | 'admin_district' | 'bbox'

export interface BBox {
  south: number
  west: number
  north: number
  east: number
}

export interface ProjectCreateRequest {
  name: string
  srid?: number
  /** 'admin_district' | 'bbox' | undefined (manual) */
  sourceType?: ProjectSourceType
  /** 行政区代码（sourceType='admin_district' 时必填） */
  districtCode?: string
  /** 手动框选范围（sourceType='bbox' 时必填） */
  bbox?: BBox
  /** 是否自动导入 OSM 数据 (默认 true) */
  importOsm?: boolean
  /** OSM 导入选项 */
  osmOptions?: {
    includeBuildings?: boolean
    includeLanduse?: boolean
  }
}

export interface ProjectCreateResponse {
  project: {
    id: number
    name: string
    srid: number
    sourceType?: string
    districtCode?: string
    bounds?: GeoJSON.Polygon | null
    createdAt: string
    updatedAt: string
  }
  importResult?: {
    featuresImported: number
    stats: {
      roads: number
      railways: number
      waterways: number
      buildings: number
      landuse: number
    }
    warnings: string[]
  } | null
}

export interface OsmImportResponse {
  featuresImported: number
  stats: {
    roads: number
    railways: number
    waterways: number
    buildings: number
    landuse: number
  }
  warnings: string[]
}

export interface ProjectLayer {
  layerId: string
  label: string
  featureType: string
  featureCount: number
  visible: boolean
  color: string
}

export interface ProjectLayersResponse {
  projectId: number
  layers: ProjectLayer[]
  totalFeatures: number
}

/** 道路等级常量映射 */
export const ROAD_CLASS_LABELS: Record<string, string> = {
  motorway: "高速公路",
  trunk: "快速路",
  primary: "主干道",
  secondary: "次干道",
  tertiary: "支路",
  residential: "街坊路",
  service: "服务路",
  pedestrian: "步道",
  rail_hsr: "高铁",
  rail_conventional: "普速铁路",
  rail_metro: "地铁",
  rail_tram: "轻轨",
  water_river: "江河",
  water_canal: "运河",
  water_lake: "湖泊",
  water_sea: "海洋"
}

export const ROAD_CLASS_COLORS: Record<string, string> = {
  motorway: "#e63946",
  trunk: "#f4a261",
  primary: "#e9c46a",
  secondary: "#2a9d8f",
  tertiary: "#457b9d",
  residential: "#a8dadc",
  service: "#8d99ae",
  pedestrian: "#b5838d",
  rail_hsr: "#d00000",
  rail_conventional: "#9d0208",
  rail_metro: "#6a040f",
  rail_tram: "#dc2f02",
  water_river: "#0077b6",
  water_canal: "#00b4d8",
  water_lake: "#90e0ef",
  water_sea: "#03045e"
}

// ===== 自定义错误类 =====

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500
  ) {
    super(message)
    this.name = "AppError"
  }
}

export class InvalidIdError extends AppError {
  constructor() {
    super("Invalid id", 400)
    this.name = "InvalidIdError"
  }
}

// -- 通用过滤器 --

export interface FilterOption {
  key: string
  label: string
  count?: number
  color?: string
  icon?: string
}

export interface PaginationState {
  page: number
  pageSize: number
  total: number
}

// ===== 四层模型：地块↔建筑 M:N 关联 =====

/** 地块-建筑关联关系类型 */
export type ParcelStructureRelation = 'located_in' | 'intersects' | 'adjacent' | 'part_of'

/** 地块-建筑关联记录 */
export interface ParcelStructure {
  parcelId: number
  structureId: number
  relation: ParcelStructureRelation
  createdAt?: string
  // JOIN 字段
  parcelName?: string
  parcelType?: string
  structureName?: string
  structureSubtype?: string
  brandName?: string
}

/** 创建/更新地块-建筑关联的输入 */
export interface ParcelStructureInput {
  structureId: number
  relation?: ParcelStructureRelation
}

/** 地块详情（含关联的建筑列表） */
export interface ParcelDetail {
  parcelId: number
  parcelName?: string
  parcelType: string
  areaSqm?: number
  structures: ParcelStructure[]
  structureCount: number
}

/** 地块 FeatureKind 到默认建筑 subtype 的映射 */
export function parcelKindToSubtype(kind: FeatureKind): string {
  if (kind === "parcel_commercial" || kind === "commercial") return "mall"
  if (kind === "parcel_residential" || kind === "residential") return "residential"
  if (kind === "parcel_mixed") return "mall"
  return "other"
}


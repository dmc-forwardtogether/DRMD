/**
 * OSM (OpenStreetMap) 数据导入服务
 * 通过 Overpass API 获取指定区域的 OSM 数据
 * 映射到 DRMD feature_type 体系
 */

// OSM Overpass API endpoints
// 可通过环境变量 OVERPASS_URL 自定义（如内网代理）
const OVERPASS_ENDPOINTS = (() => {
  const custom = process.env.OVERPASS_URL
  if (custom) {
    return [custom]
  }
  return [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
    "https://overpass.osm.ch/api/interpreter"
  ]
})()

/** Overpass 返回的 OSM 元素类型 */
interface OsmElement {
  type: "node" | "way" | "relation"
  id: number
  lat?: number
  lon?: number
  nodes?: number[]
  members?: Array<{ type: string; ref: number; role: string }>
  tags?: Record<string, string>
  geometry?: Array<{ lat: number; lon: number }>
}

interface OverpassResponse {
  version: number
  generator: string
  osm3s: { timestamp_osm_base: string; copyright: string }
  elements: OsmElement[]
}

/** DRMD 道路等级映射 */
const HIGHWAY_CLASS_MAP: Record<string, string> = {
  motorway: "motorway",
  motorway_link: "motorway",
  trunk: "trunk",
  trunk_link: "trunk",
  primary: "primary",
  primary_link: "primary",
  secondary: "secondary",
  secondary_link: "secondary",
  tertiary: "tertiary",
  tertiary_link: "tertiary",
  residential: "residential",
  living_street: "residential",
  service: "service",
  pedestrian: "pedestrian",
  footway: "pedestrian",
  path: "pedestrian",
  cycleway: "pedestrian",
  track: "service",
  unclassified: "tertiary"
}

/** OSM 道路 → speed_kph 默认值 */
const HIGHWAY_SPEED_MAP: Record<string, number> = {
  motorway: 100,
  motorway_link: 60,
  trunk: 80,
  trunk_link: 50,
  primary: 60,
  primary_link: 40,
  secondary: 50,
  secondary_link: 30,
  tertiary: 35,
  residential: 25,
  living_street: 15,
  service: 15,
  pedestrian: 5,
  footway: 5,
  path: 5,
  cycleway: 15,
  track: 15,
  unclassified: 30
}

/** 铁路等级映射 */
function mapRailwayClass(tags: Record<string, string>): string {
  if (tags.highspeed === "yes" || tags.usage === "main") return "hsr"
  if (tags.railway === "subway") return "metro"
  if (tags.railway === "tram" || tags.railway === "light_rail") return "tram"
  return "conventional"
}

/** 水系类型映射 */
function mapWaterClass(tags: Record<string, string>): string {
  if (tags.waterway === "river" || tags.waterway === "riverbank") return "river"
  if (tags.waterway === "canal" || tags.waterway === "drain" || tags.waterway === "ditch") return "canal"
  if (tags.natural === "water" && (tags.water === "lake" || tags.water === "pond" || tags.water === "reservoir")) return "lake"
  if (tags.natural === "coastline") return "sea"
  return "river" // fallback
}

/** 土地利用 → 地块类型映射 */
const LANDUSE_PARCEL_MAP: Record<string, string> = {
  residential: "residential",
  commercial: "commercial",
  retail: "commercial",
  industrial: "industrial",
  construction: "industrial",
  brownfield: "industrial",
  greenfield: "residential"
}

// ============================================================
// 公共接口
// ============================================================

export interface OsmImportOptions {
  south: number
  west: number
  north: number
  east: number
  includeBuildings?: boolean
  includeLanduse?: boolean
  /** 单个查询的最大超时秒数 */
  timeout?: number
}

export interface OsmImportResult {
  features: GeoJSON.Feature[]
  stats: {
    roads: number
    railways: number
    waterways: number
    buildings: number
    landuse: number
    total: number
  }
  bbox: { south: number; west: number; north: number; east: number }
  warnings: string[]
}

/**
 * 构建 Overpass QL 查询
 */
function buildOverpassQuery(opts: OsmImportOptions): string {
  const { south, west, north, east, includeBuildings = true, includeLanduse = true, timeout = 120 } = opts
  const bbox = `${south},${west},${north},${east}`

  const parts: string[] = [
    `[out:json][timeout:${timeout}];`,
    "("
  ]

  // 道路: 所有 highway=*
  parts.push(`  way["highway"](${bbox});`)

  // 轨道
  parts.push(`  way["railway"](${bbox});`)

  // 水系
  parts.push(`  way["waterway"](${bbox});`)
  parts.push(`  rel["natural"="water"](${bbox});`)

  // 建筑 (可选，数据量很大)
  if (includeBuildings) {
    parts.push(`  way["building"](${bbox});`)
  }

  // 土地利用 (可选)
  if (includeLanduse) {
    parts.push(`  way["landuse"](${bbox});`)
    parts.push(`  rel["landuse"](${bbox});`)
  }

  parts.push(");")
  parts.push("out body;")
  parts.push(">;")
  parts.push("out skel qt;")

  return parts.join("\n")
}

/**
 * 坐标数组 → WKT Point
 */
function coordToWktPoint(lon: number, lat: number): string {
  return `POINT(${lon} ${lat})`
}

/**
 * 节点坐标数组 → WKT LineString
 */
function nodesToWktLineString(coords: Array<{ lon: number; lat: number }>): string | null {
  if (coords.length < 2) return null
  const points = coords.map((c) => `${c.lon} ${c.lat}`).join(", ")
  return `LINESTRING(${points})`
}

/**
 * 环形坐标数组 → WKT Polygon
 */
function nodesToWktPolygon(coords: Array<{ lon: number; lat: number }>): string | null {
  if (coords.length < 3) return null
  // 确保闭合
  const first = coords[0]
  const last = coords[coords.length - 1]
  const closed = (first.lon === last.lon && first.lat === last.lat)
    ? coords
    : [...coords, first]
  const points = closed.map((c) => `${c.lon} ${c.lat}`).join(", ")
  return `POLYGON((${points}))`
}

/**
 * 单个 OSM way 转换为 DRMD GeoJSON Feature
 * 返回 null 表示该元素不应导入
 */
function osmWayToFeature(
  element: OsmElement,
  nodeCoords: Map<number, { lon: number; lat: number }>
): GeoJSON.Feature | null {
  const tags = element.tags || {}
  const nodeIds = element.nodes || []

  // 从 nodeCoords 收集当前 way 的坐标
  const coords = nodeIds
    .map((nid) => nodeCoords.get(nid))
    .filter((c): c is { lon: number; lat: number } => c !== undefined)

  if (coords.length < 2) return null

  // ---- 道路 ----
  if (tags.highway) {
    const roadClass = HIGHWAY_CLASS_MAP[tags.highway] || "tertiary"
    const speedKph = HIGHWAY_SPEED_MAP[tags.highway] || 30
    const wkt = nodesToWktLineString(coords)
    if (!wkt) return null

    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: coords.map((c) => [c.lon, c.lat])
      },
      properties: {
        name: tags.name || undefined,
        kind: "road",
        roadClass,
        speedKph,
        capacity: tags.lanes ? parseInt(tags.lanes, 10) * 500 : 1000,
        oneWay: tags.oneway === "yes",
        lanes: tags.lanes ? parseInt(tags.lanes, 10) : undefined,
        surface: tags.surface || undefined,
        osmId: `way/${element.id}`,
        osmTags: { highway: tags.highway }
      }
    }
  }

  // ---- 轨道 ----
  if (tags.railway) {
    const railClass = mapRailwayClass(tags)
    const wkt = nodesToWktLineString(coords)
    if (!wkt) return null

    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: coords.map((c) => [c.lon, c.lat])
      },
      properties: {
        name: tags.name || undefined,
        kind: "road",  // 暂时用 road 类型，后续扩展 rail_* 
        roadClass: `rail_${railClass}`,
        speedKph: railClass === "hsr" ? 250 : railClass === "metro" ? 60 : 120,
        capacity: 5000,
        oneWay: false,
        isRailway: true,
        railwayClass: railClass,
        osmId: `way/${element.id}`,
        osmTags: { railway: tags.railway }
      }
    }
  }

  // ---- 水系 ----
  if (tags.waterway || tags.natural === "water" || tags.natural === "coastline") {
    const waterClass = mapWaterClass(tags)
    const wkt = tags.natural === "water" || tags.natural === "coastline"
      ? nodesToWktPolygon(coords)
      : nodesToWktLineString(coords)
    if (!wkt) return null

    const geomType: "Polygon" | "LineString" =
      (tags.natural === "water" || tags.natural === "coastline") ? "Polygon" : "LineString"
    const geomCoords: number[][] | number[][][] = geomType === "Polygon"
      ? [coords.map((c) => [c.lon, c.lat])]
      : coords.map((c) => [c.lon, c.lat])

    return {
      type: "Feature",
      geometry: {
        type: geomType,
        coordinates: geomCoords
      } as GeoJSON.Geometry,
      properties: {
        name: tags.name || undefined,
        kind: "road",  // 暂时用 road 类型，后续扩展 waterway_*
        roadClass: `water_${waterClass}`,
        speedKph: waterClass === "sea" ? 30 : 10,
        capacity: 0,
        isWaterway: true,
        waterClass,
        osmId: `way/${element.id}`,
        osmTags: { waterway: tags.waterway, natural: tags.natural, water: tags.water }
      }
    }
  }

  // ---- 建筑 → Polygon ----
  if (tags.building) {
    const wkt = nodesToWktPolygon(coords)
    if (!wkt) return null

    return {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [coords.map((c) => [c.lon, c.lat])]
      },
      properties: {
        name: tags.name || undefined,
        kind: "parcel_commercial",  // 默认，后续根据 landuse 或手动调整
        isOsmBuilding: true,
        buildingType: tags.building,
        buildingLevels: tags["building:levels"] ? parseInt(tags["building:levels"], 10) : undefined,
        osmId: `way/${element.id}`,
        osmTags: { building: tags.building }
      }
    }
  }

  // ---- 土地利用 → 地块 Polygon ----
  if (tags.landuse) {
    const parcelType = LANDUSE_PARCEL_MAP[tags.landuse]
    if (!parcelType) return null

    const wkt = nodesToWktPolygon(coords)
    if (!wkt) return null

    return {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [coords.map((c) => [c.lon, c.lat])]
      },
      properties: {
        name: tags.name || undefined,
        kind: parcelType,
        isOsmParcel: true,
        osmLanduse: tags.landuse,
        osmId: `way/${element.id}`,
        osmTags: { landuse: tags.landuse }
      }
    }
  }

  return null
}

/**
 * 从 Overpass API 抓取 OSM 数据
 */
async function fetchOverpassData(
  query: string,
  endpointIndex: number = 0
): Promise<OverpassResponse> {
  const endpoint = OVERPASS_ENDPOINTS[endpointIndex]
  if (!endpoint) {
    throw new Error("All Overpass API endpoints exhausted")
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000) // 2min timeout

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal
    })

    if (!response.ok) {
      throw new Error(`Overpass API returned ${response.status}: ${response.statusText}`)
    }

    const data = await response.json() as OverpassResponse
    return data
  } catch (error) {
    if (endpointIndex < OVERPASS_ENDPOINTS.length - 1) {
      console.warn(`Overpass endpoint ${endpoint} failed, trying next...`)
      return fetchOverpassData(query, endpointIndex + 1)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 主入口: 导入指定区域的 OSM 数据
 */
export async function importOsmData(opts: OsmImportOptions): Promise<OsmImportResult> {
  const warnings: string[] = []
  const query = buildOverpassQuery(opts)

  console.log(`[osmService] Fetching OSM data for bbox: ${opts.south},${opts.west},${opts.north},${opts.east}`)
  const data = await fetchOverpassData(query)

  // 分离 nodes 和 ways
  const nodes = new Map<number, { lon: number; lat: number }>()
  const ways: OsmElement[] = []
  const relations: OsmElement[] = []

  for (const element of data.elements) {
    if (element.type === "node") {
      if (element.lat !== undefined && element.lon !== undefined) {
        nodes.set(element.id, { lon: element.lon, lat: element.lat })
      }
    } else if (element.type === "way") {
      // way 的节点坐标由后续的 node 元素提供 (> 输出)
      ways.push(element)
    } else if (element.type === "relation") {
      relations.push(element)
    }
  }

  // 为没有内嵌 geometry 的 way 补充坐标
  for (const element of ways) {
    if (element.geometry && element.geometry.length > 0) {
      // 已有内嵌 geometry, 注册到 nodes map
      const nodeIds = element.nodes || []
      const geom = element.geometry
      for (let i = 0; i < Math.min(nodeIds.length, geom.length); i++) {
        nodes.set(nodeIds[i], { lon: geom[i].lon, lat: geom[i].lat })
      }
    }
  }

  // 转换为 DRMD Features
  const features: GeoJSON.Feature[] = []
  const stats = { roads: 0, railways: 0, waterways: 0, buildings: 0, landuse: 0, total: 0 }

  for (const way of ways) {
    const tags = way.tags || {}
    const feature = osmWayToFeature(way, nodes)
    if (!feature) continue

    features.push(feature)
    stats.total++

    if (tags.highway) {
      if (["motorway", "trunk", "primary", "secondary"].includes(tags.highway)) stats.roads++
      else stats.roads++
    } else if (tags.railway) {
      stats.railways++
    } else if (tags.waterway || tags.natural === "water" || tags.natural === "coastline") {
      stats.waterways++
    } else if (tags.building) {
      stats.buildings++
    } else if (tags.landuse) {
      stats.landuse++
    }
  }

  if (features.length === 0) {
    warnings.push("No OSM features found in this area. Try a larger bounding box or a different location.")
  }

  if (features.length > 5000) {
    warnings.push(`Large import: ${features.length} features. Loading may take a moment.`)
  }

  console.log(`[osmService] Imported ${features.length} features: roads=${stats.roads}, railways=${stats.railways}, waterways=${stats.waterways}, buildings=${stats.buildings}, landuse=${stats.landuse}`)

  return {
    features,
    stats,
    bbox: { south: opts.south, west: opts.west, north: opts.north, east: opts.east },
    warnings
  }
}

/**
 * 获取默认的城市行政边界（硬编码常用中国城市中心 + 半径）
 * 后续可接入真实的行政区划数据
 */
export const KNOWN_CITIES: Record<string, { name: string; lat: number; lng: number; radiusKm: number }> = {
  "beijing": { name: "北京", lat: 39.9042, lng: 116.4074, radiusKm: 15 },
  "shanghai": { name: "上海", lat: 31.2304, lng: 121.4737, radiusKm: 12 },
  "guangzhou": { name: "广州", lat: 23.1291, lng: 113.2644, radiusKm: 10 },
  "shenzhen": { name: "深圳", lat: 22.5431, lng: 114.0579, radiusKm: 10 },
  "chengdu": { name: "成都", lat: 30.5728, lng: 104.0668, radiusKm: 10 },
  "hangzhou": { name: "杭州", lat: 30.2741, lng: 120.1551, radiusKm: 8 },
  "wuhan": { name: "武汉", lat: 30.5928, lng: 114.3055, radiusKm: 10 },
  "nanjing": { name: "南京", lat: 32.0603, lng: 118.7969, radiusKm: 8 },
  "chongqing": { name: "重庆", lat: 29.4316, lng: 106.9123, radiusKm: 12 },
  "xian": { name: "西安", lat: 34.3416, lng: 108.9398, radiusKm: 8 },
  "tianjin": { name: "天津", lat: 39.0842, lng: 117.2009, radiusKm: 10 },
  "suzhou": { name: "苏州", lat: 31.2990, lng: 120.5853, radiusKm: 6 }
}

/**
 * 给定城市名，返回默认 BBox（半径法）
 */
export function cityToBBox(cityKey: string, radiusKmOverride?: number): OsmImportOptions | null {
  const city = KNOWN_CITIES[cityKey.toLowerCase()]
  if (!city) return null

  const radiusM = (radiusKmOverride || city.radiusKm) * 1000
  // 粗略换算: 1° lat ≈ 111320m, 1° lng ≈ 111320 * cos(lat)
  const latDelta = radiusM / 111320
  const lngDelta = radiusM / (111320 * Math.cos((city.lat * Math.PI) / 180))

  return {
    south: city.lat - latDelta,
    west: city.lng - lngDelta,
    north: city.lat + latDelta,
    east: city.lng + lngDelta,
    includeBuildings: true,
    includeLanduse: true
  }
}

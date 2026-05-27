<script setup lang="ts">
import maplibregl from "maplibre-gl"
import MapboxDraw from "@mapbox/mapbox-gl-draw"
import * as turf from "@turf/turf"
import { inferFeatureKind, isParcelKind } from "@drmd/shared-types"
import type {
  DrawMode,
  FeatureKind,
  FeatureProperties,
  KindStyleConfig,
  MeasurementInfo,
  SelectedFeatureInfo
} from "~/types"

const props = defineProps<{
  activeMode: DrawMode
  activeKind: FeatureKind
  kindStyles: KindStyleConfig[]
  /** 底图样式 ID（从 project config 传入） */
  baseStyleId?: string
}>()

const emit = defineEmits<{
  (e: "update", features: GeoJSON.FeatureCollection): void
  (e: "select", feature: SelectedFeatureInfo | null): void
  /** 底图样式变更，由父组件保存到 project config */
  (e: "base-style-change", styleId: string): void
}>()

const mapContainer = ref<HTMLDivElement>()
let map: maplibregl.Map | null = null
let draw: InstanceType<typeof MapboxDraw> | null = null
let suppressSelection = false
let applyModeTimer: ReturnType<typeof setTimeout> | null = null

// ===== 底图样式切换 =====
interface BaseStyle {
  id: string
  label: string
  icon: string
  tiles: string[]
  attribution: string
}

const baseStyles: BaseStyle[] = [
  {
    id: "dark",
    label: "Dark",
    icon: "🌙",
    tiles: [
      "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
    ],
    attribution: "© CARTO © OpenStreetMap contributors"
  },
  {
    id: "light",
    label: "Light",
    icon: "☀️",
    tiles: [
      "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
    ],
    attribution: "© CARTO © OpenStreetMap contributors"
  },
  {
    id: "voyager",
    label: "Voyager",
    icon: "🗺️",
    tiles: [
      "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
    ],
    attribution: "© CARTO © OpenStreetMap contributors"
  },
  {
    id: "positron",
    label: "Positron",
    icon: "📄",
    tiles: [
      "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
      "https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
      "https://c.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png"
    ],
    attribution: "© CARTO © OpenStreetMap contributors"
  }
]

const currentStyleId = ref("dark")
const baseStyleHover = ref(false)
let baseStyleTimer: ReturnType<typeof setTimeout> | null = null

function showBaseStyles(): void {
  if (baseStyleTimer) { clearTimeout(baseStyleTimer); baseStyleTimer = null }
  baseStyleHover.value = true
}
function hideBaseStylesDelayed(): void {
  baseStyleTimer = setTimeout(() => { baseStyleHover.value = false }, 1500)
}

function switchBaseStyle(styleId: string): void {
  if (!map || styleId === currentStyleId.value) return
  const style = baseStyles.find(s => s.id === styleId)
  if (!style) return

  // 保存当前绘制数据（防止 removeLayer 触发 draw 重置丢失要素）
  const snapshot = draw ? draw.getAll() : null

  // 移除旧底图图层和源
  if (map.getLayer("carto-raster")) map.removeLayer("carto-raster")
  if (map.getSource("carto")) map.removeSource("carto")

  // 添加新底图源和图层（插入到所有绘制图层之下）
  map.addSource("carto", {
    type: "raster",
    tiles: style.tiles,
    tileSize: 256,
    attribution: style.attribution
  })

  // 找到第一个绘制图层，在其下方插入底图
  const firstDrawLayer = map.getStyle().layers?.find(l => l.id.startsWith("drmd-"))
  map.addLayer({
    id: "carto-raster",
    type: "raster",
    source: "carto"
  }, firstDrawLayer?.id)

  // 恢复绘制数据
  if (snapshot && draw && snapshot.features.length > 0) {
    draw.set(snapshot)
  }

  currentStyleId.value = styleId
  emit("base-style-change", styleId)
}

// 外部传入 baseStyleId 变化时同步
watch(() => props.baseStyleId, (id) => {
  if (id && id !== currentStyleId.value) {
    switchBaseStyle(id)
  }
})
const areaKinds: FeatureKind[] = ["residential", "public", "commercial", "industrial", "transport", "green", "water", "road"]

const kindStyleMap = computed(() => {
  return new Map(props.kindStyles.map((style) => [style.kind, style]))
})

function desiredDrawModeByKind(kind: FeatureKind): "draw_point" | "draw_line_string" | "draw_polygon" {
  if (kind === "road") return "draw_line_string"
  if (kind === "poi") return "draw_point"
  return "draw_polygon"
}

function syncActiveDrawColors(): void {
  if (!map || !draw) return

  // Build match expression from kindStyles (all kinds are now in unified format)
  const matchPairs: unknown[] = []
  for (const [kind, cfg] of kindStyleMap.value) {
    matchPairs.push(kind, cfg.color)
  }
  const fallback = "#cccccc"
  const polyExpr: unknown[] = ["match", ["get", "kind"], ...matchPairs, fallback]
  const lineExpr: unknown[] = ["match", ["get", "kind"], ...matchPairs, "#555555"]
  const ptExpr: unknown[]   = ["match", ["get", "kind"], ...matchPairs, "#3b82f6"]

  // Apply to polygon layers (fill + stroke)
  for (const id of ["drmd-polygon-fill", "drmd-polygon-stroke"]) {
    if (map.getLayer(id)) {
      map.setPaintProperty(id, id.endsWith("fill") ? "fill-color" : "line-color", polyExpr)
    }
  }
  if (map.getLayer("drmd-line-stroke"))  map.setPaintProperty("drmd-line-stroke", "line-color", lineExpr)
  if (map.getLayer("drmd-point-circle")) map.setPaintProperty("drmd-point-circle", "circle-color", ptExpr)

  // Also normalize kind + update visibility on feature properties
  const data = draw.getAll()
  const updated = data.features.map((f) => {
    const p = { ...(f.properties || {}) } as Record<string, unknown>
    const kind = inferFeatureKind(f.geometry.type, p.kind as string | undefined)
    const cfg = kindStyleMap.value.get(kind)
    if (cfg) {
      p.kind = kind
      p.color = cfg.color
      p.hidden = !cfg.visible
    }
    return { ...f, properties: p }
  })

  suppressSelection = true
  try { draw.set({ type: "FeatureCollection", features: updated }) }
  finally { suppressSelection = false }

  // Re-apply paint after draw.set() in case it reset layers
  for (const id of ["drmd-polygon-fill", "drmd-polygon-stroke"]) {
    if (map.getLayer(id)) {
      map.setPaintProperty(id, id.endsWith("fill") ? "fill-color" : "line-color", polyExpr)
    }
  }
}

function syncCursor(): void {
  if (!map) return
  map.getCanvas().style.cursor = props.activeMode === "edit" ? "crosshair" : "grab"
}

function applyInteractionMode(): void {
  if (!draw) return
  const currentMode = typeof draw.getMode === "function" ? draw.getMode() : null

  if (props.activeMode === "select") {
    if (currentMode !== "simple_select") {
      draw.changeMode("simple_select")
    }
  } else {
    const nextMode = desiredDrawModeByKind(props.activeKind)
    if (nextMode === "draw_point" && currentMode !== "draw_point") {
      draw.changeMode("draw_point")
    } else if (nextMode === "draw_line_string" && currentMode !== "draw_line_string") {
      draw.changeMode("draw_line_string")
    } else if (nextMode === "draw_polygon" && currentMode !== "draw_polygon") {
      draw.changeMode("draw_polygon")
    }
  }

  syncCursor()
}

function scheduleApplyInteractionMode(): void {
  if (applyModeTimer) {
    clearTimeout(applyModeTimer)
  }
  applyModeTimer = setTimeout(() => {
    applyModeTimer = null
    applyInteractionMode()
  }, 0)
}

function defaultProperties(kind: FeatureKind): FeatureProperties {
  const style = kindStyleMap.value.get(kind)
  return {
    kind,
    color: style?.color || "#3b82f6",
    hidden: style ? !style.visible : false,
    speedKph: kind === "road" ? 30 : undefined,
    capacity: kind === "road" ? 1000 : undefined,
    oneWay: false
  }
}

function pushUpdate(): void {
  if (!draw) return
  emit("update", draw.getAll())
}

function applyKindStylesInternal(emitUpdate = true): void {
  if (!draw) return
  const data = draw.getAll()
  const nextFeatures = data.features.map((feature) => {
    const kind = inferFeatureKind(feature.geometry.type, (feature.properties as Record<string, unknown> | null)?.kind as string | undefined)
    const cfg = kindStyleMap.value.get(kind)
    const properties = { ...(feature.properties || {}) } as FeatureProperties
    properties.kind = kind
    if (cfg) {
      properties.color = cfg.color
      properties.hidden = !cfg.visible
    }
    return { ...feature, properties }
  })

  suppressSelection = true
  try {
    draw.set({ type: "FeatureCollection", features: nextFeatures })
  } finally {
    suppressSelection = false
  }

  if (emitUpdate) {
    pushUpdate()
  }
}

function handleSelectionChange(event: { features: GeoJSON.Feature[] }): void {
  if (suppressSelection) return
  if (!event.features || event.features.length === 0) {
    emit("select", null)
    return
  }

  const feature = event.features[0]
  const measurement: MeasurementInfo = {}

  if (feature.geometry.type === "Polygon") {
    measurement.areaSqm = turf.area(feature as GeoJSON.Feature<GeoJSON.Polygon>)
    // 计算中心点坐标用于 POI 搜索等场景
    const centroid = turf.centroid(feature as GeoJSON.Feature<GeoJSON.Polygon>)
    measurement.coordinates = centroid.geometry.coordinates as [number, number]
  } else if (feature.geometry.type === "LineString") {
    measurement.lengthKm = turf.length(feature as GeoJSON.Feature<GeoJSON.LineString>, { units: "kilometers" })
    // 线段中点
    const midpoint = turf.along(feature as GeoJSON.Feature<GeoJSON.LineString>, 
      turf.length(feature as GeoJSON.Feature<GeoJSON.LineString>, { units: "kilometers" }) / 2, 
      { units: "kilometers" })
    measurement.coordinates = midpoint.geometry.coordinates as [number, number]
  } else if (feature.geometry.type === "Point") {
    const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates
    measurement.coordinates = [lng, lat]
  }

  emit("select", {
    id: String(feature.id),
    geometryType: feature.geometry.type as "Point" | "LineString" | "Polygon",
    properties: (feature.properties || {}) as FeatureProperties,
    measurement
  })
}

function extractCoordinates(geometry: GeoJSON.Geometry): number[][] {
  switch (geometry.type) {
    case "Point":
      return [geometry.coordinates as number[]]
    case "LineString":
      return geometry.coordinates as number[][]
    case "Polygon":
      return (geometry.coordinates as number[][][]).flat()
    case "MultiPolygon":
      return (geometry.coordinates as number[][][][]).flat(2)
    default:
      return []
  }
}

onMounted(async () => {
  await nextTick()

  const initStyleId = props.baseStyleId || currentStyleId.value
  const initStyle = baseStyles.find(s => s.id === initStyleId) || baseStyles[0]
  currentStyleId.value = initStyle.id

  map = new maplibregl.Map({
    container: mapContainer.value as HTMLDivElement,
    style: {
      version: 8,
      sources: {
        carto: {
          type: "raster",
          tiles: initStyle.tiles,
          tileSize: 256,
          attribution: initStyle.attribution
        }
      },
      layers: [
        {
          id: "carto-raster",
          type: "raster",
          source: "carto"
        }
      ]
    },
    center: [120.09, 30.18], // 杭州西湖区转塘街道
    zoom: 11
  })

  draw = new MapboxDraw({
    displayControlsDefault: false,
    controls: {},
    defaultMode: "simple_select",
    styles: [
      {
        id: "drmd-polygon-fill",
        type: "fill",
        filter: ["all", ["==", "$type", "Polygon"], ["!=", "hidden", true]],
        paint: {
          "fill-color": "#cccccc",
          "fill-opacity": 0.35
        }
      },
      {
        id: "drmd-polygon-stroke",
        type: "line",
        filter: ["all", ["==", "$type", "Polygon"], ["!=", "hidden", true]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#999999",
          "line-width": 2.5
        }
      },
      {
        id: "drmd-line-stroke",
        type: "line",
        filter: ["all", ["==", "$type", "LineString"], ["!=", "hidden", true]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#555555",
          "line-width": 3.5
        }
      },
      {
        id: "drmd-point-circle",
        type: "circle",
        filter: ["all", ["==", "$type", "Point"], ["==", "meta", "feature"], ["!=", "hidden", true]],
        paint: {
          "circle-radius": 8,
          "circle-color": "#3b82f6",
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#ffffff"
        }
      },
      {
        id: "drmd-midpoint",
        type: "circle",
        filter: ["all", ["==", "$type", "Point"], ["==", "meta", "midpoint"]],
        paint: {
          "circle-radius": 5,
          "circle-color": "#1d4ed8"
        }
      },
      {
        id: "drmd-vertex",
        type: "circle",
        filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]],
        paint: {
          "circle-radius": 5.5,
          "circle-color": "#ffffff",
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#1d4ed8"
        }
      }
    ]
  })

  map.addControl(draw as unknown as maplibregl.IControl)
  map.addControl(new maplibregl.NavigationControl(), "bottom-right")
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left")
  syncActiveDrawColors()
  applyInteractionMode()

  map.on("draw.create", (event) => {
    if (!draw) return
    const ids = new Set((event.features || []).map((feature: GeoJSON.Feature) => String(feature.id)))
    const data = draw.getAll()

    const nextFeatures = data.features.map((feature) => {
      if (!ids.has(String(feature.id))) {
        return feature
      }
      const properties = {
        ...defaultProperties(props.activeKind),
        ...(feature.properties || {})
      } as FeatureProperties
      properties.kind = props.activeKind
      return { ...feature, properties }
    })

    draw.set({ type: "FeatureCollection", features: nextFeatures })
    applyKindStylesInternal(false)
    pushUpdate()
    if (props.activeMode === "edit") {
      scheduleApplyInteractionMode()
    }
  })

  map.on("draw.update", () => {
    pushUpdate()
  })

  map.on("draw.delete", () => {
    emit("select", null)
    pushUpdate()
  })

  map.on("draw.selectionchange", handleSelectionChange)
})

watch(
  () => [props.activeMode, props.activeKind],
  () => {
    applyInteractionMode()
    syncActiveDrawColors()
  }
)

watch(
  () => props.kindStyles,
  () => {
    applyKindStylesInternal()
    syncActiveDrawColors()
  },
  { deep: true }
)

defineExpose({
  deleteSelected() {
    draw?.trash()
    pushUpdate()
  },
  clearAll() {
    draw?.deleteAll()
    emit("select", null)
    pushUpdate()
    applyInteractionMode()
  },
  getAll() {
    return draw?.getAll()
  },
  applyKindStyles() {
    applyKindStylesInternal()
    syncActiveDrawColors()
  },
  updateProperties(id: string, properties: FeatureProperties) {
    if (!draw) return
    const data = draw.getAll()
    const index = data.features.findIndex((feature) => String(feature.id) === id)
    if (index === -1) return

    data.features[index] = {
      ...data.features[index],
      properties: {
        ...(data.features[index].properties || {}),
        ...properties
      }
    }

    suppressSelection = true
    try {
      draw.set(data)
      applyKindStylesInternal(false)
      if (props.activeMode === "select") {
        draw.changeMode("simple_select", { featureIds: [id] })
      } else {
        applyInteractionMode()
      }
    } finally {
      suppressSelection = false
    }

    handleSelectionChange({ features: [data.features[index]] })
    pushUpdate()
  },
  loadData(data: GeoJSON.FeatureCollection) {
    if (!draw) return
    draw.deleteAll()
    draw.set(data)
    applyKindStylesInternal(false)
    syncActiveDrawColors()
    pushUpdate()

    if (data.features.length > 0 && map) {
      const bounds = new maplibregl.LngLatBounds()
      data.features.forEach((feature) => {
        extractCoordinates(feature.geometry).forEach((coord) => {
          bounds.extend(coord as [number, number])
        })
      })
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 64, duration: 250 })
      }
    }
  },
  updateFeatureId(oldId: string, newId: string) {
    if (!draw) return
    const data = draw.getAll()
    const index = data.features.findIndex((f) => String(f.id) === oldId)
    if (index === -1) return
    data.features[index] = { ...data.features[index], id: newId as unknown as string | number }
    draw.set(data)
    pushUpdate()
  },
  setView(lng: number, lat: number, zoomLevel?: number) {
    map?.flyTo({ center: [lng, lat], zoom: zoomLevel ?? (map?.getZoom() ?? 13), duration: 500 })
  },
  getView(): { lng: number; lat: number; zoom: number } | null {
    if (!map) return null
    const center = map.getCenter()
    return { lng: center.lng, lat: center.lat, zoom: Math.round(map.getZoom() * 10) / 10 }
  },
  getMap(): maplibregl.Map | null {
    return map
  },
  centerToCurrentLocation(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!map) {
        reject(new Error("Map is not ready"))
        return
      }
      if (!("geolocation" in navigator)) {
        reject(new Error("Geolocation is not supported by this browser"))
        return
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          map?.flyTo({
            center: [position.coords.longitude, position.coords.latitude],
            zoom: Math.max(map.getZoom(), 14),
            speed: 1,
            essential: true
          })
          resolve()
        },
        (error) => {
          reject(new Error(error.message || "Unable to get current location"))
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      )
    })
  }
})

onUnmounted(() => {
  if (applyModeTimer) { clearTimeout(applyModeTimer); applyModeTimer = null }
  if (baseStyleTimer) { clearTimeout(baseStyleTimer); baseStyleTimer = null }
  map?.remove()
  map = null
  draw = null
})
</script>

<template>
  <div ref="mapContainer" class="w-full h-full" />

  <!-- 底图切换器: bottom-center, horizontal, auto-hide -->
  <div
    class="absolute bottom-4 left-1/2 -translate-x-1/2 z-20"
    @mouseenter="showBaseStyles"
    @mouseleave="hideBaseStylesDelayed"
  >
    <transition
      enter-active-class="transition-all duration-300 ease-out"
      leave-active-class="transition-all duration-500 ease-in"
      enter-from-class="opacity-0 translate-y-2 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-2 scale-95"
    >
      <div
        v-show="baseStyleHover"
        class="flex items-center gap-1 bg-slate-900/80 backdrop-blur-md rounded-full px-2 py-1.5 shadow-xl border border-white/10"
      >
        <button
          v-for="style in baseStyles"
          :key="style.id"
          :class="[
            'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200',
            currentStyleId === style.id
              ? 'bg-white/20 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-white/10'
          ]"
          @click="switchBaseStyle(style.id)"
        >
          <span class="text-xs">{{ style.icon }}</span>
          <span>{{ style.label }}</span>
        </button>
      </div>
    </transition>
    <!-- Collapsed trigger: subtle dot -->
    <div
      v-if="!baseStyleHover"
      class="absolute inset-0 -m-2"
      @mouseenter="showBaseStyles"
    />
  </div>
</template>

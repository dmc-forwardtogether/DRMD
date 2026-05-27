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
}>()

const emit = defineEmits<{
  (e: "update", features: GeoJSON.FeatureCollection): void
  (e: "select", feature: SelectedFeatureInfo | null): void
}>()

const mapContainer = ref<HTMLDivElement>()
let map: maplibregl.Map | null = null
let draw: InstanceType<typeof MapboxDraw> | null = null
let suppressSelection = false
let applyModeTimer: ReturnType<typeof setTimeout> | null = null
const areaKinds: FeatureKind[] = ["parcel_residential", "parcel_commercial", "parcel_mixed", "residential", "commercial"]

const kindStyleMap = computed(() => {
  return new Map(props.kindStyles.map((style) => [style.kind, style]))
})

function getKindColor(kind: FeatureKind, fallback: string): string {
  return kindStyleMap.value.get(kind)?.color || fallback
}

function currentAreaKind(): FeatureKind {
  return isParcelKind(props.activeKind) ? props.activeKind : "parcel_residential"
}

function desiredDrawModeByKind(kind: FeatureKind): "draw_point" | "draw_line_string" | "draw_polygon" {
  if (kind === "road") return "draw_line_string"
  if (kind === "poi") return "draw_point"
  return "draw_polygon"
}

function setPaintIfLayerExists(layerId: string, property: string, value: unknown): void {
  if (!map || !map.getLayer(layerId)) return
  map.setPaintProperty(layerId, property, value)
}

function syncActiveDrawColors(): void {
  const areaColor = getKindColor(currentAreaKind(), "#22c55e")
  const roadColor = getKindColor("road", "#f97316")
  const poiColor = getKindColor("poi", "#3b82f6")

  setPaintIfLayerExists("drmd-polygon-fill.hot", "fill-color", ["coalesce", ["get", "color"], areaColor])
  setPaintIfLayerExists("drmd-polygon-fill.cold", "fill-color", ["coalesce", ["get", "color"], areaColor])
  setPaintIfLayerExists("drmd-polygon-stroke.hot", "line-color", ["coalesce", ["get", "color"], areaColor])
  setPaintIfLayerExists("drmd-polygon-stroke.cold", "line-color", ["coalesce", ["get", "color"], areaColor])
  setPaintIfLayerExists("drmd-line-stroke.hot", "line-color", ["coalesce", ["get", "color"], roadColor])
  setPaintIfLayerExists("drmd-line-stroke.cold", "line-color", ["coalesce", ["get", "color"], roadColor])
  setPaintIfLayerExists("drmd-point-circle.hot", "circle-color", ["coalesce", ["get", "color"], poiColor])
  setPaintIfLayerExists("drmd-point-circle.cold", "circle-color", ["coalesce", ["get", "color"], poiColor])
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

  map = new maplibregl.Map({
    container: mapContainer.value as HTMLDivElement,
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "OpenStreetMap"
        }
      },
      layers: [
        {
          id: "osm-raster",
          type: "raster",
          source: "osm"
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
          "fill-color": ["coalesce", ["get", "color"], "#22c55e"],
          "fill-opacity": 0.25
        }
      },
      {
        id: "drmd-polygon-stroke",
        type: "line",
        filter: ["all", ["==", "$type", "Polygon"], ["!=", "hidden", true]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["coalesce", ["get", "color"], "#22c55e"],
          "line-width": 2.2
        }
      },
      {
        id: "drmd-line-stroke",
        type: "line",
        filter: ["all", ["==", "$type", "LineString"], ["!=", "hidden", true]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["coalesce", ["get", "color"], "#f97316"],
          "line-width": 3
        }
      },
      {
        id: "drmd-point-circle",
        type: "circle",
        filter: ["all", ["==", "$type", "Point"], ["==", "meta", "feature"], ["!=", "hidden", true]],
        paint: {
          "circle-radius": 7,
          "circle-color": ["coalesce", ["get", "color"], "#3b82f6"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff"
        }
      },
      {
        id: "drmd-midpoint",
        type: "circle",
        filter: ["all", ["==", "$type", "Point"], ["==", "meta", "midpoint"]],
        paint: {
          "circle-radius": 4,
          "circle-color": "#1d4ed8"
        }
      },
      {
        id: "drmd-vertex",
        type: "circle",
        filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]],
        paint: {
          "circle-radius": 5,
          "circle-color": "#ffffff",
          "circle-stroke-width": 2,
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
  if (applyModeTimer) {
    clearTimeout(applyModeTimer)
    applyModeTimer = null
  }
  map?.remove()
  map = null
  draw = null
})
</script>

<template>
  <div ref="mapContainer" class="w-full h-full" />
</template>

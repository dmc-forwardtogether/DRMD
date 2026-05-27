import { inferFeatureKind, isParcelKind } from "@drmd/shared-types"
import { defineStore } from "pinia"
import type { FeatureKind, KindStyleConfig, SavedProject } from "~/types"

export const DEFAULT_KIND_STYLES: KindStyleConfig[] = [
  { kind: "parcel_residential", color: "#FFE033", visible: true },   // R 居住用地
  { kind: "parcel_public", color: "#FF7A1E", visible: true },        // A 公共管理
  { kind: "parcel_commercial", color: "#E60000", visible: true },    // B 商业设施
  { kind: "parcel_industrial", color: "#E6A632", visible: true },    // M 工业用地
  { kind: "parcel_transport", color: "#404040", visible: true },     // S 交通枢纽
  { kind: "parcel_green", color: "#00B050", visible: true },         // G 绿地广场
  { kind: "parcel_water", color: "#40A8E0", visible: true },         // E 水域特殊
  { kind: "road", color: "#555555", visible: true }                  // 道路
]

function cloneStyles(styles: KindStyleConfig[]): KindStyleConfig[] {
  return styles.map((style) => ({ ...style }))
}

export const useEditorStore = defineStore("editor", () => {
  const projectName = ref("DRMD Demo Project")
  const features = ref<GeoJSON.FeatureCollection>({
    type: "FeatureCollection",
    features: []
  })
  const kindStyles = ref<KindStyleConfig[]>(cloneStyles(DEFAULT_KIND_STYLES))

  const featureCount = computed(() => features.value.features.length)
  const countByKind = (kind: FeatureKind) => computed(() =>
    features.value.features.filter((feature) =>
      inferFeatureKind(feature.geometry.type, (feature.properties as Record<string, unknown> | null)?.kind as string | undefined) === kind
    ).length
  )
  const residentialCount = countByKind("parcel_residential")
  const commercialCount = countByKind("parcel_commercial")
  const roadCount = countByKind("road")
  const poiCount = countByKind("poi")

  function updateFeatures(next: GeoJSON.FeatureCollection): void {
    features.value = next
  }

  function setKindStyles(next: KindStyleConfig[]): void {
    kindStyles.value = cloneStyles(next)
  }

  function saveToFile(): void {
    const payload: SavedProject = {
      type: "FeatureCollection",
      features: features.value.features,
      metadata: {
        projectName: projectName.value,
        savedAt: new Date().toISOString(),
        featureCount: features.value.features.length,
        kindStyles: cloneStyles(kindStyles.value)
      }
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = href
    anchor.download = `${projectName.value.replace(/\s+/g, "_") || "drmd_project"}_${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(href)
  }

  function loadFromData(payload: SavedProject): void {
    if (payload.metadata?.projectName) {
      projectName.value = payload.metadata.projectName
    }
    if (Array.isArray(payload.metadata?.kindStyles) && payload.metadata.kindStyles.length > 0) {
      kindStyles.value = cloneStyles(payload.metadata.kindStyles)
    }
    features.value = {
      type: "FeatureCollection",
      features: payload.features || []
    }
  }

  return {
    projectName,
    features,
    kindStyles,
    featureCount,
    residentialCount,
    commercialCount,
    roadCount,
    poiCount,
    updateFeatures,
    setKindStyles,
    saveToFile,
    loadFromData
  }
})

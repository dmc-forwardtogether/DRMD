import { inferFeatureKind, isParcelKind } from "@drmd/shared-types"
import { defineStore } from "pinia"
import type { FeatureKind, KindStyleConfig, SavedProject } from "~/types"

export const DEFAULT_KIND_STYLES: KindStyleConfig[] = [
  { kind: "parcel_residential", color: "#22c55e", visible: true },
  { kind: "parcel_commercial", color: "#14b8a6", visible: true },
  { kind: "parcel_mixed", color: "#8b5cf6", visible: true },
  { kind: "road", color: "#f97316", visible: true }
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
  const mixedCount = countByKind("parcel_mixed")
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
    mixedCount,
    roadCount,
    poiCount,
    updateFeatures,
    setKindStyles,
    saveToFile,
    loadFromData
  }
})

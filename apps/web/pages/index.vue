<script setup lang="ts">
import type { ProjectCreateResponse } from "@drmd/shared-types"
import { Pencil, Trash2 } from "lucide-vue-next"

const { public: { apiBase } } = useRuntimeConfig()

interface ProjectItem {
  id: number; name: string; srid: number
  sourceType?: string; districtCode?: string
  bounds?: GeoJSON.Polygon | null
  osmImportedAt?: string | null
  featureCount: number
  createdAt: string; updatedAt: string
}

const projects = ref<ProjectItem[]>([])
const projectsLoading = ref(false)
const showCreateDialog = ref(false)
const creatingProject = ref(false)
const newProjectError = ref("")

function clearCreateError(): void {
  newProjectError.value = ""
}

// ===== 编辑状态 =====
const editTarget = ref<ProjectItem | null>(null)
const editLoading = ref(false)
const editError = ref("")

// ===== 删除确认 =====
const deleteTarget = ref<ProjectItem | null>(null)

async function fetchProjects(): Promise<void> {
  projectsLoading.value = true
  try {
    const res = await $fetch<{ projects: ProjectItem[] }>(`${apiBase}/api/projects`)
    projects.value = res.projects || []
  } catch (error) {
    console.error("Failed to fetch projects", error)
  } finally {
    projectsLoading.value = false
  }
}

async function handleProjectCreated(response: ProjectCreateResponse): Promise<void> {
  creatingProject.value = true
  newProjectError.value = ""
  try {
    showCreateDialog.value = false
    await fetchProjects()
    await navigateTo(`/project/${response.project.id}`)
  } catch (error) {
    newProjectError.value = error instanceof Error ? error.message : "Failed to create project"
  } finally {
    creatingProject.value = false
  }
}

function openProject(projectId: number): void {
  navigateTo(`/project/${projectId}`)
}

// ===== Editor 状态 =====
const activeMode = ref<DrawMode>("select")
const activeKind = ref<FeatureKind>("parcel_commercial")
const selectedFeature = ref<SelectedFeatureInfo | null>(null)
const statusMessage = ref("")
let statusTimer: ReturnType<typeof setTimeout> | null = null
const currentProjectId = ref<number | null>(null)

async function handleProjectCreated(response: ProjectCreateResponse): Promise<void> {
  creatingProject.value = true
  newProjectError.value = ""
  try {
    showCreateDialog.value = false
    await fetchProjects()
    await navigateTo(`/project/${response.project.id}`)
  } catch (error) {
    newProjectError.value = error instanceof Error ? error.message : "Failed to create project"
  } finally {
    creatingProject.value = false
  }
}

function openProject(projectId: number): void {
  navigateTo(`/project/${projectId}`)
}

// ===== 编辑 =====

function startEdit(project: ProjectItem, event: Event): void {
  event.stopPropagation()
  editTarget.value = project
  editError.value = ""
}

async function handleEditSave(name: string): Promise<void> {
  if (!editTarget.value) return
  editLoading.value = true
  editError.value = ""
  try {
    await $fetch(`${apiBase}/api/projects/${editTarget.value.id}`, {
      method: "PATCH",
      body: { name }
    })
    editTarget.value.name = name
    editTarget.value = null
  } catch (error) {
    editError.value = error instanceof Error ? error.message : "Failed to rename project"
  } finally {
    editLoading.value = false
  }
}

// ===== 删除 =====

function confirmDelete(project: ProjectItem, event: Event): void {
  event.stopPropagation()
  deleteTarget.value = project
}

function cancelDelete(): void {
  deleteTarget.value = null
}

async function executeDelete(): Promise<void> {
  if (!deleteTarget.value) return
  const id = deleteTarget.value.id
  try {
    await $fetch(`${apiBase}/api/projects/${id}`, { method: "DELETE" })
    projects.value = projects.value.filter(p => p.id !== id)
  } catch (error) {
    console.error("Failed to delete project", error)
  }
  deleteTarget.value = null
}

onMounted(() => {
  fetchProjects()
})
</script>

<template>
  <main class="h-screen w-screen bg-slate-100 overflow-auto">
    <!-- Header -->
    <header class="bg-white border-b border-slate-200 px-8 py-5">
      <div class="max-w-6xl mx-auto flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">DRMD</h1>
          <p class="text-sm text-slate-500 mt-0.5">Urban Scenario Simulation Platform</p>
        </div>
        <button
          class="bg-slate-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm flex items-center gap-2"
          @click="showCreateDialog = true"
        >
          <span class="text-lg">+</span> New Project
        </button>
      </div>
    </header>

    <!-- Project List -->
    <div class="max-w-6xl mx-auto px-8 py-8">
      <!-- Loading -->
      <div v-if="projectsLoading" class="text-center py-16 text-slate-400">
        <div class="animate-spin w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full mx-auto mb-3" />
        <p class="text-sm">Loading projects...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="projects.length === 0" class="text-center py-16">
        <div class="text-5xl mb-4">🗺️</div>
        <h2 class="text-lg font-semibold text-slate-700 mb-2">No projects yet</h2>
        <p class="text-sm text-slate-500 mb-6 max-w-md mx-auto">
          Create your first project. Select a city area, and DRMD will auto-import roads, buildings, and parcels from OpenStreetMap.
        </p>
        <button
          class="bg-slate-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
          @click="showCreateDialog = true"
        >
          Get Started
        </button>
      </div>

      <!-- Project Cards -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <article
          v-for="project in projects"
          :key="project.id"
          class="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-400 hover:shadow-md transition-all cursor-pointer group relative"
          @click="openProject(project.id)"
        >
          <!-- 操作按钮（悬浮显示） -->
          <div class="absolute top-3 right-3 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              class="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="Rename"
              @click="startEdit(project, $event)"
            ><Pencil class="w-3.5 h-3.5" /></button>
            <button
              class="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Delete"
              @click="confirmDelete(project, $event)"
            ><Trash2 class="w-3.5 h-3.5" /></button>
          </div>

          <div class="flex items-center gap-2 mb-3 min-w-0 pr-10">
            <h3 class="font-semibold text-slate-900 group-hover:text-slate-700 truncate min-w-0">{{ project.name }}</h3>

            <span
              v-if="project.featureCount > 0"
              class="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium shrink-0"
            >{{ project.featureCount }} features</span>
            <span
              v-else-if="project.osmImportedAt"
              class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium shrink-0"
            >OSM ✓</span>
            <span
              v-else
              class="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium shrink-0"
            >Empty</span>
          </div>

          <div class="space-y-1.5 text-xs text-slate-500">
            <div class="flex justify-between">
              <span>Features</span>
              <span class="font-mono text-slate-700">{{ project.featureCount ?? 0 }}</span>
            </div>
            <div class="flex justify-between">
              <span>Source</span>
              <span class="font-mono text-slate-700">
                {{ project.sourceType === 'admin_district' ? 'District' : project.sourceType === 'bbox' ? 'BBox' : 'Manual' }}
              </span>
            </div>
            <div class="flex justify-between">
              <span>Created</span>
              <span class="font-mono text-slate-700">{{ new Date(project.createdAt).toLocaleDateString('zh-CN') }}</span>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-slate-100 flex justify-end">
            <span class="text-xs text-blue-600 group-hover:text-blue-800 font-medium">Open →</span>
          </div>
        </article>
      </div>
    </div>

    <!-- Create Dialog -->
    <ProjectCreateDialog
      :visible="showCreateDialog"
      :loading="creatingProject"
      :error="newProjectError"
      @close="showCreateDialog = false; clearCreateError()"
      @created="handleProjectCreated"
    />

    <!-- Edit Dialog -->
    <EditProjectDialog
      :visible="editTarget !== null"
      :project-name="editTarget?.name ?? ''"
      :loading="editLoading"
      :error="editError"
      @close="editTarget = null; editError = ''"
      @save="handleEditSave"
    />

    <!-- Delete Confirmation Modal -->
    <Teleport to="body">
      <div
        v-if="deleteTarget"
        class="fixed inset-0 z-50 flex items-center justify-center"
      >
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="cancelDelete" />
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
          <h3 class="text-lg font-bold text-slate-900 mb-2">Delete Project</h3>
          <p class="text-sm text-slate-600 mb-1">
            Are you sure you want to delete <strong>{{ deleteTarget.name }}</strong>?
          </p>
          <p class="text-xs text-red-600 mb-6">
            All {{ deleteTarget.featureCount ?? 0 }} feature(s) in this project will be permanently deleted. This cannot be undone.
          </p>
          <div class="flex justify-end gap-3">
            <button
              class="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium transition-colors"
              @click="cancelDelete"
            >Cancel</button>
            <button
              class="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
              @click="executeDelete"
            >Delete</button>
          </div>
        </div>
      </div>
    </Teleport>
  </main>
</template>

<script setup lang="ts">
const props = defineProps<{
  visible: boolean
  projectName: string
  loading?: boolean
  error?: string
}>()

const emit = defineEmits<{
  (e: "close"): void
  (e: "save", name: string): void
}>()

const editName = ref("")
const localError = ref("")

watch(() => props.visible, (v) => {
  if (v) {
    editName.value = props.projectName
    localError.value = ""
  }
})

function handleSave(): void {
  const name = editName.value.trim()
  if (!name) {
    localError.value = "Project name is required"
    return
  }
  if (name === props.projectName) {
    emit("close")
    return
  }
  emit("save", name)
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter") handleSave()
  if (event.key === "Escape") emit("close")
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="emit('close')" />
      <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h3 class="text-lg font-bold text-slate-900 mb-4">Edit Project</h3>

        <label class="block text-xs font-medium text-slate-600 mb-1.5">Project Name</label>
        <input
          ref="nameInput"
          v-model="editName"
          type="text"
          maxlength="80"
          class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          @keydown="handleKeydown"
        />

        <div v-if="localError || error" class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 mt-3">
          {{ localError || error }}
        </div>

        <div class="flex justify-end gap-3 mt-5">
          <button
            class="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium transition-colors"
            @click="emit('close')"
          >Cancel</button>
          <button
            class="px-5 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
            :disabled="loading"
            @click="handleSave"
          >{{ loading ? 'Saving...' : 'Save' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

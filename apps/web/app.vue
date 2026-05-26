<template>
  <NuxtPage />
  <ToastContainer ref="toastRef" />
</template>

<script setup lang="ts">
import ToastContainer from '~/components/ToastContainer.vue'
import { registerToast, useToast } from '~/composables/useToast'

const toastRef = ref<InstanceType<typeof ToastContainer>>()

onMounted(() => {
  if (toastRef.value) {
    registerToast((type, message, durationMs) => {
      toastRef.value?.addToast(type, message, durationMs)
    })
  }
})
</script>

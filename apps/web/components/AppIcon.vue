<script setup lang="ts">
const props = withDefaults(defineProps<{
  name: string
  size?: number
}>(), { size: 18 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="inline-block align-middle shrink-0"
  >
    <!-- ===== Structure Subtypes ===== -->

    <!-- mall 商场 -->
    <template v-if="name === 'mall'">
      <path d="M3 10L12 4L21 10V21H3V10Z" />
      <path d="M9 14H15V21H9V14Z" />
      <line x1="7" y1="10" x2="7" y2="13" />
      <line x1="17" y1="10" x2="17" y2="13" />
    </template>

    <!-- shop 店铺 -->
    <template v-else-if="name === 'shop'">
      <path d="M4 10L12 5L20 10V21H4V10Z" />
      <rect x="9" y="14" width="6" height="7" />
      <line x1="4" y1="10" x2="20" y2="10" />
    </template>

    <!-- office 写字楼 -->
    <template v-else-if="name === 'office'">
      <rect x="7" y="2" width="10" height="20" rx="1" />
      <line x1="10" y1="6" x2="14" y2="6" />
      <line x1="10" y1="10" x2="14" y2="10" />
      <line x1="10" y1="14" x2="14" y2="14" />
      <rect x="10" y="18" width="4" height="4" />
    </template>

    <!-- residential 住宅 -->
    <template v-else-if="name === 'residential'">
      <path d="M4 12L12 4L20 12" />
      <path d="M6 10V21H18V10" />
      <rect x="10" y="15" width="4" height="6" />
    </template>

    <!-- park 公园 -->
    <template v-else-if="name === 'park'">
      <path d="M12 22V16" />
      <circle cx="12" cy="10" r="6" />
      <circle cx="7" cy="13" r="4" />
      <circle cx="17" cy="13" r="4" />
    </template>

    <!-- school 学校 -->
    <template v-else-if="name === 'school'">
      <path d="M4 21V11L12 5L20 11V21" />
      <line x1="12" y1="5" x2="12" y2="2" />
      <circle cx="12" cy="2" r="1" fill="currentColor" stroke="none" />
      <line x1="8" y1="14" x2="16" y2="14" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </template>

    <!-- road 道路 -->
    <template v-else-if="name === 'road'">
      <path d="M4 21L8 3H16L20 21" />
      <line x1="12" y1="3" x2="12" y2="21" stroke-dasharray="3 3" />
      <circle cx="6" cy="12" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="0.5" fill="currentColor" stroke="none" />
    </template>

    <!-- river 水系 -->
    <template v-else-if="name === 'river'">
      <path d="M2 8C5 5 8 5 11 8C14 11 17 11 20 8" />
      <path d="M2 14C5 11 8 11 11 14C14 17 17 17 20 14" />
      <path d="M2 20C5 17 8 17 11 20C14 23 17 23 20 20" />
    </template>

    <!-- other 其他 -->
    <template v-else-if="name === 'other'">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="12" cy="12" r="3" />
    </template>

    <!-- ===== Brand Types ===== -->

    <!-- owner 业主（房东） -->
    <template v-else-if="name === 'owner'">
      <path d="M3 18L5 10L9 13L12 8L15 13L19 10L21 18H3Z" />
      <line x1="3" y1="18" x2="21" y2="18" />
      <line x1="5" y1="21" x2="19" y2="21" />
    </template>

    <!-- customer 客户（租户） -->
    <template v-else-if="name === 'customer'">
      <circle cx="12" cy="7" r="4" />
      <path d="M5.5 21C5.5 17 8.5 14 12 14C15.5 14 18.5 17 18.5 21" />
    </template>

    <!-- both 均可 -->
    <template v-else-if="name === 'both'">
      <path d="M8 4L4 8L8 12" />
      <path d="M16 4L20 8L16 12" />
      <line x1="4" y1="8" x2="20" y2="8" />
      <path d="M8 12L4 16L8 20" />
      <path d="M16 12L20 16L16 20" />
      <line x1="4" y1="16" x2="20" y2="16" />
    </template>

    <!-- ===== Feature Kinds ===== -->

    <!-- poi 地图标记 -->
    <template v-else-if="name === 'poi'">
      <path d="M12 22C12 22 20 14 20 9C20 4.5 16.4 1 12 1C7.6 1 4 4.5 4 9C4 14 12 22 12 22Z" />
      <circle cx="12" cy="9" r="3" />
    </template>

    <!-- ===== Scoring & Analysis ===== -->

    <!-- score 评分 -->
    <template v-else-if="name === 'score'">
      <polygon points="12,2 15,9 22,9 16.5,14 18.5,21 12,17 5.5,21 7.5,14 2,9 9,9" />
    </template>

    <!-- influence 影响力 -->
    <template v-else-if="name === 'influence'">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3C12 3 8 8 8 12C8 16 12 21 12 21" />
      <path d="M12 3C12 3 16 8 16 12C16 16 12 21 12 21" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </template>

    <!-- spend 客单价 -->
    <template v-else-if="name === 'spend'">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5C7.5 5 6 6.5 6 8.5C6 10.5 7.5 12 9.5 12H14.5C16.5 12 18 13.5 18 15.5C18 17.5 16.5 19 14.5 19H6" />
    </template>

    <!-- topic 话题度 -->
    <template v-else-if="name === 'topic'">
      <path d="M21 11.5C21 16.75 16.75 21 11.5 21C6.25 21 2 16.75 2 11.5C2 6.25 6.25 2 11.5 2" />
      <path d="M22 2L13 11" />
      <path d="M16 2H22V8" />
    </template>

    <!-- ===== Scenario ===== -->

    <!-- scenario 场景 -->
    <template v-else-if="name === 'scenario'">
      <path d="M3 3H10V10H3V3Z" />
      <path d="M14 3H21V10H14V3Z" />
      <path d="M3 14H10V21H3V14Z" />
      <path d="M14 14H21V21H14V14Z" />
      <line x1="10" y1="6.5" x2="14" y2="6.5" stroke-dasharray="2 2" />
      <line x1="6.5" y1="10" x2="6.5" y2="14" stroke-dasharray="2 2" />
    </template>

    <!-- ===== Entity Types ===== -->

    <!-- entity 主体 -->
    <template v-else-if="name === 'entity'">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9H21" />
      <path d="M9 3V9" />
      <path d="M7 14H17" />
      <path d="M7 18H13" />
    </template>

    <!-- brand 品牌 -->
    <template v-else-if="name === 'brand'">
      <path d="M12 2L15 9L22 9L16.5 14L18.5 21L12 17L5.5 21L7.5 14L2 9L9 9Z" />
    </template>

    <!-- ===== Map Tools ===== -->

    <!-- draw 绘制 -->
    <template v-else-if="name === 'draw'">
      <path d="M12 20L20 12L16 4L4 8L8 16L12 20Z" />
      <line x1="8" y1="16" x2="16" y2="4" />
    </template>

    <!-- select 选择 -->
    <template v-else-if="name === 'select'">
      <path d="M5 3L19 12L12 13L9 20L5 3Z" />
    </template>

    <!-- layer 图层 -->
    <template v-else-if="name === 'layer'">
      <polygon points="12,2 22,8 12,14 2,8" />
      <polyline points="2,12 12,18 22,12" />
      <polyline points="2,16 12,22 22,16" />
    </template>

    <!-- district 行政区 -->
    <template v-else-if="name === 'district'">
      <path d="M3 6L9 3L15 6L21 3V18L15 21L9 18L3 21V6Z" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </template>

    <!-- ===== Misc ===== -->

    <!-- check 确认 -->
    <template v-else-if="name === 'check'">
      <polyline points="20 6 9 17 4 12" />
    </template>

    <!-- warning 警告 -->
    <template v-else-if="name === 'warning'">
      <path d="M10.29 3.86L1.82 18C1.64 18.31 1.55 18.67 1.56 19.03C1.57 19.39 1.68 19.74 1.88 20.04C2.08 20.34 2.36 20.58 2.69 20.73C3.02 20.88 3.39 20.94 3.75 20.9H20.25C20.61 20.94 20.98 20.88 21.31 20.73C21.64 20.58 21.92 20.34 22.12 20.04C22.32 19.74 22.43 19.39 22.44 19.03C22.45 18.67 22.36 18.31 22.18 18L13.71 3.86C13.32 3.21 12.68 2.83 12 2.83C11.32 2.83 10.68 3.21 10.29 3.86Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <circle cx="12" cy="17" r="0.5" fill="currentColor" stroke="none" />
    </template>

    <!-- ===== Fallback ===== -->
    <template v-else>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <circle cx="12" cy="16" r="0.5" fill="currentColor" stroke="none" />
    </template>
  </svg>
</template>

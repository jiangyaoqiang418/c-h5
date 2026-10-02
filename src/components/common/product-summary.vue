<script setup lang="ts">
import { UI_ASSETS } from '@/constants/ui-assets';
defineProps<{ title?: string; image?: string; subtitle?: string; reference?: string; quantity?: number }>();
</script>

<template>
  <view class="product-summary">
    <image :src="image || UI_ASSETS.placeholders.product" mode="aspectFill" class="cover" />
    <view class="content">
      <text class="title">{{ title || '商品信息暂未提供' }}</text>
      <text v-if="subtitle" class="meta">{{ subtitle }}</text>
      <text v-if="quantity != null" class="meta">数量 ×{{ quantity }}</text>
      <text v-if="reference" class="reference">{{ reference }}</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.product-summary { display: flex; align-items: flex-start; gap: 16rpx; }
.cover { width: 112rpx; height: 112rpx; flex-shrink: 0; border-radius: 12rpx; background: var(--yb-bg); }
.content { flex: 1; min-width: 0; }
.title { display: block; color: var(--yb-ink); font-size: 28rpx; font-weight: 600; line-height: 1.5; overflow-wrap: anywhere; }
.meta, .reference { display: block; margin-top: 6rpx; color: var(--yb-muted); font-size: 24rpx; line-height: 1.5; overflow-wrap: anywhere; }
.reference { font-variant-numeric: tabular-nums; }
</style>

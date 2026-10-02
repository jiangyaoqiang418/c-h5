<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = withDefaults(defineProps<{ text?: string; lines?: number }>(), { text: '', lines: 3 });
const expanded = ref(false);
const collapsible = computed(() => props.text.length > props.lines * 24 || props.text.split('\n').length > props.lines);
watch(() => props.text, () => { expanded.value = false; });
</script>

<template>
  <view class="content-text">
    <text class="body" :class="{ clipped: collapsible && !expanded }" :style="{ '-webkit-line-clamp': lines }">{{ text }}</text>
    <view v-if="collapsible" class="toggle" role="button" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? '收起' : '展开全文' }}<wd-icon :name="expanded ? 'arrow-up' : 'arrow-down'" size="12px" /></view>
  </view>
</template>

<style lang="scss" scoped>
.content-text { min-width: 0; }
.body { display: block; color: var(--yb-ink-2); font-size: 26rpx; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
.body.clipped { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; }
.toggle { display: flex; align-items: center; gap: 8rpx; min-height: 44px; color: var(--yb-muted); font-size: 24rpx; }
</style>

<script setup lang="ts">
import { computed } from 'vue';
import { sanitizeRichText } from '@/utils/rich-text';
const props = defineProps<{ content?: string; emptyText?: string }>();
const html = computed(() => sanitizeRichText(props.content) || `<p>${props.emptyText || '暂无详情'}</p>`);
</script>

<template><rich-text class="rich-content" :nodes="html" /></template>

<style scoped>
.rich-content { display: block; max-width: 100%; overflow-x: auto; color: #1d2129; font-size: 24rpx; line-height: 1.75; word-break: break-word; }
</style>

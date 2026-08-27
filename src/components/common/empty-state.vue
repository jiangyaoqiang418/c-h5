<script setup lang="ts">
import { computed } from 'vue';
import { UI_ASSETS } from '@/constants/ui-assets';

interface Props {
  title: string;
  description?: string;
  actionText?: string;
  variant?: 'empty' | 'error';
  image?: string;
}

const props = withDefaults(defineProps<Props>(), { variant: 'empty' });
const emit = defineEmits<{ (e: 'action'): void }>();

const illustration = computed(() => props.image || (
  props.variant === 'error' ? UI_ASSETS.illustrations.error : UI_ASSETS.illustrations.empty
));
</script>

<template>
  <view class="empty-state">
    <image :src="illustration" mode="aspectFit" class="illustration" />
    <text class="title">{{ title }}</text>
    <text v-if="description" class="desc">{{ description }}</text>
    <view v-if="actionText" class="action yb-pressable" @click="emit('action')">
      <text>{{ actionText }}</text>
      <wd-icon name="arrow-right" size="28rpx" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 112rpx 32rpx;
  text-align: center;
}

.illustration {
  width: 224rpx;
  height: 184rpx;
  margin-bottom: 28rpx;
}

.title {
  color: var(--yb-ink);
  font-size: var(--yb-fs-title-sm);
  font-weight: 600;
  line-height: 44rpx;
}

.desc {
  max-width: 500rpx;
  margin-top: 12rpx;
  color: var(--yb-muted);
  font-size: var(--yb-fs-body-sm);
  line-height: 36rpx;
}

.action {
  display: inline-flex;
  align-items: center;
  min-height: 72rpx;
  margin-top: 32rpx;
  padding: 0 28rpx;
  border-radius: var(--yb-radius-lg);
  background: var(--yb-brand);
  color: var(--yb-surface);
  font-size: var(--yb-fs-body);
  font-weight: 600;
  gap: 8rpx;
}
</style>

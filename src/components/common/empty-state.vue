<script setup lang="ts">
import { computed } from 'vue';
import { UI_ASSETS } from '@/constants/ui-assets';

interface Props {
  title: string;
  description?: string;
  actionText?: string;
  variant?: 'empty' | 'error';
  image?: string;
  showIllustration?: boolean;
}

const props = withDefaults(defineProps<Props>(), { variant: 'empty', showIllustration: false });
const emit = defineEmits<{ (e: 'action'): void }>();

const illustration = computed(() => props.image || (
  props.variant === 'error' ? UI_ASSETS.illustrations.error : UI_ASSETS.illustrations.empty
));
</script>

<template>
  <view class="empty-state">
    <image v-if="showIllustration || image" :src="illustration" mode="aspectFit" class="illustration" />
    <view v-else class="state-icon" :class="{ 'state-icon--error': variant === 'error' }">
      <wd-icon :name="variant === 'error' ? 'info-circle' : 'search'" size="48rpx" />
    </view>
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
  padding: 80rpx 32rpx;
  text-align: center;
}

.illustration {
  width: 224rpx;
  height: 184rpx;
  margin-bottom: 28rpx;
}

.state-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 104rpx;
  height: 104rpx;
  margin-bottom: 24rpx;
  border: 1rpx solid var(--yb-hairline-2);
  border-radius: 32rpx;
  background: var(--yb-surface);
  color: var(--yb-muted);
}
.state-icon--error { color: var(--yb-danger); background: var(--yb-danger-soft); border-color: transparent; }

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
  min-height: 44px;
  margin-top: 32rpx;
  padding: 0 28rpx;
  border-radius: var(--yb-radius-sm);
  background: var(--yb-brand);
  color: var(--yb-surface);
  font-size: var(--yb-fs-body);
  font-weight: 600;
  gap: 8rpx;
}
</style>

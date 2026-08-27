<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  level: Api.User.VipLevel;
  size?: 'sm' | 'md' | 'lg';
}
const props = withDefaults(defineProps<Props>(), { size: 'sm' });

const label = computed(() => (props.level === 'VIP2' ? 'VIP2' : props.level === 'VIP1' ? 'VIP1' : 'VIP0'));
</script>

<template>
  <view class="vip-badge" :class="[size, `level-${level.toLowerCase()}`]">
    <wd-icon v-if="level !== 'VIP0'" name="gift" size="12px" />
    <text class="label">{{ label }}</text>
  </view>
</template>

<style lang="scss" scoped>
.vip-badge {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
  font-family: ui-monospace, monospace;
  font-weight: 600;
  letter-spacing: 1rpx;
  line-height: 1;
}
.vip-badge.sm { font-size: 20rpx; padding: 3rpx 12rpx; }
.vip-badge.md { font-size: 24rpx; }
.vip-badge.lg { font-size: 28rpx; padding: 6rpx 20rpx; }

.vip-badge.level-vip0 {
  background: #EDECE6;
  color: #6B7385;
}
.vip-badge.level-vip1 {
  background: #F6EFE4;
  color: #B8935A;
}
.vip-badge.level-vip2 {
  background: linear-gradient(135deg, #D4A574 0%, #B8935A 50%, #8F6E3E 100%);
  color: #FFFFFF;
  box-shadow: 0 2rpx 10rpx rgba(184, 147, 90, 0.3);
}
</style>

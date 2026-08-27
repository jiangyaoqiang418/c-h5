<script setup lang="ts">
import { computed } from 'vue';
import { go } from '@/utils/navigate';
import { useUserStore } from '@/stores';

const userStore = useUserStore();

const value = computed(() => (userStore.isBuyerActive ? 'buyer' : 'customer'));

function onChange(v: 'customer' | 'buyer') {
  if (v === 'buyer' && !userStore.canSwitchToBuyer) {
    if (userStore.buyerApplicationLoadFailed) {
      uni.showToast({ title: '买手状态加载失败，请稍后重试', icon: 'none' });
      return;
    }
    go('/pages/buyer/apply');
    return;
  }
  userStore.setAudience(v);
  uni.showToast({ title: v === 'buyer' ? '已切换为买手视角' : '已切换为顾客视角', icon: 'none' });
}
</script>

<template>
  <view class="audience-segment">
    <view
      class="seg"
      :class="{ active: value === 'customer' }"
      @click="onChange('customer')"
    >
      <wd-icon name="cart" size="14px" /> <text>顾客</text>
    </view>
    <view
      class="seg"
      :class="{ active: value === 'buyer' }"
      @click="onChange('buyer')"
    >
      <wd-icon name="shop" size="14px" /> <text>买手</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.audience-segment {
  display: inline-flex;
  background: #f2f3f5;
  border-radius: 32rpx;
  padding: 4rpx;
}
.seg {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  flex: 1;
  text-align: center;
  padding: 8rpx 28rpx;
  border-radius: 28rpx;
  font-size: 24rpx;
  color: #4e5969;
  transition: all 0.2s;
}
.seg.active {
  background: #fff;
  color: var(--yb-brand);
  font-weight: 600;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}
</style>

<script setup lang="ts">
import { computed } from 'vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();

const value = computed(() => (userStore.isBuyerActive ? 'buyer' : 'customer'));

const buyerBlockedMessage = computed(() => {
  if (userStore.buyerApplicationLoadFailed) return '买手状态加载失败，请稍后重试';
  if (userStore.buyerApplication?.status === 'PENDING') return '买手申请审核中';
  if (userStore.buyerApplication?.status === 'REJECTED') return '买手申请未通过';
  if (userStore.buyerApplication?.status === 'APPROVED') {
    return userStore.currentUser?.kycStatus === 'approved' ? '买手身份尚未生效' : '买手申请已通过，请先完成 KYC 认证';
  }
  return userStore.currentUser?.kycStatus === 'approved' ? '请先申请成为买手' : '请先完成 KYC 认证';
});

function onChange(v: 'customer' | 'buyer') {
  if (v === 'buyer' && !userStore.canSwitchToBuyer) {
    uni.showToast({ title: buyerBlockedMessage.value, icon: 'none' });
    const shouldOpenKyc = !userStore.buyerApplication || userStore.buyerApplication.status === 'APPROVED';
    if (!userStore.buyerApplicationLoadFailed && shouldOpenKyc && userStore.currentUser?.kycStatus !== 'approved') {
      setTimeout(() => uni.navigateTo({ url: '/pages/kyc/index' }), 800);
    }
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
      <text>🛒 顾客</text>
    </view>
    <view
      class="seg"
      :class="{ active: value === 'buyer' }"
      @click="onChange('buyer')"
    >
      <text>🏪 买手</text>
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
  color: #4d80f0;
  font-weight: 600;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}
</style>

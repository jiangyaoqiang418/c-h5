<script setup lang="ts">
import { computed } from 'vue';
import { formatAmount } from '@/utils/format-bridge';
import { getUsdtCnyRate } from '@shared/utils/currency';

interface Props {
  balance: string | number;
  bestApy: number;
  onDeposit?: () => void;
  onWithdraw?: () => void;
}
const props = withDefaults(defineProps<Props>(), { bestApy: 0 });

const cnyEquiv = computed(() =>
  formatAmount((Number(props.balance) * getUsdtCnyRate()).toFixed(2))
);

function handleDeposit() {
  props.onDeposit?.();
}
function handleWithdraw() {
  props.onWithdraw?.();
}

function goBack() {
  uni.navigateBack();
}
</script>

<template>
  <view class="earn-hero">
    <view class="nav">
      <view class="nav-btn" @click="goBack"><text class="chev">‹</text></view>
      <text class="nav-title">小金库</text>
    </view>
    <text class="hero-eyebrow">EARN BALANCE</text>
    <view class="hero-total">
      <text class="unit">U</text>
      <text class="num">{{ formatAmount(balance) }}</text>
    </view>
    <text class="hero-sub">≈ ¥{{ cnyEquiv }}</text>
    <view v-if="bestApy > 0" class="apy-badge">
      <text class="apy-icon">▁▂▃▄</text>
      <text class="apy-num">{{ bestApy.toFixed(2) }}% APY</text>
    </view>
    <view class="hero-actions">
      <view class="action-btn primary" @click="handleDeposit">
        <text>存入</text>
      </view>
      <view class="action-btn" @click="handleWithdraw">
        <text>取出</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.earn-hero {
  background: #FFFFFF;
  border-bottom: 1rpx solid #EDECE6;
  padding: env(safe-area-inset-top) 32rpx 40rpx;
}
.nav {
  display: flex;
  align-items: center;
  padding: 16rpx 0;
  margin-bottom: 24rpx;
}
.nav-btn {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.chev {
  font-size: 48rpx;
  color: #0F111A;
  line-height: 1;
}
.nav-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #0F111A;
  margin-left: 8rpx;
}
.hero-eyebrow {
  display: block;
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 3rpx;
  color: #86909C;
  margin-bottom: 16rpx;
  text-align: center;
}
.hero-total {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
}
.hero-total .unit {
  font-family: ui-monospace, monospace;
  font-size: 44rpx;
  font-weight: 600;
  color: #86909C;
}
.hero-total .num {
  font-family: ui-monospace, monospace;
  font-size: 96rpx;
  font-weight: 700;
  color: #0F111A;
  letter-spacing: -4rpx;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.hero-sub {
  display: block;
  text-align: center;
  font-family: ui-monospace, monospace;
  font-size: 26rpx;
  color: #86909C;
  margin-bottom: 24rpx;
}
.apy-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  margin: 0 auto 40rpx;
  width: fit-content;
  padding: 12rpx 24rpx;
  background: rgba(0, 168, 138, 0.10);
  border-radius: 999rpx;
}
.apy-icon {
  color: #00A88A;
  font-size: 20rpx;
  letter-spacing: 2rpx;
}
.apy-num {
  color: #00A88A;
  font-family: ui-monospace, monospace;
  font-size: 26rpx;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.hero-actions {
  display: flex;
  gap: 20rpx;
  margin-top: 8rpx;
}
.action-btn {
  flex: 1;
  height: 96rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30rpx;
  font-weight: 700;
  background: #FFFFFF;
  color: #0F111A;
  border: 2rpx solid #EDECE6;
  letter-spacing: 2rpx;
}
.action-btn.primary {
  background: #0F111A;
  color: #FFFFFF;
  border-color: #0F111A;
}
</style>

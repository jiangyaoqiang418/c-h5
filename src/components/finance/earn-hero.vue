<script setup lang="ts">
import { computed } from 'vue';
import { formatAmount } from '@/utils/format-bridge';
import { getUsdtCnyRate } from '@shared/utils/currency';
import { UI_ASSETS } from '@/constants/ui-assets';
import { go } from '@/utils/navigate';

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
  if (getCurrentPages().length > 1) {
    uni.navigateBack();
    return;
  }
  go('/pages/my/index', true);
}
</script>

<template>
  <view class="earn-hero" :style="{ backgroundImage: `url(${UI_ASSETS.backgrounds.finance})` }">
    <view class="nav">
      <view class="nav-btn" @click="goBack"><wd-icon name="arrow-left" size="20px" /></view>
      <text class="nav-title">小金库</text>
    </view>
    <text class="hero-eyebrow">EARN BALANCE</text>
    <view class="hero-total">
      <text class="unit">U</text>
      <text class="num">{{ formatAmount(balance) }}</text>
    </view>
    <text class="hero-sub">参考 ≈ ¥{{ cnyEquiv }}</text>
    <view v-if="bestApy > 0" class="apy-badge">
      <wd-icon name="chart" size="16px" color="#fff" />
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
  background-color: #432e12;
  background-size: cover;
  background-position: center;
  color: #fff;
  border-bottom: 1rpx solid rgba(255,255,255,.12);
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
.nav-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #fff;
  margin-left: 8rpx;
}
.hero-eyebrow {
  display: block;
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 3rpx;
  color: rgba(255,255,255,.68);
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
  color: rgba(255,255,255,.76);
}
.hero-total .num {
  font-family: ui-monospace, monospace;
  font-size: 96rpx;
  font-weight: 700;
  color: #fff;
  letter-spacing: -4rpx;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.hero-sub {
  display: block;
  text-align: center;
  font-family: ui-monospace, monospace;
  font-size: 26rpx;
  color: rgba(255,255,255,.76);
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
  background: rgba(255,255,255,.14);
  border-radius: 999rpx;
}
.apy-num {
  color: #fff;
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
  background: rgba(255,255,255,.12);
  color: #fff;
  border: 2rpx solid rgba(255,255,255,.22);
  letter-spacing: 2rpx;
}
.action-btn.primary {
  background: var(--yb-brand);
  color: #FFFFFF;
  border-color: var(--yb-brand);
}
</style>

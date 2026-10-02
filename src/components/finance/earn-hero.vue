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

</script>

<template>
  <view class="earn-hero">
    <text class="hero-eyebrow">在存本金 · USDT</text>
    <view class="hero-total">
      <text class="unit">U</text>
      <text class="num">{{ formatAmount(balance) }}</text>
    </view>
    <text class="hero-sub">参考 ≈ ¥{{ cnyEquiv }}</text>
    <view v-if="bestApy > 0" class="apy-badge">
      <wd-icon name="chart" size="16px" color="var(--yb-muted)" />
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
  background-color: var(--yb-surface);
  background-size: cover;
  background-position: center;
  color: var(--yb-ink);
  border-bottom: 1rpx solid rgba(255,255,255,.12);
  padding: 32rpx 32rpx;
}
.hero-eyebrow {
  display: block;
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 0;
  color: var(--yb-muted);
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
  font-family: var(--yb-font-body);
  font-size: 44rpx;
  font-weight: 600;
  color: var(--yb-muted);
}
.hero-total .num {
  font-family: var(--yb-font-body);
  font-size: 64rpx;
  font-weight: 700;
  color: var(--yb-ink);
  letter-spacing: -1rpx;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.hero-sub {
  display: block;
  text-align: center;
  font-family: var(--yb-font-body);
  font-size: 26rpx;
  color: var(--yb-muted);
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
  background: var(--yb-bg);
  border-radius: 20rpx;
}
.apy-num {
  color: var(--yb-ink);
  font-family: var(--yb-font-body);
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
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30rpx;
  font-weight: 700;
  background: var(--yb-bg);
  color: var(--yb-ink);
  border: 1rpx solid var(--yb-hairline-2);
  letter-spacing: 2rpx;
}
.action-btn.primary {
  background: var(--yb-brand);
  color: #FFFFFF;
  border-color: var(--yb-brand);
}
</style>

<script setup lang="ts">
import { formatAmount } from '@/utils/format-bridge';

interface Props {
  earnings: string | number;
}
defineProps<Props>();
</script>

<template>
  <view class="chart-card">
    <text class="chart-label">累计收益</text>
    <view class="chart-amount">
      <text class="num">{{ formatAmount(earnings) }}</text>
      <text class="unit">USDT</text>
    </view>
    <text class="trend-empty">暂无收益走势数据</text>
  </view>
</template>

<style lang="scss" scoped>
.chart-card {
  background: var(--yb-surface);
  border: 1rpx solid var(--yb-border);
  border-radius: var(--yb-radius-lg);
  margin: 20rpx 0;
  padding: 24rpx 28rpx;
}
.chart-label {
  display: block;
  font-size: 26rpx;
  color: var(--yb-muted);
  margin-bottom: 12rpx;
}
.chart-amount {
  display: flex;
  align-items: baseline;
  gap: 8rpx;
  margin-bottom: 12rpx;
  min-width: 0;
}
.chart-amount .unit {
  font-family: var(--yb-font-body);
  font-size: 24rpx;
  flex-shrink: 0;
  font-weight: 600;
  color: var(--yb-muted);
}
.chart-amount .num {
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: var(--yb-font-body);
  font-size: 40rpx;
  font-weight: 700;
  color: #0F111A;
  letter-spacing: 0;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.trend-empty { display: block; color: var(--yb-muted); font-size: 24rpx; line-height: 1.5; }
</style>

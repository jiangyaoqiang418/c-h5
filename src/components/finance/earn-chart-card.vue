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
      <text class="unit">U</text>
      <text class="num">{{ formatAmount(earnings) }}</text>
    </view>
    <text class="trend-empty">暂无收益走势数据</text>
  </view>
</template>

<style lang="scss" scoped>
.chart-card {
  background: linear-gradient(180deg, #F0FDF7 0%, #FFFFFF 40%);
  border: 1rpx solid #EDECE6;
  border-radius: 32rpx;
  margin: 20rpx 24rpx;
  padding: 32rpx 28rpx 24rpx;
}
.chart-label {
  display: block;
  font-size: 26rpx;
  color: #86909C;
  margin-bottom: 12rpx;
}
.chart-amount {
  display: flex;
  align-items: baseline;
  gap: 8rpx;
  margin-bottom: 24rpx;
}
.chart-amount .unit {
  font-family: ui-monospace, monospace;
  font-size: 32rpx;
  font-weight: 600;
  color: #86909C;
}
.chart-amount .num {
  font-family: ui-monospace, monospace;
  font-size: 60rpx;
  font-weight: 700;
  color: #0F111A;
  letter-spacing: -2rpx;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.trend-empty { display: block; padding-top: 24rpx; color: #86909c; font-size: 24rpx; }
</style>

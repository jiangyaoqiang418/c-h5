<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatAmount } from '@/utils/format-bridge';

interface Props {
  earnings: string | number;
}
const props = defineProps<Props>();

type Range = 'day' | 'week' | 'month' | 'year';
const range = ref<Range>('year');

// Generate mock bars — 20 bars, exponential growth
const bars = computed(() => {
  const seed = range.value === 'day' ? 3 : range.value === 'week' ? 8 : range.value === 'month' ? 15 : 20;
  const arr: number[] = [];
  for (let i = 0; i < seed; i++) {
    const growth = Math.pow(1.15, i);
    const noise = 0.9 + ((i * 7) % 20) / 100;
    arr.push(growth * noise);
  }
  const max = Math.max(...arr);
  return arr.map(v => Math.max(6, (v / max) * 100));
});
</script>

<template>
  <view class="chart-card">
    <text class="chart-label">You're earning</text>
    <view class="chart-amount">
      <text class="unit">U</text>
      <text class="num">{{ formatAmount(earnings) }}</text>
    </view>
    <view class="bars">
      <view
        v-for="(h, idx) in bars"
        :key="idx"
        class="bar"
        :style="{ height: `${h}%` }"
      />
    </view>
    <view class="range-tabs">
      <view
        v-for="opt in [
          { key: 'day', label: 'Day' },
          { key: 'week', label: 'Week' },
          { key: 'month', label: 'Month' },
          { key: 'year', label: 'Year' }
        ]"
        :key="opt.key"
        class="range-tab"
        :class="{ active: range === opt.key }"
        @click="range = opt.key as Range"
      >
        <text>{{ opt.label }}</text>
      </view>
    </view>
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
.bars {
  display: flex;
  align-items: flex-end;
  gap: 6rpx;
  height: 240rpx;
  margin-bottom: 24rpx;
}
.bar {
  flex: 1;
  background: linear-gradient(180deg, #00A88A 0%, #4FE0B7 100%);
  border-radius: 8rpx 8rpx 0 0;
  min-height: 12rpx;
}
.range-tabs {
  display: flex;
  gap: 8rpx;
  background: #FAFAF7;
  border-radius: 999rpx;
  padding: 6rpx;
}
.range-tab {
  flex: 1;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  font-size: 24rpx;
  color: #86909C;
  font-weight: 500;
}
.range-tab.active {
  background: #FFFFFF;
  color: #0F111A;
  font-weight: 700;
  box-shadow: 0 4rpx 12rpx rgba(15, 17, 26, 0.06);
}
</style>

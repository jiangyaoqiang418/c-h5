<script setup lang="ts">
interface Props {
  label: string;
  value: string | number;
  unit?: string;
  icon: string;
  color?: string;
  delta?: number;
}
withDefaults(defineProps<Props>(), { color: '#5B5CE7' });
</script>

<template>
  <view class="kpi-card" :style="{ '--c': color }">
    <view class="head">
      <view class="icon-wrap">
        <wd-icon :name="icon" size="19px" :color="color" />
      </view>
      <view v-if="delta != null" class="delta" :class="{ up: delta >= 0, down: delta < 0 }">
        <text class="arrow">{{ delta >= 0 ? '↑' : '↓' }}</text>
        <text class="pct">{{ Math.abs(delta).toFixed(1) }}%</text>
      </view>
    </view>
    <view class="value-row">
      <text class="value">{{ value }}</text>
      <text v-if="unit" class="unit">{{ unit }}</text>
    </view>
    <text class="label">{{ label }}</text>
  </view>
</template>

<style lang="scss" scoped>
.kpi-card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 24rpx;
  flex-shrink: 0;
  width: 260rpx;
  border: 1rpx solid #EDECE6;
  box-shadow: 0 4rpx 12rpx rgba(15, 17, 26, 0.04);
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.icon-wrap {
  width: 56rpx;
  height: 56rpx;
  border-radius: 14rpx;
  background: color-mix(in srgb, var(--c) 12%, #FFFFFF);
  display: flex;
  align-items: center;
  justify-content: center;
}
.delta {
  display: inline-flex;
  align-items: center;
  gap: 3rpx;
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 600;
  font-family: ui-monospace, monospace;
}
.delta.up {
  background: rgba(0, 168, 138, 0.1);
  color: #00A88A;
}
.delta.down {
  background: rgba(231, 76, 60, 0.1);
  color: #E74C3C;
}
.arrow {
  font-size: 22rpx;
}
.value-row {
  display: flex;
  align-items: baseline;
  gap: 4rpx;
  margin-top: 8rpx;
}
.value {
  font-family: ui-monospace, monospace;
  font-size: 44rpx;
  font-weight: 700;
  color: #0F111A;
  letter-spacing: -1rpx;
  line-height: 1.1;
}
.unit {
  font-size: 22rpx;
  color: #6B7385;
  font-weight: 500;
}
.label {
  display: block;
  font-size: 22rpx;
  color: #6B7385;
}
</style>

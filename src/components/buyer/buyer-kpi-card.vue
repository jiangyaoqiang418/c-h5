<script setup lang="ts">
interface Props {
  label: string;
  value: string | number;
  unit?: string;
  icon: string;
  color?: string;
  delta?: number;
  description?: string;
}
withDefaults(defineProps<Props>(), { color: '#5B5CE7' });
</script>

<template>
  <view class="kpi-card" :style="{ '--c': color }">
    <view class="head" v-if="delta != null">
      <view class="icon-wrap">
        <image v-if="icon.startsWith('/')" :src="icon" class="icon-image" mode="aspectFit" />
        <wd-icon v-else :name="icon" size="19px" :color="color" />
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
  padding: 20rpx;
  flex: 1 1 calc(50% - 8rpx);
  min-width: 0;
  box-sizing: border-box;
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
  background: var(--yb-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-image { width: 56rpx; height: 56rpx; }
.description { font-size: 24rpx; line-height: 1.5; color: var(--yb-muted); }
.delta {
  display: inline-flex;
  align-items: center;
  gap: 3rpx;
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 600;
  font-family: var(--yb-font-body);
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
  font-size: 24rpx;
}
.value-row {
  display: flex;
  align-items: baseline;
  gap: 4rpx;
  flex-wrap: wrap;
  margin-top: 8rpx;
}
.value {
  font-family: var(--yb-font-body);
  font-size: 36rpx;
  font-weight: 700;
  color: #0F111A;
  letter-spacing: -1rpx;
  line-height: 1.1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.unit {
  font-size: 24rpx;
  color: var(--yb-muted);
  font-weight: 500;
}
.label {
  display: block;
  font-size: 24rpx;
  color: var(--yb-muted);
}
</style>

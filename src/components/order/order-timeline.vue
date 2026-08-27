<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  order: Api.RealOrder.OrderView;
}
const props = defineProps<Props>();

interface Step {
  label: string;
  status: 'wait' | 'process' | 'finish' | 'error';
  time?: string | number;
}

const steps = computed<Step[]>(() => {
  const o = props.order;
  if (o.rawStatus === 'CANCELED') {
    return [
      { label: '创建订单', status: 'finish', time: o.createdAt },
      { label: '已取消', status: 'error', time: o.canceledAt }
    ];
  }
  const stages: { key: string; label: string; matched: boolean; time?: string | number }[] = [
    { key: 'created', label: '创建订单', matched: true, time: o.createdAt },
    { key: 'paid', label: '已付款', matched: o.rawStatus !== 'CREATED', time: o.paidAt },
    { key: 'shipped', label: '已发货', matched: ['SHIPPED', 'REFUND_REVIEW', 'REFUNDED', 'COMPLETED'].includes(o.rawStatus), time: o.shippedAt },
    { key: 'completed', label: '已完成', matched: o.rawStatus === 'COMPLETED', time: o.completedAt }
  ];
  let foundCurrent = false;
  return stages.map(s => {
    let status: Step['status'] = 'wait';
    if (s.matched) status = 'finish';
    else if (!foundCurrent) {
      status = 'process';
      foundCurrent = true;
    }
    return { label: s.label, status, time: s.time };
  });
});
</script>

<template>
  <view class="timeline">
    <view v-for="(s, i) in steps" :key="i" class="step" :class="s.status">
      <view class="left">
        <view class="dot">
          <wd-icon v-if="s.status === 'finish'" name="check" size="12px" color="#fff" />
        </view>
        <view v-if="i < steps.length - 1" class="line" />
      </view>
      <view class="right">
        <text class="label">{{ s.label }}</text>
        <text v-if="s.time" class="time">{{ new Date(s.time).toLocaleString() }}</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.timeline {
  padding: 24rpx;
}
.step {
  display: flex;
  gap: 16rpx;
  position: relative;
}
.left {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}
.dot {
  width: 32rpx;
  height: 32rpx;
  border-radius: 50%;
  background: #e5e6eb;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 20rpx;
  font-weight: 700;
  z-index: 2;
}
.step.finish .dot {
  background: var(--yb-brand);
}
.step.process .dot {
  background: #ff7d00;
}
.step.error .dot {
  background: #f53f3f;
}
.line {
  flex: 1;
  width: 2rpx;
  background: #e5e6eb;
  min-height: 32rpx;
}
.step.finish .line {
  background: #4d80f0;
}
.right {
  flex: 1;
  padding-bottom: 24rpx;
}
.label {
  display: block;
  font-size: 26rpx;
  color: #1d2129;
  font-weight: 500;
}
.step.wait .label {
  color: #c9cdd4;
}
.time {
  display: block;
  font-size: 22rpx;
  color: #86909c;
  margin-top: 4rpx;
}
</style>

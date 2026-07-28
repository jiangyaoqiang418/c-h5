<script setup lang="ts">
import { computed } from 'vue';
import { formatCny, formatUsdt } from '@shared/utils/currency';
import { go } from '@/utils/navigate';
import OrderStatusTag from './order-status-tag.vue';

interface Props {
  order: Api.Order.OrderRecord;
}
const props = defineProps<Props>();
defineEmits<{
  (e: 'pay', o: Api.Order.OrderRecord): void;
  (e: 'cancel', o: Api.Order.OrderRecord): void;
  (e: 'confirm', o: Api.Order.OrderRecord): void;
  (e: 'review', o: Api.Order.OrderRecord): void;
  (e: 'aftersale', o: Api.Order.OrderRecord): void;
}>();

const cover = computed(
  () => props.order.productCover || `https://picsum.photos/seed/${props.order.productId}/200/200`
);

function goDetail() {
  go(`/pages/order/detail?id=${props.order.id}`);
}
</script>

<template>
  <view class="order-card" @click="goDetail">
    <view class="head">
      <text class="code">{{ order.code }}</text>
      <OrderStatusTag :status="order.status" />
    </view>
    <view class="body">
      <image :src="cover" mode="aspectFill" class="cover" />
      <view class="info">
        <text class="title">{{ order.productTitle }}</text>
        <text class="seller">买手 · {{ order.shopperName }}</text>
      </view>
      <view class="amount">
        <text class="amount-cny">{{ formatUsdt(order.totalAmount) }}</text>
        <text class="amount-usdt">≈ {{ formatCny(order.totalAmount) }}</text>
      </view>
    </view>
    <view class="actions" @click.stop>
      <wd-button
        v-if="order.status === 'PENDING_PAYMENT'"
        type="primary"
        size="small"
        @click="$emit('pay', order)"
      >
        立即付款
      </wd-button>
      <wd-button
        v-if="order.status === 'PENDING_PAYMENT'"
        plain
        size="small"
        @click="$emit('cancel', order)"
      >
        取消
      </wd-button>
      <wd-button
        v-if="order.status === 'IN_TRANSIT'"
        type="primary"
        size="small"
        @click="$emit('confirm', order)"
      >
        确认收货
      </wd-button>
      <wd-button
        v-if="['COMPLETED', 'WARRANTY'].includes(order.status)"
        plain
        size="small"
        @click="$emit('review', order)"
      >
        写评价
      </wd-button>
      <wd-button
        v-if="['COMPLETED', 'WARRANTY'].includes(order.status)"
        plain
        size="small"
        @click="$emit('aftersale', order)"
      >
        申请售后
      </wd-button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.order-card {
  background: #fff;
  border-radius: 16rpx;
  margin-bottom: 16rpx;
  padding: 24rpx;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 16rpx;
  border-bottom: 1rpx dashed #f2f3f5;
}
.code {
  font-size: 22rpx;
  color: #4e5969;
  font-family: ui-monospace, monospace;
}
.body {
  display: flex;
  gap: 16rpx;
  padding: 16rpx 0;
}
.cover {
  width: 120rpx;
  height: 120rpx;
  border-radius: 8rpx;
  flex-shrink: 0;
}
.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.title {
  font-size: 26rpx;
  color: #1d2129;
  font-weight: 500;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.seller {
  font-size: 22rpx;
  color: #86909c;
}
.amount {
  text-align: right;
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}
.amount-cny {
  font-size: 30rpx;
  font-weight: 700;
  color: #0F111A;
  font-family: ui-monospace, monospace;
  letter-spacing: -0.5rpx;
  font-variant-numeric: tabular-nums;
}
.amount-usdt {
  font-size: 20rpx;
  color: #6B7385;
  font-family: ui-monospace, monospace;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 12rpx;
  padding-top: 16rpx;
  border-top: 1rpx dashed #f2f3f5;
}
</style>

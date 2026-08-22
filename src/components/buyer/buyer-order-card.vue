<script setup lang="ts">
import { computed } from 'vue';
import { productImageUrl } from '@shared/utils/image';
import { formatCny, formatUsdt } from '@shared/utils/currency';
import { go } from '@/utils/navigate';
import OrderStatusTag from '@/components/order/order-status-tag.vue';

interface Props {
  order: Api.Order.OrderRecord | Api.RealOrder.OrderView;
  showActions?: boolean;
}
const props = withDefaults(defineProps<Props>(), { showActions: true });
defineEmits<{
  (e: 'upload-proof', o: Api.Order.OrderRecord | Api.RealOrder.OrderView): void;
  (e: 'upload-shipping', o: Api.Order.OrderRecord | Api.RealOrder.OrderView): void;
}>();

const cover = computed(
  () => props.order.productCover || (!('rawStatus' in props.order)
    ? productImageUrl(props.order.productId, 240)
    : '')
);
const counterpartName = computed(() => 'counterpartName' in props.order
  ? props.order.counterpartName
  : props.order.customerName);

function goDetail() {
  go(`/pages/order/detail?id=${props.order.id}`);
}
</script>

<template>
  <view class="bo-card" @click="goDetail">
    <view class="head">
      <text class="code">{{ order.code }}</text>
      <OrderStatusTag :status="order.status" />
    </view>
    <view class="body">
      <image :src="cover" mode="aspectFill" class="cover" />
      <view class="info">
        <text class="title">{{ order.productTitle }}</text>
        <view class="meta-chips">
          <text class="chip">👤 {{ counterpartName }}</text>
        </view>
        <text class="addr">📍 {{ order.shippingAddress }}</text>
      </view>
    </view>
    <view class="footer" @click.stop>
      <view class="amount-block">
        <text class="amount-label">收入</text>
        <text class="amount-cny">{{ formatUsdt(order.totalAmount) }}</text>
        <text class="amount-usdt">≈ {{ formatCny(order.totalAmount) }}</text>
      </view>
      <view v-if="showActions" class="actions">
        <wd-button
          v-if="order.status === 'PROCURING'"
          type="primary"
          size="small"
          @click="$emit('upload-proof', order)"
        >
          上传采购截图
        </wd-button>
        <wd-button
          v-else-if="order.status === 'PROCURED'"
          type="primary"
          size="small"
          @click="$emit('upload-shipping', order)"
        >
          上传发货
        </wd-button>
        <text v-else-if="order.status === 'IN_TRANSIT'" class="status-note">🚚 等待签收</text>
        <text v-else-if="order.status === 'COMPLETED'" class="status-note success">✓ 已完成</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.bo-card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 28rpx;
  margin-bottom: 16rpx;
  border: 1rpx solid #EDECE6;
  box-shadow: 0 4rpx 12rpx rgba(15, 17, 26, 0.04);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 16rpx;
  border-bottom: 1rpx solid #EDECE6;
}
.code {
  font-size: 22rpx;
  color: #0F111A;
  font-family: ui-monospace, monospace;
  font-weight: 600;
  letter-spacing: 1rpx;
}
.body {
  display: flex;
  gap: 20rpx;
  padding: 20rpx 0;
}
.cover {
  width: 140rpx;
  height: 140rpx;
  border-radius: 16rpx;
  flex-shrink: 0;
}
.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 28rpx;
  color: #0F111A;
  font-weight: 600;
  letter-spacing: -0.5rpx;
}
.meta-chips {
  display: flex;
  gap: 8rpx;
}
.chip {
  padding: 3rpx 12rpx;
  background: #FAFAF7;
  border-radius: 999rpx;
  font-size: 20rpx;
  color: #6B7385;
}
.addr {
  font-size: 22rpx;
  color: #A8ADB8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 20rpx;
  border-top: 1rpx solid #EDECE6;
}
.amount-block {
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}
.amount-label {
  font-size: 20rpx;
  color: #6B7385;
}
.amount-cny {
  font-family: ui-monospace, monospace;
  font-size: 34rpx;
  font-weight: 700;
  color: #00A88A;
  letter-spacing: -0.5rpx;
  font-variant-numeric: tabular-nums;
}
.amount-usdt {
  font-family: ui-monospace, monospace;
  font-size: 20rpx;
  color: #6B7385;
}
.actions {
  display: flex;
  gap: 8rpx;
}
.status-note {
  padding: 8rpx 16rpx;
  background: rgba(91, 92, 231, 0.1);
  color: #5B5CE7;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 500;
}
.status-note.success {
  background: rgba(0, 168, 138, 0.1);
  color: #00A88A;
}
</style>

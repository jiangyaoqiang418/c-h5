<script setup lang="ts">
import { computed } from 'vue';
import { productImageUrl } from '@shared/utils/image';
import PriceTag from '@/components/common/price-tag.vue';
import { go } from '@/utils/navigate';
import OrderStatusTag from '@/components/order/order-status-tag.vue';

interface Props {
  order: Api.Order.OrderRecord | Api.RealOrder.OrderView;
  showActions?: boolean;
  compact?: boolean;
}
const props = withDefaults(defineProps<Props>(), { showActions: true, compact: false });
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
      <text class="counterpart">{{ counterpartName || '顾客信息待完善' }}</text>
      <OrderStatusTag :status="order.status" />
    </view>
    <view class="body">
      <image :src="cover" mode="aspectFill" class="cover" />
      <view class="info">
        <text class="title">{{ order.productTitle }}</text>
        <view class="meta-chips">
          <text class="code">订单 {{ order.code }}</text>
        </view>
        <view v-if="!compact" class="addr"><wd-icon name="location" size="12px" /><text>{{ order.shippingAddress }}</text></view>
      </view>
    </view>
    <view class="footer">
      <view class="amount-block">
        <text class="amount-label">订单金额</text>
        <PriceTag :price="order.totalAmount" size="sm" :show-rate="false" />
      </view>
      <view v-if="showActions" class="actions">
        <wd-button
          v-if="order.status === 'PROCURING'"
          type="primary"
          size="small"
          @click.stop="$emit('upload-proof', order)"
        >
          上传采购截图
        </wd-button>
        <wd-button
          v-else-if="order.status === 'PROCURED'"
          type="primary"
          size="small"
          @click.stop="$emit('upload-shipping', order)"
        >
          上传发货
        </wd-button>
        <view v-else-if="order.status === 'IN_TRANSIT'" class="status-note"><wd-icon name="logistics" size="13px" /> <text>等待签收</text></view>
        <view v-else-if="order.status === 'COMPLETED'" class="status-note success"><wd-icon name="check" size="13px" /> <text>已完成</text></view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.bo-card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 20rpx;
  margin-bottom: 16rpx;
  border: 1rpx solid var(--yb-border);
  box-shadow: var(--yb-shadow-card);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12rpx;
  border-bottom: 1rpx solid var(--yb-border);
}
.code {
  font-size: 24rpx;
  color: var(--yb-muted);
  font-family: var(--yb-font-body);
  min-width: 0;
  margin-right: 16rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.body {
  display: flex;
  gap: 16rpx;
  padding: 16rpx 0;
}
.cover {
  width: 112rpx;
  height: 112rpx;
  border-radius: var(--yb-radius-md);
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
  font-size: 26rpx;
  color: #0F111A;
  font-weight: 600;
  letter-spacing: -0.5rpx;
}
.meta-chips {
  display: flex;
  gap: 8rpx;
  min-width: 0;
}
.chip {
  padding: 3rpx 12rpx;
  background: #FAFAF7;
  border-radius: 999rpx;
  font-size: 24rpx;
  color: var(--yb-muted);
  display: inline-flex;
  align-items: center;
  gap: 4rpx;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}
.chip > text { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.addr {
  display: flex;
  align-items: center;
  gap: 5rpx;
  font-size: 24rpx;
  color: var(--yb-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.addr > text { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.addr :deep(.wd-icon), .chip :deep(.wd-icon) { flex-shrink:0; }
.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12rpx;
  border-top: 1rpx solid var(--yb-border);
  gap: 16rpx;
  flex-wrap: wrap;
}
.amount-block {
  display: flex;
  flex-direction: column;
  gap: 2rpx;
  min-width: 0;
  max-width: 100%;
}
.amount-label {
  font-size: 24rpx;
  color: var(--yb-muted);
}
.amount-block :deep(.usdt-value), .amount-block :deep(.usdt-unit) { color: var(--yb-ink); }
.actions {
  display: flex;
  gap: 8rpx;
}
.status-note {
  display: inline-flex;
  align-items: center;
  gap: 5rpx;
  padding: 8rpx 16rpx;
  background: rgba(91, 92, 231, 0.1);
  color: #5B5CE7;
  border-radius: 999rpx;
  font-size: 24rpx;
  font-weight: 500;
}
.status-note.success {
  background: rgba(0, 168, 138, 0.1);
  color: #00A88A;
}
</style>

<style scoped lang="scss">
.counterpart { flex:1; min-width:0; font-size:26rpx; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:16rpx; }.bo-card { padding:24rpx; box-shadow:none; }.code { white-space:normal; overflow-wrap:anywhere; }.footer { justify-content:flex-end; }.amount-block { align-items:flex-end; }.amount-label { font-size:22rpx; }
</style>

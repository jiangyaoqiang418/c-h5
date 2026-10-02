<script setup lang="ts">
import { computed } from 'vue';
import PriceTag from '@/components/common/price-tag.vue';
import { go } from '@/utils/navigate';
import OrderStatusTag from './order-status-tag.vue';
import { UI_ASSETS } from '@/constants/ui-assets';

interface Props {
  order: Api.RealOrder.OrderView;
  sellerMode?: boolean;
  actionsDisabled?: boolean;
  walletPayEnabled?: boolean;
}
const props = defineProps<Props>();
defineEmits<{
  (e: 'pay', o: Api.RealOrder.OrderView): void;
  (e: 'cancel', o: Api.RealOrder.OrderView): void;
  (e: 'confirm', o: Api.RealOrder.OrderView): void;
  (e: 'extend-receipt', o: Api.RealOrder.OrderView): void;
  (e: 'review', o: Api.RealOrder.OrderView): void;
  (e: 'aftersale', o: Api.RealOrder.OrderView): void;
  (e: 'ship', o: Api.RealOrder.OrderView): void;
  (e: 'wallet-pay', o: Api.RealOrder.OrderView): void;
}>();

const cover = computed(
  () => props.order.productCover || UI_ASSETS.placeholders.product
);
const hasActions = computed(() => props.sellerMode ? props.order.rawStatus === 'PAID'
  : ['PENDING_PAYMENT', 'IN_TRANSIT', 'COMPLETED', 'WARRANTY'].includes(props.order.status)
    || ['PAID', 'SHIPPED'].includes(props.order.rawStatus));

function goDetail() {
  go(`/pages/order/detail?id=${props.order.id}`);
}
</script>

<template>
  <view class="order-card" @click="goDetail">
    <view class="head">
      <text class="counterpart">{{ order.counterpartName || order.counterpartLabel }}</text>
      <OrderStatusTag :status="order.status" />
    </view>
    <view class="body">
      <image :src="cover" mode="aspectFill" class="cover" />
      <view class="info">
        <text class="title">{{ order.productTitle }}</text>
        <text class="seller">数量 ×{{ order.quantity ?? '待确认' }}</text>
      </view>
    </view>
    <text class="code">订单 {{ order.code }}</text>
    <view class="amount">
      <text class="amount-label">订单合计</text>
      <PriceTag class="amount-values" :price="order.totalAmount" size="sm" :show-rate="false" />
    </view>
    <view v-if="hasActions" class="actions" @click.stop>
      <wd-button
        v-if="props.sellerMode && order.rawStatus === 'PAID'"
        type="primary"
        size="small"
        @click="$emit('ship', order)"
        :disabled="actionsDisabled"
      >
        填写发货
      </wd-button>
      <wd-button
        v-if="!props.sellerMode && order.status === 'PENDING_PAYMENT'"
        type="primary"
        size="small"
        @click="$emit('pay', order)"
        :disabled="actionsDisabled"
      >
        立即付款
      </wd-button>
      <wd-button v-if="walletPayEnabled && !props.sellerMode && order.orderGroupNo && order.status === 'PENDING_PAYMENT'"
        plain size="small" :disabled="actionsDisabled" @click="$emit('wallet-pay', order)">钱包进度</wd-button>
      <wd-button
        v-if="!props.sellerMode && order.status === 'PENDING_PAYMENT'"
        plain
        size="small"
        @click="$emit('cancel', order)"
        :disabled="actionsDisabled"
      >
        取消
      </wd-button>
      <wd-button
        v-if="!props.sellerMode && order.status === 'IN_TRANSIT'"
        type="primary"
        size="small"
        @click="$emit('confirm', order)"
        :disabled="actionsDisabled"
      >
        确认收货
      </wd-button>
      <wd-button v-if="!props.sellerMode && order.rawStatus === 'SHIPPED' && order.receiveExtendable === true"
        plain size="small" :disabled="actionsDisabled" @click="$emit('extend-receipt', order)">延长收货</wd-button>
      <wd-button
        v-if="!props.sellerMode && ['COMPLETED', 'WARRANTY'].includes(order.status)"
        plain
        size="small"
        @click="$emit('review', order)"
        :disabled="actionsDisabled || order.reviewEligibility?.reviewable === false"
      >
        {{ order.reviewEligibility?.reviewable === false ? (order.reviewEligibility.reasonText || '不可评价') : order.reviewEligibility?.reviewable ? '写评价' : '核对评价资格' }}
      </wd-button>
      <wd-button
        v-if="!props.sellerMode && ['PAID', 'SHIPPED'].includes(order.rawStatus)"
        plain
        size="small"
        @click="$emit('aftersale', order)"
        :disabled="actionsDisabled"
      >
        申请仅退款
      </wd-button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.order-card {
  background: #fff;
  border-radius: var(--yb-radius-lg);
  margin-bottom: 16rpx;
  padding: 20rpx;
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
.counterpart { flex:1; min-width:0; margin-right:16rpx; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:26rpx; font-weight:600; }.code { display:block;
  min-width: 0;
  margin-right: 16rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 24rpx;
  color: var(--yb-muted);
  font-family: var(--yb-font-body);
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
  justify-content: space-between;
}
.title {
  font-size: 27rpx;
  color: #1d2129;
  font-weight: 500;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.seller {
  font-size: 24rpx;
  color: var(--yb-muted);
}
.amount {
  display: flex;
  justify-content: flex-end;
  align-items: baseline;
  gap: 12rpx;
  padding-top: 4rpx;
}
.amount-label { color: var(--yb-muted); font-size: 24rpx; flex: none; }
.amount-values { min-width: 0; text-align: right; display: flex; flex-direction: column; gap: 4rpx; overflow-wrap: anywhere; }
.amount-values :deep(.main-line) { justify-content: flex-end; }
.amount-values :deep(.usdt-value), .amount-values :deep(.usdt-unit) { color: var(--yb-ink); }
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 12rpx;
  flex-wrap: wrap;
  padding-top: 16rpx;
}
</style>

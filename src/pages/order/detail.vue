<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { formatCny, formatUsdt, priceSet, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import { cancelRealOrder, confirmRealOrder, fetchOrderDetail } from '@/service/api/order';
import InfoTooltip from '@/components/common/info-tooltip.vue';
import OrderStatusTag from '@/components/order/order-status-tag.vue';
import OrderTimeline from '@/components/order/order-timeline.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const order = ref<Api.RealOrder.OrderView>();
const id = ref<Api.RealOrder.LongId>();

onLoad(async query => {
  id.value = query?.id ? String(query.id) : undefined;
  if (id.value) order.value = await fetchOrderDetail(id.value, userStore.isBuyerActive ? 'sold' : 'bought');
});

async function reload() {
  if (id.value) order.value = await fetchOrderDetail(id.value, userStore.isBuyerActive ? 'sold' : 'bought');
}

async function pay() {
  if (!order.value) return;
  uni.showToast({ title: '支付将在结算链路迁移后开放', icon: 'none' });
}

function cancel() {
  if (!order.value) return;
  uni.showModal({
    title: '取消订单？',
    success: async r => {
      if (r.confirm) {
        await cancelRealOrder({ id: order.value!.id, reason: '顾客取消' });
        uni.showToast({ title: '订单已取消', icon: 'success' });
        await reload();
      }
    }
  });
}

function confirm() {
  if (!order.value) return;
  uni.showModal({
    title: '确认收货？',
    success: async r => {
      if (r.confirm) {
        await confirmRealOrder(order.value!.id);
        uni.showToast({ title: '已确认收货', icon: 'success' });
        await reload();
      }
    }
  });
}

function goIm() {
  if (order.value) uni.showToast({ title: '消息功能尚未接入真实服务', icon: 'none' });
}

function goAftersale() {
  if (order.value) uni.showToast({ title: '售后将在后续接口批次迁移', icon: 'none' });
}

function goReview() {
  if (order.value) uni.showToast({ title: '评价功能尚未接入真实服务', icon: 'none' });
}
</script>

<template>
  <view v-if="order" class="detail-page">
    <view class="hero">
      <OrderStatusTag :status="order.status" />
      <text class="code">{{ order.code }}</text>
      <text v-if="order.createdAt" class="time">{{ new Date(order.createdAt).toLocaleString() }}</text>
    </view>

    <view class="section">
      <text class="section-title">订单进度</text>
      <OrderTimeline :order="order" />
    </view>

    <view class="section">
      <text class="section-title">收货地址</text>
      <text class="addr-name">{{ order.receiverName }} · {{ order.receiverPhone }}</text>
      <text class="addr-detail">📍 {{ order.shippingAddress }}</text>
    </view>

    <view class="section goods">
      <text class="section-title">商品信息</text>
      <view class="goods-row">
        <image :src="order.productCover || `https://picsum.photos/seed/${order.productId}/120/120`" mode="aspectFill" class="cover" />
        <view class="goods-info">
          <text class="g-title">{{ order.productTitle }}</text>
          <text class="g-seller">{{ order.counterpartLabel }} · {{ order.counterpartName }}</text>
        </view>
        <view class="g-price-block">
          <text class="g-price-cny">{{ formatUsdt(order.price) }}</text>
          <text class="g-price-usdt">≈ {{ formatCny(order.price) }}</text>
        </view>
      </view>
    </view>

    <view class="section">
      <text class="section-title">金额明细</text>
      <view class="amt-row">
        <text class="amt-lbl">商品</text>
        <view class="amt-val">
          <text class="amt-cny">{{ formatUsdt(order.price) }}</text>
          <text class="amt-usdt">≈ {{ formatCny(order.price) }}</text>
        </view>
      </view>
      <view class="amt-row">
        <text class="amt-lbl">运费</text>
        <view class="amt-val">
          <text class="amt-cny">{{ formatUsdt(order.shippingFee) }}</text>
        </view>
      </view>
      <view class="amt-row">
        <text class="amt-lbl">税费 <InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="22" /></text>
        <view class="amt-val">
          <text class="amt-cny">{{ formatUsdt(order.tax) }}</text>
        </view>
      </view>
      <view class="amt-row total">
        <text class="amt-lbl">合计</text>
        <view class="amt-val">
          <text class="amt-cny amt-big">{{ formatUsdt(order.totalAmount) }}</text>
          <text class="amt-usdt">≈ {{ formatCny(order.totalAmount) }} · {{ priceSet(order.totalAmount).rateLabel }}</text>
        </view>
      </view>
    </view>

    <view class="section">
      <text class="section-title">三方群 / 客服</text>
      <view class="link-row" @click="goIm">
        <text class="link-emoji">💬</text>
        <text class="link-label">打开三方群</text>
        <text class="link-arrow">›</text>
      </view>
    </view>

    <view class="actions-bar">
      <wd-button v-if="order.status === 'PENDING_PAYMENT'" type="primary" @click="pay">立即付款</wd-button>
      <wd-button v-if="order.status === 'PENDING_PAYMENT'" plain @click="cancel">取消订单</wd-button>
      <wd-button v-if="order.rawStatus === 'SHIPPED'" type="primary" @click="confirm">确认收货</wd-button>
      <wd-button v-if="order.rawStatus === 'COMPLETED'" plain @click="goReview">写评价</wd-button>
      <wd-button v-if="order.rawStatus === 'COMPLETED'" plain @click="goAftersale">申请售后</wd-button>
    </view>
  </view>
  <EmptyState v-else title="订单不存在" />
</template>

<style lang="scss" scoped>
.detail-page {
  min-height: 100%;
  background: #f7f8fa;
  padding-bottom: calc(144rpx + env(safe-area-inset-bottom));
}
.hero {
  background: linear-gradient(135deg, #fff 0%, #f7faff 100%);
  padding: 32rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.code {
  font-family: ui-monospace, monospace;
  font-size: 28rpx;
  color: #1d2129;
}
.time {
  font-size: 22rpx;
  color: #86909c;
}
.section {
  background: #fff;
  margin-top: 16rpx;
  padding: 24rpx 32rpx;
}
.section-title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 16rpx;
}
.addr-name {
  display: block;
  font-size: 28rpx;
  font-weight: 500;
}
.addr-detail {
  display: block;
  font-size: 24rpx;
  color: #4e5969;
  margin-top: 4rpx;
}
.goods-row {
  display: flex;
  gap: 16rpx;
}
.cover {
  width: 120rpx;
  height: 120rpx;
  border-radius: 8rpx;
  flex-shrink: 0;
}
.goods-info {
  flex: 1;
}
.g-title {
  display: block;
  font-size: 26rpx;
}
.g-seller {
  display: block;
  font-size: 22rpx;
  color: #86909c;
  margin: 4rpx 0;
}
.g-price {
  color: #f53f3f;
  font-weight: 700;
  font-family: ui-monospace, monospace;
}
.amt-row {
  display: flex;
  justify-content: space-between;
  padding: 8rpx 0;
  font-size: 24rpx;
  color: #4e5969;
}
.amt-row.total {
  font-weight: 700;
  color: #f53f3f;
  font-size: 28rpx;
  border-top: 1rpx dashed #f2f3f5;
  margin-top: 8rpx;
  padding-top: 16rpx;
}
.link-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx 0;
}
.link-emoji {
  font-size: 32rpx;
}
.link-label {
  flex: 1;
  font-size: 26rpx;
  color: #1d2129;
}
.link-arrow {
  color: #c9cdd4;
  font-size: 28rpx;
}
.actions-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-top: 1rpx solid #f2f3f5;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  display: flex;
  gap: 12rpx;
  justify-content: flex-end;
}
</style>

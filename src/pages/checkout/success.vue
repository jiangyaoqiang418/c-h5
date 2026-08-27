<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { formatAmount } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';
import { fetchOrderDetail } from '@/service/api/order';
import { UI_ASSETS } from '@/constants/ui-assets';

const order = ref<Api.RealOrder.OrderView>();
const orderId = ref<Api.RealOrder.LongId>();

onLoad(async query => {
  const id = query?.orderId;
  if (typeof id !== 'string' || !id) return;
  orderId.value = id;
  try {
    order.value = await fetchOrderDetail(id);
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '订单详情加载失败', icon: 'none' });
  }
});
</script>

<template>
  <view class="success-page yb-page">
    <image class="success-icon" :src="UI_ASSETS.illustrations.homeGuarantee" mode="aspectFit" />
    <text class="title">支付成功</text>
    <text v-if="order" class="meta">订单 {{ order.code }} · U {{ formatAmount(order.totalAmount) }}</text>
    <view class="actions">
      <wd-button v-if="orderId" type="primary" @click="go(`/pages/order/detail?id=${orderId}`)">查看订单</wd-button>
      <wd-button plain @click="go('/pages/index/index')">继续购物</wd-button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.success-page {
  min-height: 100%;
  background: var(--yb-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 112rpx 32rpx calc(96rpx + env(safe-area-inset-bottom));
}
.success-icon {
  width: 168rpx;
  height: 168rpx;
  margin-bottom: 32rpx;
}
.title {
  font-size: 40rpx;
  font-weight: 700;
  color: #151820;
}
.meta {
  font-size: 24rpx;
  color: #86909c;
  margin: 16rpx 0 48rpx;
  text-align:center;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  width: 100%;
  max-width: 520rpx;
}
</style>

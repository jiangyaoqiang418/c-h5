<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { orderApi } from '@shared';
import { formatAmount } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';

const order = ref<Api.Order.OrderRecord>();
const orderId = ref<number>();

onLoad(async query => {
  orderId.value = Number(query?.orderId);
  if (orderId.value) order.value = await orderApi.fetchOrderDetail(orderId.value);
});
</script>

<template>
  <view class="success-page">
    <view class="success-icon">✅</view>
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
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 96rpx 32rpx;
}
.success-icon {
  font-size: 128rpx;
  margin-bottom: 24rpx;
}
.title {
  font-size: 40rpx;
  font-weight: 700;
  color: #1d2129;
}
.meta {
  font-size: 24rpx;
  color: #86909c;
  margin: 16rpx 0 48rpx;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  width: 480rpx;
}
</style>

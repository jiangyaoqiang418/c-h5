<script setup lang="ts">
import { reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { formatUsdt } from '@shared/utils/currency';
import { go } from '@/utils/navigate';
import { fetchOrderDetail, createRealRefund } from '@/service/api/order';

const order = ref<Api.RealOrder.OrderView>();
const submitting = ref(false);

const form = reactive({ reason: '' });

onLoad(async query => {
  const orderId = query?.orderId;
  if (typeof orderId === 'string' && orderId) order.value = await fetchOrderDetail(orderId);
});

async function submit() {
  if (!form.reason.trim()) return uni.showToast({ title: '请填写退款原因', icon: 'none' });
  if (!order.value) return;
  submitting.value = true;
  try {
    const refundId = await createRealRefund({ orderId: order.value.id, reason: form.reason.trim() });
    uni.showToast({ title: '仅退款申请已提交', icon: 'success' });
    setTimeout(() => go(`/pages/aftersale/detail?id=${refundId}`, true), 600);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view v-if="order" class="create-page">
    <view class="step">
      <text class="step-title">仅退款</text>
      <text>退款金额以订单应付金额为准：{{ formatUsdt(order.totalAmount) }}</text>
    </view>

    <view class="step">
      <text class="step-title">退款原因</text>
      <wd-textarea v-model="form.reason" placeholder="请说明退款原因" :max-length="512" show-word-limit />
    </view>

    <wd-button type="primary" block class="submit" :loading="submitting" @click="submit">提交申请</wd-button>
  </view>
</template>

<style lang="scss" scoped>
.create-page {
  min-height: 100%;
  background: #f7f8fa;
  padding: 16rpx;
}
.overseas {
  background: #fff7e6;
  color: #ff7d00;
  padding: 16rpx;
  border-radius: 8rpx;
  font-size: 24rpx;
  margin-bottom: 16rpx;
}
.step {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
}
.step-title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
}
.img-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.img-cell {
  position: relative;
  width: 160rpx;
  height: 160rpx;
}
.img {
  width: 100%;
  height: 100%;
  border-radius: 8rpx;
}
.del {
  position: absolute;
  top: 4rpx;
  right: 4rpx;
  background: rgba(0,0,0,0.55);
  color: #fff;
  width: 32rpx;
  height: 32rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18rpx;
}
.add {
  width: 160rpx;
  height: 160rpx;
  background: #f7f8fa;
  border: 2rpx dashed #c9cdd4;
  border-radius: 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #86909c;
  font-size: 22rpx;
}
.submit {
  margin-top: 16rpx;
}
</style>

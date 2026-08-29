<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { cancelRealRefund, fetchRealRefundDetail } from '@/service/api/order';
import { formatUsdt } from '@shared/utils/currency';
import { go } from '@/utils/navigate';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { requireLogin } from '@/utils/navigate';
import { UI_ASSETS } from '@/constants/ui-assets';

const userStore = useUserStore();
const refund = ref<Api.RealOrder.OrderRefundDTO>();
const refundId = ref<Api.RealOrder.LongId>();
const statusLabel: Record<Api.RealOrder.RefundStatus, string> = {
  APPLYING: '待审核', AGREED: '已同意', REJECTED: '已驳回', CANCELED: '已撤销'
};
const status = computed(() => refund.value ? (refund.value.statusText || statusLabel[refund.value.status]) : '');

async function reload() {
  if (refundId.value === undefined) return;
  refund.value = await fetchRealRefundDetail(refundId.value);
}

onLoad(async query => {
  const id = query?.id;
  if (typeof id !== 'string' || !id) return;
  try {
    await userStore.init();
    if (!userStore.currentUser) {
      await requireLogin(`/pages/aftersale/detail?id=${encodeURIComponent(id)}`);
      return;
    }
    refundId.value = id;
    await reload();
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '售后详情加载失败', icon: 'none' });
  }
});

function cancel() {
  if (!refund.value) return;
  uni.showModal({
    title: '撤销仅退款申请？',
    success: async result => {
      if (!result.confirm || !refund.value) return;
      try {
        await cancelRealRefund(refund.value.refundId);
        uni.showToast({ title: '申请已撤销', icon: 'success' });
        await reload();
      } catch (error) {
        uni.showToast({ title: error instanceof Error ? error.message : '撤销申请失败', icon: 'none' });
      }
    }
  });
}
</script>

<template>
  <view v-if="refund" class="as-detail yb-page">
    <view class="hero">
      <text class="status">{{ status }}</text>
      <text class="type">仅退款</text>
      <text class="code">退款单号 {{ refund.refundBizNo || refund.refundId }}</text>
    </view>

    <view class="section">
      <text class="section-title">退款信息</text>
      <view class="row"><text>关联订单</text><text class="mono">{{ refund.orderNo || refund.orderId }}</text></view>
      <view class="row"><text>退款金额</text><text class="amount">{{ formatUsdt(refund.amount || 0) }}</text></view>
      <view class="row"><text>退款原因</text><text class="value">{{ refund.reason || '未填写' }}</text></view>
    </view>

    <view v-if="refund.evidenceImages?.length" class="section">
      <text class="section-title">凭证图片</text>
      <view class="evidence"><image v-for="url in refund.evidenceImages" :key="url" :src="url || UI_ASSETS.placeholders.evidence" mode="aspectFill" class="ev-img" /></view>
    </view>

    <view v-if="refund.reviewRemark" class="section">
      <text class="section-title">审核说明</text>
      <text class="value">{{ refund.reviewRemark }}</text>
    </view>

    <view class="section actions">
      <wd-button block plain @click="go(`/pages/order/detail?id=${refund.orderId}`)">查看关联订单</wd-button>
      <wd-button v-if="!userStore.isBuyerActive && refund.status === 'APPLYING'" block plain type="warning" class="mt" @click="cancel">撤销申请</wd-button>
    </view>
  </view>
  <EmptyState v-else title="仅退款记录不存在" />
</template>

<style lang="scss" scoped>
.as-detail { min-height: 100%; padding:24rpx; }.hero, .section { background:#fff; padding:24rpx; border-radius:var(--yb-radius-lg); border:1rpx solid var(--yb-border); box-shadow:var(--yb-shadow-card); }.section { margin-top:20rpx; }
.status { display: block; color: #ff7d00; font-size: 36rpx; font-weight: 700; }.type { display: block; margin-top: 8rpx; color: #1d2129; font-size: 28rpx; }.code { display: block; margin-top: 12rpx; color: #86909c; font-family: ui-monospace, monospace; font-size: 22rpx; }
.section-title { display: block; margin-bottom: 18rpx; color: #1d2129; font-size: 26rpx; font-weight: 600; }.row { display: flex; justify-content: space-between; gap: 24rpx; margin-top: 14rpx; color: #86909c; font-size: 24rpx; }.value, .mono { max-width: 68%; color: #4e5969; text-align: right; }.mono { font-family: ui-monospace, monospace; }.amount { color: #f53f3f; font-family: ui-monospace, monospace; font-size: 28rpx; font-weight: 700; }
.evidence { display: flex; flex-wrap: wrap; gap: 12rpx; }.ev-img { width: 160rpx; height: 160rpx; border-radius: 8rpx; }.actions { padding-bottom: calc(24rpx + env(safe-area-inset-bottom)); }.mt { margin-top: 12rpx; }
</style>

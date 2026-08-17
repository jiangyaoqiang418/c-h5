<script setup lang="ts">
import { ref, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { createReviewAppeal, deleteReview, fetchMyReviews, fetchReceivedReviews, fetchReviewableOrders, replyReview } from '@/service/api/review';
import { go } from '@/utils/navigate';
import ReviewCard from '@/components/review/review-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const activeKey = ref<'reviewable' | 'sent' | 'received'>('reviewable');
const list = ref<Api.RealReview.ReviewDTO[]>([]);
const reviewable = ref<Api.RealReview.ReviewableOrderVO[]>([]);

async function load() {
  if (!userStore.currentUser) return;
  if (activeKey.value === 'reviewable') {
    reviewable.value = (await fetchReviewableOrders({ pageSize: 50 })).records;
    list.value = [];
    return;
  }
  list.value = activeKey.value === 'sent'
    ? (await fetchMyReviews({ pageSize: 50 })).records
    : (await fetchReceivedReviews({ pageSize: 50 })).records;
}
onShow(load);
watch(activeKey, load);
async function remove(review: Api.RealReview.ReviewDTO) {
  uni.showModal({ title: '删除评价？', content: '删除后将不再对外展示，且不能重新评价该订单。', success: async result => { if (!result.confirm) return; await deleteReview(review.reviewId); await load(); uni.showToast({ title: '已删除', icon: 'success' }); } });
}
function input(title: string, placeholder: string) { return new Promise<string | undefined>(resolve => uni.showModal({ title, editable: true, placeholderText: placeholder, success: result => resolve(result.confirm ? result.content?.trim() : undefined) })); }
async function reply(review: Api.RealReview.ReviewDTO) { const content = await input('回复评价', '请输入回复内容'); if (!content) return; await replyReview({ reviewId: review.reviewId, content }); await load(); }
async function appeal(review: Api.RealReview.ReviewDTO) { const reason = await input('发起申诉', '请输入申诉理由'); if (!reason) return; await createReviewAppeal({ reviewId: review.reviewId, reason }); await load(); uni.showToast({ title: '申诉已提交', icon: 'success' }); }
</script>

<template>
  <view class="review-list">
    <wd-tabs v-model="activeKey" sticky><wd-tab name="reviewable" title="待评价" /><wd-tab name="sent" title="我发出的" /><wd-tab name="received" title="我收到的" /></wd-tabs>
    <view class="list">
      <view v-if="activeKey === 'reviewable' && reviewable.length">
        <view v-for="order in reviewable" :key="order.orderId" class="reviewable-card" @click="go(`/pages/review/write?orderId=${order.orderId}`)">
          <image v-if="order.productImage" :src="order.productImage" class="cover" mode="aspectFill" />
          <view class="reviewable-main"><text class="title">{{ order.productTitle || '订单商品' }}</text><text class="order-no">订单 {{ order.orderNo || order.orderId }}</text></view>
          <wd-button size="small" type="primary">去评价</wd-button>
        </view>
      </view>
      <view v-else-if="activeKey !== 'reviewable' && list.length"><ReviewCard v-for="r in list" :key="r.reviewId" :review="r" :received="activeKey === 'received'" @delete="remove" @reply="reply" @appeal="appeal" /></view>
      <EmptyState v-else title="暂无评价" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.review-list { min-height: 100%; background: #f7f8fa; }.list { padding: 16rpx; }
.reviewable-card { display: flex; gap: 16rpx; align-items: center; background: #fff; padding: 20rpx; border-radius: 16rpx; margin-bottom: 16rpx; }.cover { width: 88rpx; height: 88rpx; border-radius: 8rpx; background: #f2f3f5; }.reviewable-main { flex: 1; min-width: 0; }.title, .order-no { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.title { color: #1d2129; font-size: 27rpx; font-weight: 600; }.order-no { color: #86909c; font-size: 22rpx; margin-top: 8rpx; }
</style>

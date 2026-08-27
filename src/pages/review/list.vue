<script setup lang="ts">
import { ref, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { createReviewAppeal, deleteReview, fetchMyReviews, fetchReceivedReviews, fetchReviewableOrders, replyReview } from '@/service/api/review';
import { go } from '@/utils/navigate';
import ReviewCard from '@/components/review/review-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { UI_ASSETS } from '@/constants/ui-assets';

const userStore = useUserStore();
const activeKey = ref<'reviewable' | 'sent' | 'received'>('reviewable');
const list = ref<Api.RealReview.ReviewDTO[]>([]);
const reviewable = ref<Api.RealReview.ReviewableOrderVO[]>([]);
const loading = ref(false);
const operating = ref(false);
const loadFailed = ref(false);

async function load() {
  if (!userStore.currentUser) {
    list.value = [];
    reviewable.value = [];
    return;
  }
  loading.value = true;
  loadFailed.value = false;
  try {
    if (activeKey.value === 'reviewable') {
      reviewable.value = (await fetchReviewableOrders({ pageSize: 50 })).records;
      list.value = [];
      return;
    }
    list.value = activeKey.value === 'sent'
      ? (await fetchMyReviews({ pageSize: 50 })).records
      : (await fetchReceivedReviews({ pageSize: 50 })).records;
    reviewable.value = [];
  } catch (error) {
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '评价加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}
onShow(load);
watch(activeKey, load);
function showError(error: unknown, fallback: string) {
  uni.showToast({ title: error instanceof Error ? error.message : fallback, icon: 'none' });
}
function remove(review: Api.RealReview.ReviewDTO) {
  uni.showModal({
    title: '删除评价？',
    content: '删除后将不再对外展示，且不能重新评价该订单。',
    success: async result => {
      if (!result.confirm || operating.value) return;
      operating.value = true;
      try {
        await deleteReview(review.reviewId);
        await load();
        uni.showToast({ title: '已删除', icon: 'success' });
      } catch (error) {
        showError(error, '删除失败');
      } finally {
        operating.value = false;
      }
    }
  });
}
function input(title: string, placeholder: string) { return new Promise<string | undefined>(resolve => uni.showModal({ title, editable: true, placeholderText: placeholder, success: result => resolve(result.confirm ? result.content?.trim() : undefined) })); }
async function reply(review: Api.RealReview.ReviewDTO) {
  const content = await input('回复评价', '请输入回复内容');
  if (!content || operating.value) return;
  operating.value = true;
  try {
    await replyReview({ reviewId: review.reviewId, content });
    await load();
    uni.showToast({ title: '回复已提交', icon: 'success' });
  } catch (error) {
    showError(error, '回复失败');
  } finally {
    operating.value = false;
  }
}
async function appeal(review: Api.RealReview.ReviewDTO) {
  const reason = await input('发起申诉', '请输入申诉理由');
  if (!reason || operating.value) return;
  operating.value = true;
  try {
    await createReviewAppeal({ reviewId: review.reviewId, reason });
    await load();
    uni.showToast({ title: '申诉已提交', icon: 'success' });
  } catch (error) {
    showError(error, '申诉提交失败');
  } finally {
    operating.value = false;
  }
}
</script>

<template>
  <view class="review-list yb-page">
    <wd-tabs v-model="activeKey" sticky><wd-tab name="reviewable" title="待评价" /><wd-tab name="sent" title="我发出的" /><wd-tab name="received" title="我收到的" /></wd-tabs>
    <view class="list">
      <view v-if="loading" class="loading">加载中…</view>
      <template v-else>
        <EmptyState v-if="loadFailed" title="评价加载失败" description="请稍后重试" />
        <view v-else-if="activeKey === 'reviewable' && reviewable.length">
          <view v-for="order in reviewable" :key="order.orderId" class="reviewable-card" @click="go(`/pages/review/write?orderId=${order.orderId}`)">
            <image :src="order.productImage || UI_ASSETS.placeholders.product" class="cover" mode="aspectFill" />
            <view class="reviewable-main"><text class="title">{{ order.productTitle || '订单商品' }}</text><text class="order-no">订单 {{ order.orderNo || order.orderId }}</text></view>
            <wd-button size="small" type="primary">去评价</wd-button>
          </view>
        </view>
        <view v-else-if="activeKey !== 'reviewable' && list.length"><ReviewCard v-for="r in list" :key="r.reviewId" :review="r" :received="activeKey === 'received'" @delete="remove" @reply="reply" @appeal="appeal" /></view>
        <EmptyState v-else title="暂无评价" />
      </template>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.review-list { min-height:100%; }.list { padding:24rpx; }.loading { text-align:center; padding:48rpx 0; color:#86909c; font-size:24rpx; }
.reviewable-card { display:flex; gap:16rpx; align-items:center; background:#fff; padding:20rpx; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card); margin-bottom:16rpx; }.cover { width:96rpx; height:96rpx; border-radius:var(--yb-radius-md); background:#f2f3f5; }.reviewable-main { flex:1; min-width:0; }.title, .order-no { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.title { color:#1d2129; font-size:27rpx; font-weight:600; }.order-no { color:#86909c; font-size:22rpx; margin-top:8rpx; }
</style>

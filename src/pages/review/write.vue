<script setup lang="ts">
import { reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { createReview, fetchReviewableOrders, uploadReviewImage } from '@/service/api/review';
import { go } from '@/utils/navigate';
import ReviewStars from '@/components/common/review-stars.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const order = ref<Api.RealReview.ReviewableOrderVO>();
const submitting = ref(false);
const form = reactive<{ score: 1 | 2 | 3 | 4 | 5; content: string; photoUrls: string[] }>({ score: 5, content: '', photoUrls: [] });

onLoad(async query => {
  const orderId = String(query?.orderId || '');
  if (!orderId) return;
  order.value = (await fetchReviewableOrders({ pageSize: 50 })).records.find(item => String(item.orderId) === orderId);
});

async function addPhoto() {
  if (form.photoUrls.length >= 9) return;
  const picked = await uni.chooseImage({ count: Math.min(9 - form.photoUrls.length, 9), sizeType: ['compressed'] });
  uni.showLoading({ title: '上传中…' });
  try {
    for (const filePath of picked.tempFilePaths) {
      const uploaded = await uploadReviewImage(filePath);
      const url = uploaded.url;
      if (!url) throw new Error('上传响应缺少图片地址');
      form.photoUrls.push(url);
    }
  } finally { uni.hideLoading(); }
}
function removePhoto(index: number) { form.photoUrls.splice(index, 1); }
async function submit() {
  if (!order.value || !userStore.currentUser) return;
  submitting.value = true;
  try {
    await createReview({ orderId: order.value.orderId, productScore: form.score, sellerScore: form.score, content: form.content.trim(), images: form.photoUrls });
    uni.showToast({ title: '评价已提交', icon: 'success' });
    setTimeout(() => go('/pages/review/list', true), 700);
  } finally { submitting.value = false; }
}
</script>

<template>
  <view v-if="order" class="review-write">
    <view class="order-card"><text class="ord-code">订单 {{ order.orderNo || order.orderId }}</text><text class="ord-target">评价对象：{{ order.sellerName || '买手' }}</text></view>
    <view class="step"><text class="step-title">评分</text><view class="stars-row"><ReviewStars v-model:score="form.score" mode="input" size="lg" /><text class="score-text">{{ form.score }}.0</text></view></view>
    <view class="step"><text class="step-title">评价内容（可选）</text><wd-textarea v-model="form.content" placeholder="分享本次购物体验" :max-length="1000" show-word-limit /></view>
    <view class="step"><text class="step-title">配图（可选）</text><view class="img-grid"><view v-for="(url, index) in form.photoUrls" :key="url" class="img-cell"><image :src="url" mode="aspectFill" class="img" /><view class="del" @click="removePhoto(index)"><wd-icon name="close" size="12px" color="#fff" /></view></view><view v-if="form.photoUrls.length < 9" class="add" @click="addPhoto"><wd-icon name="add" size="18px" /><text>添加</text></view></view></view>
    <wd-button type="primary" block class="submit" :loading="submitting" @click="submit">提交评价</wd-button>
  </view>
  <EmptyState v-else title="当前订单暂不可评价" description="评价仅支持已完成且仍在评价时限内的订单" />
</template>

<style lang="scss" scoped>
.review-write { min-height: 100%; background: #f7f8fa; padding: 16rpx; }.order-card,.step { background:#fff; border-radius:16rpx; padding:24rpx; margin-bottom:16rpx; }.ord-code { display:block; font-family:ui-monospace,monospace; font-size:24rpx; color:#86909c; }.ord-target { display:block; font-size:28rpx; font-weight:600; margin-top:8rpx; }.step-title { display:block; font-size:26rpx; font-weight:600; margin-bottom:16rpx; }.stars-row { display:flex; align-items:center; gap:16rpx; }.score-text { font-size:36rpx; font-weight:700; color:#ff9a02; font-family:ui-monospace,monospace; }.img-grid { display:flex; flex-wrap:wrap; gap:12rpx; }.img-cell { position:relative; width:160rpx; height:160rpx; }.img { width:100%; height:100%; border-radius:8rpx; }.del { position:absolute; top:4rpx; right:4rpx; background:rgba(0,0,0,.55); color:#fff; width:32rpx; height:32rpx; border-radius:50%; display:flex; align-items:center; justify-content:center; }.add { width:160rpx; height:160rpx; background:#f7f8fa; border:2rpx dashed #c9cdd4; border-radius:8rpx; display:flex; flex-direction:column; gap:6rpx; align-items:center; justify-content:center; color:#86909c; font-size:22rpx; }.submit { margin-top:16rpx; }
</style>

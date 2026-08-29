<script setup lang="ts">
import { reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { createReview, fetchReviewableOrders, uploadReviewImage } from '@/service/api/review';
import { go, requireLogin } from '@/utils/navigate';
import ReviewStars from '@/components/common/review-stars.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const order = ref<Api.RealReview.ReviewableOrderVO>();
const submitting = ref(false);
const loading = ref(true);
const loadFailed = ref(false);
const form = reactive<{ score: 1 | 2 | 3 | 4 | 5; content: string; photoUrls: string[] }>({ score: 5, content: '', photoUrls: [] });

onLoad(async query => {
  const orderId = String(query?.orderId || '');
  if (!orderId) {
    loading.value = false;
    return;
  }
  loadFailed.value = false;
  try {
    await userStore.init();
    if (!userStore.currentUser) {
      await requireLogin(`/pages/review/write?orderId=${encodeURIComponent(orderId)}`);
      return;
    }
    order.value = (await fetchReviewableOrders({ pageSize: 50 })).records.find(item => String(item.orderId) === orderId);
  } catch (error) {
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '待评价订单加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
});

async function addPhoto() {
  if (form.photoUrls.length >= 9) return;
  try {
    const picked = await uni.chooseImage({ count: Math.min(9 - form.photoUrls.length, 9), sizeType: ['compressed'] });
    uni.showLoading({ title: '上传中…' });
    for (const filePath of picked.tempFilePaths) {
      const uploaded = await uploadReviewImage(filePath);
      const url = uploaded.url;
      if (!url) throw new Error('上传响应缺少图片地址');
      form.photoUrls.push(url);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as { errMsg?: string })?.errMsg || '评价图片上传失败');
    if (!message.includes('cancel')) uni.showToast({ title: message, icon: 'none' });
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
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '评价提交失败', icon: 'none' });
  } finally { submitting.value = false; }
}
</script>

<template>
  <view v-if="loading" class="loading"><wd-loading size="44rpx" /><text>正在加载待评价订单</text></view>
  <view v-else-if="order" class="review-write yb-page">
    <view class="order-card"><text class="ord-code">订单 {{ order.orderNo || order.orderId }}</text><text class="ord-target">评价对象：{{ order.sellerName || '买手' }}</text></view>
    <view class="step"><text class="step-title">评分</text><view class="stars-row"><ReviewStars v-model:score="form.score" mode="input" size="lg" /><text class="score-text">{{ form.score }}.0</text></view></view>
    <view class="step"><text class="step-title">评价内容（可选）</text><wd-textarea v-model="form.content" placeholder="分享本次购物体验" :max-length="1000" show-word-limit /></view>
    <view class="step"><text class="step-title">配图（可选）</text><view class="img-grid"><view v-for="(url, index) in form.photoUrls" :key="url" class="img-cell"><image :src="url" mode="aspectFill" class="img" /><view class="del" @click="removePhoto(index)"><wd-icon name="close" size="12px" color="#fff" /></view></view><view v-if="form.photoUrls.length < 9" class="add" @click="addPhoto"><wd-icon name="add" size="18px" /><text>添加</text></view></view></view>
    <wd-button type="primary" block class="submit" :loading="submitting" @click="submit">提交评价</wd-button>
  </view>
  <EmptyState v-else-if="loadFailed" title="待评价订单加载失败" description="请稍后重试" />
  <EmptyState v-else title="当前订单暂不可评价" description="评价仅支持已完成且仍在评价时限内的订单" />
</template>

<style lang="scss" scoped>
.review-write { min-height: 100%; padding:20rpx 24rpx 32rpx; }.order-card,.step { background:#fff; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); padding:24rpx; margin-bottom:20rpx; box-shadow:var(--yb-shadow-card); }.ord-code { display:block; font-family:ui-monospace,monospace; font-size:24rpx; color:#86909c; }.ord-target { display:block; font-size:28rpx; font-weight:600; margin-top:8rpx; }.step-title { display:block; font-size:26rpx; font-weight:600; margin-bottom:16rpx; }.stars-row { display:flex; align-items:center; gap:16rpx; }.score-text { font-size:36rpx; font-weight:700; color:#c88a06; font-family:ui-monospace,monospace; }.img-grid { display:flex; flex-wrap:wrap; gap:12rpx; }.img-cell { position:relative; width:160rpx; height:160rpx; }.img { width:100%; height:100%; border-radius:12rpx; }.del { position:absolute; top:4rpx; right:4rpx; background:rgba(0,0,0,.55); color:#fff; width:32rpx; height:32rpx; border-radius:50%; display:flex; align-items:center; justify-content:center; }.add { width:160rpx; height:160rpx; background:#f5f5f2; border:2rpx dashed #b9bdc7; border-radius:12rpx; display:flex; flex-direction:column; gap:6rpx; align-items:center; justify-content:center; color:var(--yb-brand); font-size:22rpx; }.submit { margin-top:16rpx; }
.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }
</style>

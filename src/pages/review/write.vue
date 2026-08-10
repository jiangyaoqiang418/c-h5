<script setup lang="ts">
import { reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { orderApi, reviewApi } from '@shared';
import { go } from '@/utils/navigate';
import ReviewStars from '@/components/common/review-stars.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const order = ref<Api.Order.OrderRecord>();
const submitting = ref(false);

const PRESET_TAGS = ['描述相符', '响应及时', '专业靠谱', '渠道齐全', '物流快', '价格合理'];

const form = reactive<{
  score: Api.Review.Score;
  content: string;
  tags: string[];
  photoUrls: string[];
}>({ score: 5, content: '', tags: [], photoUrls: [] });

onLoad(async query => {
  const orderId = Number(query?.orderId);
  if (orderId) order.value = await orderApi.fetchOrderDetail(orderId);
});

function toggleTag(t: string) {
  const i = form.tags.indexOf(t);
  if (i >= 0) form.tags.splice(i, 1);
  else form.tags.push(t);
}

async function addPhoto() {
  if (form.photoUrls.length >= 6) return;
  uni.showLoading({ title: '上传中…' });
  await new Promise(r => setTimeout(r, 700));
  form.photoUrls.push(`https://picsum.photos/seed/rv-${Date.now()}/320/320`);
  uni.hideLoading();
}

function removePhoto(i: number) {
  form.photoUrls.splice(i, 1);
}

async function submit() {
  if (!order.value || !userStore.currentUser) return;
  if (form.content.trim().length < 10) return uni.showToast({ title: '内容 ≥ 10 字', icon: 'none' });
  submitting.value = true;
  try {
    const r = await reviewApi.submitReviewMock({
      orderId: order.value.id,
      fromUserId: userStore.currentUser.id,
      score: form.score,
      content: form.content.trim(),
      tags: form.tags,
      photoUrls: form.photoUrls
    });
    if (r.ok) {
      uni.showToast({ title: '已提交，+1 积分', icon: 'success' });
      setTimeout(() => go('/pages/review/list', true), 700);
    } else uni.showToast({ title: r.message || '失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view v-if="order" class="review-write">
    <view class="order-card">
      <text class="ord-code">订单 {{ order.code }}</text>
      <text class="ord-target">评价对象：{{ userStore.currentUser?.id === order.customerId ? '买手' : '顾客' }}</text>
    </view>

    <view class="step">
      <text class="step-title">评分</text>
      <view class="stars-row">
        <ReviewStars v-model:score="form.score" mode="input" size="lg" />
        <text class="score-text">{{ form.score }}.0</text>
      </view>
    </view>

    <view class="step">
      <text class="step-title">标签</text>
      <view class="tag-grid">
        <view
          v-for="t in PRESET_TAGS"
          :key="t"
          class="tag"
          :class="{ active: form.tags.includes(t) }"
          @click="toggleTag(t)"
        >{{ t }}</view>
      </view>
    </view>

    <view class="step">
      <text class="step-title">评价内容</text>
      <wd-textarea v-model="form.content" placeholder="详细描述您的体验（≥ 10 字）" :max-length="500" show-word-limit />
    </view>

    <view class="step">
      <text class="step-title">配图（可选）</text>
      <view class="img-grid">
        <view v-for="(u, i) in form.photoUrls" :key="u" class="img-cell">
          <image :src="u" mode="aspectFill" class="img" />
          <view class="del" @click="removePhoto(i)">✕</view>
        </view>
        <view v-if="form.photoUrls.length < 6" class="add" @click="addPhoto">+ 添加</view>
      </view>
    </view>

    <wd-button type="primary" block class="submit" :loading="submitting" @click="submit">提交评价</wd-button>
  </view>
</template>

<style lang="scss" scoped>
.review-write { min-height: 100%; background: #f7f8fa; padding: 16rpx; }
.order-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
}
.ord-code { display: block; font-family: ui-monospace, monospace; font-size: 24rpx; color: #86909c; }
.ord-target { display: block; font-size: 28rpx; font-weight: 600; margin-top: 8rpx; }
.step {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
}
.step-title { display: block; font-size: 26rpx; font-weight: 600; margin-bottom: 16rpx; }
.stars-row { display: flex; align-items: center; gap: 16rpx; }
.score-text { font-size: 36rpx; font-weight: 700; color: #ff9a02; font-family: ui-monospace, monospace; }
.tag-grid { display: flex; flex-wrap: wrap; gap: 12rpx; }
.tag {
  padding: 10rpx 24rpx;
  border-radius: 32rpx;
  background: #f2f3f5;
  font-size: 24rpx;
  color: #4e5969;
}
.tag.active { background: #e8f3ff; color: #4d80f0; }
.img-grid { display: flex; flex-wrap: wrap; gap: 12rpx; }
.img-cell { position: relative; width: 160rpx; height: 160rpx; }
.img { width: 100%; height: 100%; border-radius: 8rpx; }
.del {
  position: absolute; top: 4rpx; right: 4rpx;
  background: rgba(0,0,0,0.55); color: #fff;
  width: 32rpx; height: 32rpx; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 18rpx;
}
.add {
  width: 160rpx; height: 160rpx;
  background: #f7f8fa;
  border: 2rpx dashed #c9cdd4;
  border-radius: 8rpx;
  display: flex; align-items: center; justify-content: center;
  color: #86909c; font-size: 22rpx;
}
.submit { margin-top: 16rpx; }
</style>

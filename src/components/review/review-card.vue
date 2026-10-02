<script setup lang="ts">
import ContentText from '@/components/common/content-text.vue';
import ProductSummary from '@/components/common/product-summary.vue';
import { computed, ref, watch } from 'vue';
import ReviewStars from '@/components/common/review-stars.vue';
interface Props { review: Api.RealReview.ReviewDTO; received?: boolean; deleteDisabled?: boolean; replyDisabled?: boolean; appealDisabled?: boolean; }
const props = defineProps<Props>();
defineEmits<{ (event: 'delete', review: Api.RealReview.ReviewDTO): void; (event: 'reply', review: Api.RealReview.ReviewDTO): void; (event: 'appeal', review: Api.RealReview.ReviewDTO): void }>();
const imagesExpanded = ref(false);
watch(() => props.review.reviewId, () => { imagesExpanded.value = false; });
const isHidden = computed(() => props.review.status === 'HIDDEN');
const canGovern = computed(() => props.received && props.review.status === 'PUBLISHED');
const hasActions = computed(() => !props.received || (canGovern.value && (!props.review.replyContent || !props.review.appealId || props.review.appealStatus !== 'PENDING')));
const statusText = computed(() => props.review.statusText || ({ PENDING: '待审核', PUBLISHED: '已发布', REJECTED: '已驳回', HIDDEN: '已隐藏' }[props.review.status] || ''));

function formatDate(value: string | number): string {
  const date = typeof value === 'number' ? new Date(value) : /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
}
function previewImage(url: string) {
  uni.previewImage({ current: url, urls: props.review.images || [] });
}
</script>

<template>
  <view class="rv-card" :class="{ hidden: isHidden }">
    <ProductSummary :title="review.productTitle" :image="review.productImage" :subtitle="review.sellerName" :reference="`订单 ${review.orderNo || review.orderId}`" />
    <view class="head"><ReviewStars :score="review.productScore" :show-score="true" size="sm" /><wd-tag size="small" plain round>{{ received ? '我收到的' : '我发出的' }} · {{ statusText }}</wd-tag></view>
    <view v-if="review.rejectReason" class="review-result"><text>驳回原因</text><ContentText :text="review.rejectReason" /></view>
    <text v-if="review.appealStatus" class="appeal-state">申诉：{{ ({ PENDING: '处理中', APPROVED: '已通过', REJECTED: '已驳回' })[review.appealStatus] }}</text>
    <view v-if="isHidden" class="hidden-overlay"><wd-icon name="warning" size="26rpx" />该评价已被平台隐藏</view>
    <template v-else>
      <ContentText :text="review.content || '用户未填写文字评价'" />
      <view v-if="review.images?.length" class="images"><image v-for="url in (imagesExpanded ? review.images : review.images.slice(0, 3))" :key="url" :src="url" mode="aspectFill" @click="previewImage(url)" /></view>
      <view v-if="(review.images?.length || 0) > 3" class="yb-expand-action" @click="imagesExpanded = !imagesExpanded">{{ imagesExpanded ? '收起图片' : `查看全部 ${review.images?.length} 张图片` }}</view>
      <view v-if="review.replyContent" class="reply"><text class="reply-label">买手回复</text><ContentText :text="review.replyContent" /></view>
      <view class="meta"><text>— {{ review.userName || (review.anonymous ? '匿名用户' : '用户') }}</text><text class="time">{{ formatDate(review.createdAt) }}</text></view>
      <view v-if="hasActions" class="actions">
        <wd-button v-if="!received" :disabled="deleteDisabled" size="small" plain type="error" @click="$emit('delete', review)">删除</wd-button>
        <template v-else-if="canGovern"><wd-button v-if="!review.replyContent" :disabled="replyDisabled" size="small" plain @click="$emit('reply', review)">回复</wd-button><wd-button v-if="!review.appealId || review.appealStatus !== 'PENDING'" :disabled="appealDisabled" size="small" plain type="warning" @click="$emit('appeal', review)">申诉</wd-button></template>
      </view>
    </template>
  </view>
</template>

<style lang="scss" scoped>
.rv-card { background:#fff; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); padding:20rpx; margin-bottom:16rpx; box-shadow:var(--yb-shadow-card); }
.rv-card.hidden { background:var(--yb-bg); }
.head { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:8rpx; margin-bottom:12rpx; }
.content,.reply { display:block; font-size:26rpx; color:#1d2129; line-height:1.6; overflow-wrap:anywhere; }
.reply { margin-top:12rpx; color:#4e5969; background:var(--yb-bg); padding:16rpx; border-radius:12rpx; }
.images { display:flex; gap:12rpx; flex-wrap:wrap; margin-top:12rpx; }
.images image { width:140rpx; height:140rpx; border-radius:12rpx; }
.meta { display:flex; flex-wrap:wrap; justify-content:space-between; gap:8rpx 16rpx; margin-top:12rpx; font-size:24rpx; color:var(--yb-muted); line-height:1.6; }
.meta > text { min-width:0; overflow-wrap:anywhere; }
.actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:12rpx; margin-top:16rpx; }
.hidden-overlay { display:flex; align-items:center; justify-content:center; gap:8rpx; text-align:center; color:#8b5300; font-size:26rpx; padding:24rpx 0; }
.head { margin-top:16rpx; }.images image { width:calc(33.333% - 8rpx); height:172rpx; }.reply-label { display:block; margin-bottom:8rpx; color:var(--yb-muted); font-size:24rpx; }.review-result { padding:12rpx 16rpx; margin-bottom:12rpx; border-radius:12rpx; background:var(--yb-warning-soft); font-size:24rpx; }.appeal-state { display:block; margin-bottom:12rpx; font-size:24rpx; color:var(--yb-muted); }
</style>

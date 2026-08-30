<script setup lang="ts">
import { computed } from 'vue';
import ReviewStars from '@/components/common/review-stars.vue';
interface Props { review: Api.RealReview.ReviewDTO; received?: boolean; deleteDisabled?: boolean; replyDisabled?: boolean; appealDisabled?: boolean; }
const props = defineProps<Props>();
defineEmits<{ (event: 'delete', review: Api.RealReview.ReviewDTO): void; (event: 'reply', review: Api.RealReview.ReviewDTO): void; (event: 'appeal', review: Api.RealReview.ReviewDTO): void }>();
const isHidden = computed(() => props.review.status === 'HIDDEN');
const canGovern = computed(() => props.received && props.review.status === 'PUBLISHED');
const statusText = computed(() => props.review.statusText || ({ PENDING: '待审核', PUBLISHED: '已发布', REJECTED: '已驳回', HIDDEN: '已隐藏' }[props.review.status] || ''));

function formatDate(value: string | number): string {
  const date = typeof value === 'number' ? new Date(value) : /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
}
</script>

<template>
  <view class="rv-card" :class="{ hidden: isHidden }">
    <view class="head"><ReviewStars :score="review.productScore" :show-score="true" size="sm" /><wd-tag size="small" plain round>{{ received ? '我收到的' : '我发出的' }} · {{ statusText }}</wd-tag></view>
    <view v-if="isHidden" class="hidden-overlay"><wd-icon name="warning" size="26rpx" />该评价已被平台隐藏</view>
    <template v-else><text class="content">{{ review.content || '用户未填写文字评价' }}</text><view v-if="review.images?.length" class="images"><image v-for="url in review.images" :key="url" :src="url" mode="aspectFill" /></view><text v-if="review.replyContent" class="reply">买手回复：{{ review.replyContent }}</text><view class="meta"><text>— {{ review.userName || (review.anonymous ? '匿名用户' : '用户') }}</text><text class="time">{{ formatDate(review.createdAt) }}</text></view><view class="actions"><wd-button v-if="!received" :disabled="deleteDisabled" size="small" plain type="error" @click="$emit('delete', review)">删除</wd-button><template v-else-if="canGovern"><wd-button v-if="!review.replyContent" :disabled="replyDisabled" size="small" plain @click="$emit('reply', review)">回复</wd-button><wd-button v-if="!review.appealId || review.appealStatus !== 'PENDING'" :disabled="appealDisabled" size="small" plain type="warning" @click="$emit('appeal', review)">申诉</wd-button></template></view></template>
  </view>
</template>

<style lang="scss" scoped>
.rv-card { background: #fff; border:1rpx solid var(--yb-border); border-radius: var(--yb-radius-lg); padding: 24rpx; margin-bottom: 16rpx; box-shadow:var(--yb-shadow-card); }.rv-card.hidden { background: #f5f5f2; }.head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12rpx; }.content,.reply { display:block; font-size:26rpx; color:#1d2129; line-height:1.6; }.reply { margin-top:12rpx; color:#4e5969; background:#f5f5f2; padding:12rpx; border-radius:12rpx; }.images { display:flex; gap:8rpx; flex-wrap:wrap; margin-top:12rpx; }.images image { width:140rpx; height:140rpx; border-radius:12rpx; }.meta { display:flex; justify-content:space-between; margin-top:12rpx; font-size:22rpx; color:#86909c; }.actions { display:flex; justify-content:flex-end; gap:12rpx; margin-top:16rpx; }.hidden-overlay { display:flex; align-items:center; justify-content:center; gap:8rpx; text-align:center; color:#a85a00; font-size:26rpx; padding:24rpx 0; }
</style>

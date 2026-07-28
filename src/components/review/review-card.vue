<script setup lang="ts">
import { computed } from 'vue';
import { enums } from '@shared';
import ReviewStars from '@/components/common/review-stars.vue';

interface Props {
  review: Api.Review.ReviewRecord;
}
const props = defineProps<Props>();

const isHidden = computed(() => props.review.moderationStatus === 'hidden');
const directionMeta = computed(() => enums.DIRECTION_META[props.review.direction]);
</script>

<template>
  <view class="rv-card" :class="{ hidden: isHidden }">
    <view class="head">
      <ReviewStars :score="review.score" :show-score="true" size="sm" />
      <wd-tag size="small" plain>{{ directionMeta.label }}</wd-tag>
    </view>
    <view v-if="isHidden" class="hidden-overlay">⚠️ 该评价已被平台隐藏</view>
    <template v-else>
      <text class="content">{{ review.content }}</text>
      <view v-if="review.tags?.length" class="tags">
        <wd-tag v-for="t in review.tags" :key="t" size="small" plain>{{ t }}</wd-tag>
      </view>
      <view class="meta">
        <text>— {{ review.fromUserName }}</text>
        <text class="time">{{ new Date(review.createdAt).toLocaleDateString() }}</text>
      </view>
    </template>
  </view>
</template>

<style lang="scss" scoped>
.rv-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
}
.rv-card.hidden {
  background: #f7f8fa;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}
.content {
  display: block;
  font-size: 26rpx;
  color: #1d2129;
  line-height: 1.6;
}
.tags {
  display: flex;
  gap: 8rpx;
  flex-wrap: wrap;
  margin-top: 12rpx;
}
.meta {
  display: flex;
  justify-content: space-between;
  margin-top: 12rpx;
  font-size: 22rpx;
  color: #86909c;
}
.hidden-overlay {
  text-align: center;
  color: #ff7d00;
  font-size: 26rpx;
  padding: 24rpx 0;
}
</style>

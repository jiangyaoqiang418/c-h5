<script setup lang="ts">
import { ref, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { reviewApi } from '@shared';
import ReviewCard from '@/components/review/review-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const activeKey = ref<'sent' | 'received'>('sent');
const list = ref<Api.Review.ReviewRecord[]>([]);

async function load() {
  if (!userStore.currentUser) return;
  const q = activeKey.value === 'sent'
    ? { fromUserId: userStore.currentUser.id, size: 50 }
    : { toUserId: userStore.currentUser.id, size: 50 };
  const r = await reviewApi.fetchMyReviews(q);
  list.value = r.records;
}
onShow(load);
watch(activeKey, load);
</script>

<template>
  <view class="review-list">
    <wd-tabs v-model="activeKey" sticky>
      <wd-tab name="sent" title="我发出的" />
      <wd-tab name="received" title="我收到的" />
    </wd-tabs>
    <view class="list">
      <view v-if="list.length">
        <ReviewCard v-for="r in list" :key="r.id" :review="r" />
      </view>
      <EmptyState v-else title="暂无评价" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.review-list { min-height: 100%; background: #f7f8fa; }
.list { padding: 16rpx; }
</style>

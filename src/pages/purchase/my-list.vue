<script setup lang="ts">
import { ref, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { purchaseApi } from '@shared';
import { go } from '@/utils/navigate';
import PurchaseRequestCard from '@/components/purchase/purchase-request-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const activeKey = ref('all');
const list = ref<Api.PurchaseRequest.PurchaseRequest[]>([]);

const TABS: { key: string; label: string; statuses?: Api.PurchaseRequest.RequestStatus[] }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待审核', statuses: ['pending_audit'] },
  { key: 'pushing', label: '推送中', statuses: ['pushing'] },
  { key: 'claimed', label: '已接单', statuses: ['claimed'] },
  { key: 'cancelled', label: '已取消', statuses: ['cancelled', 'rejected'] }
];

async function load() {
  if (!userStore.currentUser) return;
  const tab = TABS.find(t => t.key === activeKey.value);
  const r = await purchaseApi.fetchMyPurchases(userStore.currentUser.id, tab?.statuses);
  list.value = r.records;
}
onShow(load);
watch(activeKey, load);

function onCancel(req: Api.PurchaseRequest.PurchaseRequest) {
  uni.showModal({
    title: '撤销求购？',
    success: async r => {
      if (r.confirm) {
        await purchaseApi.cancelPurchaseMock(req.id, '顾客撤销');
        load();
      }
    }
  });
}
</script>

<template>
  <view class="my-purchase-page">
    <view class="hero">
      <text class="hero-eyebrow">MY PURCHASE REQUESTS</text>
      <text class="hero-title">我的求购</text>
      <text class="hero-sub">跟踪状态 · 接单进度 · 关联订单</text>
    </view>
    <wd-tabs v-model="activeKey" sticky>
      <wd-tab v-for="t in TABS" :key="t.key" :name="t.key" :title="t.label" />
    </wd-tabs>
    <view class="list">
      <view v-if="list.length">
        <PurchaseRequestCard v-for="r in list" :key="r.id" :request="r" mode="mine" @cancel="onCancel" />
      </view>
      <EmptyState
        v-else
        title="暂无求购"
        description="发起求购让全球买手为您代购"
        action-text="发起求购"
        @action="go('/pages/purchase/create')"
      />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.my-purchase-page {
  min-height: 100vh;
  background: #FAFAF7;
}
.hero {
  background: #FFFFFF;
  border-bottom: 1rpx solid #EDECE6;
  padding: 40rpx 32rpx 32rpx;
}
.hero-eyebrow {
  display: block;
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 3rpx;
  color: #6B7385;
  margin-bottom: 12rpx;
}
.hero-title {
  display: block;
  font-size: 44rpx;
  font-weight: 700;
  color: #0F111A;
  letter-spacing: -1rpx;
}
.hero-sub {
  display: block;
  font-size: 24rpx;
  color: #6B7385;
  margin-top: 8rpx;
}
.list {
  padding: 16rpx;
}
</style>

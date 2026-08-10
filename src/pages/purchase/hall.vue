<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import { go } from '@/utils/navigate';
import PurchaseRequestCard from '@/components/purchase/purchase-request-card.vue';
import AudienceSegment from '@/components/common/audience-segment.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { claimRequest, fetchHall } from '@/service/api/purchase';

const userStore = useUserStore();
const list = ref<Api.PurchaseRequest.PurchaseRequest[]>([]);
const loading = ref(false);

const canClaim = computed(
  () => userStore.currentUser?.isBuyer && userStore.currentUser?.kycStatus === 'approved' && userStore.isBuyerActive
);

async function load() {
  loading.value = true;
  try {
    await userStore.init();
    const r = await fetchHall({ size: 30 });
    list.value = r.records;
  } catch (error) {
    list.value = [];
    uni.showToast({ title: error instanceof Error ? error.message : '求购大厅加载失败', icon: 'none' });
  } finally {
    loading.value = false;
    uni.stopPullDownRefresh();
  }
}

onMounted(load);
onPullDownRefresh(load);

async function onClaim(req: Api.PurchaseRequest.PurchaseRequest) {
  if (!userStore.currentUser) {
    uni.showToast({ title: '请先登录', icon: 'none' });
    return;
  }
  try {
    const r = await claimRequest(req.id);
    if (r.ok) {
      uni.showToast({ title: '接单成功', icon: 'success' });
      load();
    } else {
      uni.showToast({ title: r.message || '接单失败', icon: 'none' });
    }
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '接单失败', icon: 'none' });
  }
}

function goMy() {
  go('/pages/purchase/my-list');
}

function goCreate() {
  go('/pages/purchase/create');
}
</script>

<template>
  <view class="hall-page h5-tab-page">
    <view class="hero">
      <text class="hero-eyebrow">PURCHASE HALL · REAL-TIME</text>
      <text class="hero-title">求购大厅</text>
      <text class="hero-sub">USDT 担保 · 全球买手 · 24h 接单</text>
      <view class="hero-row">
        <AudienceSegment />
        <view class="hero-actions">
          <wd-button plain size="small" @click="goMy">我的求购</wd-button>
          <wd-button type="primary" size="small" @click="goCreate">+ 发起</wd-button>
        </view>
      </view>
    </view>

    <view v-if="canClaim" class="tip">
      <text>🙋 您是认证买手，下方为推送给您的求购任务</text>
    </view>

    <view class="list">
      <view v-if="list.length">
        <PurchaseRequestCard
          v-for="r in list"
          :key="r.id"
          :request="r"
          mode="hall"
          :can-claim="canClaim"
          @claim="onClaim"
        />
      </view>
      <EmptyState
        v-else-if="!loading"
        title="暂无求购任务"
        description="发起求购让全球买手为您代购"
        action-text="发起求购"
        @action="goCreate"
      />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.hall-page {
  min-height: 100%;
  background: #FAFAF7;
  padding-bottom: 160rpx;
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
  font-size: 48rpx;
  font-weight: 700;
  color: #0F111A;
  letter-spacing: -1rpx;
}
.hero-sub {
  display: block;
  font-size: 24rpx;
  color: #6B7385;
  margin: 8rpx 0 24rpx;
}
.hero-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16rpx;
}
.hero-actions {
  display: flex;
  gap: 8rpx;
}
.tip {
  background: #F6EFE4;
  color: #B8935A;
  padding: 16rpx 24rpx;
  font-size: 22rpx;
  margin: 16rpx;
  border-radius: 12rpx;
  border: 1rpx solid rgba(184, 147, 90, 0.24);
}
.list {
  padding: 16rpx;
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import { go, requireLogin } from '@/utils/navigate';
import PurchaseRequestCard from '@/components/purchase/purchase-request-card.vue';
import AudienceSegment from '@/components/common/audience-segment.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { claimRequest, fetchHall } from '@/service/api/purchase';
import { UI_ASSETS } from '@/constants/ui-assets';

const userStore = useUserStore();
const list = ref<Api.PurchaseRequest.PurchaseRequest[]>([]);
const loading = ref(false);
const loadFailed = ref(false);

const canClaim = computed(
  () => userStore.currentUser?.isBuyer && userStore.currentUser?.kycStatus === 'approved' && userStore.isBuyerActive
);

async function load() {
  loading.value = true;
  loadFailed.value = false;
  try {
    await userStore.init();
    if (!userStore.currentUser) {
      list.value = [];
      return;
    }
    const r = await fetchHall({ size: 30 });
    list.value = r.records;
  } catch (error) {
    loadFailed.value = true;
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

async function goMy() {
  if (await requireLogin('/pages/purchase/my-list')) go('/pages/purchase/my-list');
}

async function goCreate() {
  if (await requireLogin('/pages/purchase/create')) go('/pages/purchase/create');
}
</script>

<template>
  <view class="hall-page yb-page h5-tab-page">
    <view class="hero" :style="{ backgroundImage: `url(${UI_ASSETS.backgrounds.purchase})` }">
      <text class="hero-eyebrow">PURCHASE HALL · REAL-TIME</text>
      <text class="hero-title">求购大厅</text>
      <text class="hero-sub">USDT 担保 · 全球买手 · 24h 接单</text>
      <view class="hero-row">
        <AudienceSegment />
        <view class="hero-actions">
          <wd-button plain size="small" @click="goMy">我的求购</wd-button>
          <wd-button type="primary" size="small" @click="goCreate"><wd-icon name="add" size="15px" /> 发起</wd-button>
        </view>
      </view>
    </view>

    <view v-if="canClaim" class="tip">
      <wd-icon name="shield" size="16px" />
      <text>您是认证买手，下方为推送给您的求购任务</text>
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
        v-else-if="loadFailed"
        title="求购大厅加载失败"
        description="请稍后重试"
      />
      <view v-else-if="loading" class="hall-loading"><wd-loading size="44rpx" /><text>正在加载求购任务</text></view>
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
.hero {
  background-color: #10131f;
  background-size: cover;
  background-position: center;
  color: #fff;
  padding: 44rpx 28rpx 32rpx;
  position: relative;
  overflow: hidden;
}
.hero-eyebrow {
  display: block;
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 3rpx;
  color: rgba(255, 255, 255, 0.66);
  margin-bottom: 12rpx;
}
.hero-title {
  display: block;
  font-size: 48rpx;
  font-weight: 700;
  color: #fff;
  letter-spacing: -1rpx;
}
.hero-sub {
  display: block;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.76);
  margin: 8rpx 0 24rpx;
}
.hero-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 16rpx;
}
.hero-actions {
  display: flex;
  margin-left: auto;
  gap: 8rpx;
}
.hero-actions :deep(.wd-button) {
  min-width: 112rpx;
}
.tip {
  background: #fff5f6;
  color: #b91b31;
  padding: 16rpx 20rpx;
  font-size: var(--yb-font-xs);
  margin: 24rpx 24rpx 0;
  border-radius: var(--yb-radius-md);
  border: 1rpx solid #ffd5db;
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.list {
  padding: 24rpx;
}
.hall-loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }
</style>

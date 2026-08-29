<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { enums } from '@shared';
import { formatAmount } from '@/utils/format-bridge';
import PushTierBadge from '@/components/purchase/push-tier-badge.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { cancelPurchase, claimRequest, fetchPurchaseDetail } from '@/service/api/purchase';
import { requireLogin } from '@/utils/navigate';

const userStore = useUserStore();
const request = ref<Api.PurchaseRequest.PurchaseRequest>();
const id = ref<string>();
const logs = ref<Api.PurchaseRequest.PushLog[]>([]);
const loading = ref(true);
const loadFailed = ref(false);

onLoad(async query => {
  try {
    await userStore.init();
    id.value = query?.id ? String(query.id) : undefined;
    if (!userStore.currentUser) {
      if (id.value) await requireLogin(`/pages/purchase/detail?id=${encodeURIComponent(id.value)}`);
      return;
    }
    if (id.value) {
      const r = await fetchPurchaseDetail(id.value, userStore.realUserId);
      request.value = r.request;
      logs.value = r.pushLogs;
    }
  } catch (error) {
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '求购详情加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
});

const statusMeta = computed(() => (request.value ? enums.PURCHASE_STATUS_META[request.value.status] : undefined));
const isMy = computed(() => !!userStore.realUserId && userStore.realUserId === String(request.value?.customerId || ''));
const canClaim = computed(() => {
  if (!request.value || !userStore.currentUser) return false;
  return request.value.status === 'pushing' && userStore.isBuyerActive && userStore.currentUser.kycStatus === 'approved';
});

async function reload() {
  if (id.value) {
    try {
      const r = await fetchPurchaseDetail(id.value, userStore.realUserId);
      request.value = r.request;
      logs.value = r.pushLogs;
    } catch (error) {
      uni.showToast({ title: error instanceof Error ? error.message : '求购详情加载失败', icon: 'none' });
    }
  }
}

async function claim() {
  if (!request.value || !userStore.currentUser) return;
  try {
    const r = await claimRequest(request.value.id);
    if (r.ok) {
      uni.showToast({ title: '接单成功', icon: 'success' });
      reload();
    } else uni.showToast({ title: r.message || '失败', icon: 'none' });
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '接单失败', icon: 'none' });
  }
}

function cancel() {
  if (!request.value) return;
  uni.showModal({
    title: '撤销求购？',
    success: async r => {
      if (r.confirm) {
        try {
          await cancelPurchase(request.value!.id);
          reload();
        } catch (error) {
          uni.showToast({ title: error instanceof Error ? error.message : '撤销失败', icon: 'none' });
        }
      }
    }
  });
}
</script>

<template>
  <view v-if="request" class="detail-page yb-page">
    <view class="hero">
      <wd-tag v-if="statusMeta" plain round size="medium">{{ statusMeta.label }}</wd-tag>
      <text class="code">{{ request.code }}</text>
      <text class="title">{{ request.productTitle }}</text>
      <view class="cat"><wd-icon name="goods" size="14px" /><text>{{ request.categoryPath }}</text></view>
    </view>

    <view class="meta">
      <view class="meta-cell">
        <text class="lbl">预算</text>
        <text class="val budget">U {{ formatAmount(request.budgetAmount) }}</text>
      </view>
      <view class="meta-cell">
        <text class="lbl">期望发货</text>
        <text class="val">{{ request.expectedDays }} 天</text>
      </view>
      <view class="meta-cell">
        <text class="lbl">海外</text>
        <text class="val">{{ request.overseasCustoms ? '是' : '否' }}</text>
      </view>
    </view>

    <view class="section">
      <text class="section-title">求购说明</text>
      <text class="appeal">{{ request.appeal }}</text>
    </view>

    <view v-if="request.auditNote" class="section review-section">
      <text class="section-title">审核意见</text>
      <text class="appeal">{{ request.auditNote }}</text>
    </view>

    <view v-if="request.status === 'pushing' && (request.currentPushLevel || request.pushedToBuyerIds.length)" class="section">
      <text class="section-title">推送轨迹</text>
      <view class="push-row">
        <PushTierBadge v-if="request.currentPushLevel" :level="request.currentPushLevel" />
        <text class="push-hint">已推送 {{ request.pushedToBuyerIds?.length || 0 }} 位买手</text>
      </view>
    </view>

    <view v-if="logs.length" class="section">
      <text class="section-title">推送日志</text>
      <view v-for="log in logs" :key="log.id" class="log-row">
        <PushTierBadge :level="log.pushLevel" />
        <text class="log-text">{{ log.buyerIds.length }} 位 · {{ new Date(log.pushedAt).toLocaleString() }}</text>
      </view>
    </view>

    <view class="bottom-bar">
      <wd-button v-if="canClaim" type="primary" block @click="claim">我接此单</wd-button>
      <wd-button v-if="isMy && ['pending_audit', 'pushing'].includes(request.status)" type="error" plain @click="cancel">撤销</wd-button>
    </view>
  </view>
  <EmptyState v-else-if="loadFailed" title="求购详情加载失败" description="请稍后重试" />
  <EmptyState v-else-if="!loading" title="求购不存在" />
</template>

<style lang="scss" scoped>
.detail-page { min-height:100%; padding:20rpx 24rpx calc(164rpx + env(safe-area-inset-bottom)); }
.hero {
  background: #fff;
  padding: 32rpx;
  border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card);
}
.code {
  display: block;
  font-family: ui-monospace, monospace;
  font-size: 22rpx;
  color: #86909c;
  margin: 12rpx 0;
}
.title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
}
.cat {
  display: flex;
  align-items: center;
  gap: 6rpx;
  font-size: 22rpx;
  color: #86909c;
  margin-top: 8rpx;
}
.meta {
  background: #fff;
  margin-top: 20rpx;
  display: flex;
  padding: 24rpx;
  border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card);
}
.meta-cell {
  flex: 1;
  text-align: center;
}
.lbl {
  display: block;
  font-size: 22rpx;
  color: #86909c;
}
.val {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  margin-top: 4rpx;
}
.val.budget {
  font-size: 36rpx;
  color: #f53f3f;
  font-family: ui-monospace, monospace;
}
.section {
  background: #fff;
  margin-top: 20rpx;
  padding: 24rpx 32rpx;
  border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card);
}
.section-title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
}
.appeal {
  font-size: 24rpx;
  color: #4e5969;
  line-height: 1.6;
}
.push-row {
  display: flex;
  gap: 12rpx;
  align-items: center;
}
.push-hint {
  font-size: 22rpx;
  color: #86909c;
}
.log-row {
  display: flex;
  gap: 12rpx;
  align-items: center;
  padding: 12rpx 0;
}
.log-text {
  font-size: 22rpx;
  color: #86909c;
}
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid var(--yb-border);
  display: flex;
  gap: 12rpx;
}
</style>

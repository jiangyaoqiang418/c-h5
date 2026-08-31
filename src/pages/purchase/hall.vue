<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import { usePagedList } from '@/utils/paged-list';
import { useNavigationGuards } from '@/utils/navigate';
import { usePageOperation } from '@/utils/page-operation';
import { claimPurchase, readClaimReceipts, reconcileClaimReceipts, type ClaimReceipt } from '@/utils/purchase-claim';
import { getAccessToken } from '@/service/request/token';
import PurchaseRequestCard from '@/components/purchase/purchase-request-card.vue';
import AudienceSegment from '@/components/common/audience-segment.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { fetchHall } from '@/service/api/purchase';
import { UI_ASSETS } from '@/constants/ui-assets';

const { requireLogin } = useNavigationGuards();

const userStore = useUserStore();
const claiming = ref(false);
const opening = ref(false);
const reading = ref(false);
const receiptFailed = ref(false);
const receipts = ref(new Map<string, ClaimReceipt>());
const lastClaim = ref<ClaimReceipt>();
let readVersion = 0;
let retryReset = true;
const page = usePageOperation(() => {
  readVersion++;
  claiming.value = false;
  opening.value = false;
  reading.value = false;
  receiptFailed.value = false;
  receipts.value = new Map();
  lastClaim.value = undefined;
});

const canClaim = computed(
  () => userStore.currentUser?.isBuyer && userStore.currentUser?.kycStatus === 'approved' && userStore.isBuyerActive
);

const { list, loading, loadFailed, hasMore, load: loadPage, invalidate, clear } = usePagedList<Api.PurchaseRequest.PurchaseRequest>({
  key: item => item.id,
  preserveOnReset: true,
  fetch: async (pageNo, pageSize) => {
    if (!page.visible.value || !userStore.currentUser) throw new Error('请先登录查看求购任务');
    return fetchHall({ current: pageNo, size: pageSize });
  }
});
const displayedRequests = computed(() => list.value.filter(item => receipts.value.get(String(item.id))?.state !== 'confirmed'));
const unknownCount = computed(() => [...receipts.value.values()].filter(item => item.state === 'unknown').length);

function refreshReceipts() {
  try {
    const saved = readClaimReceipts(userStore.realUserId || '');
    const next = new Map(saved.map(item => [String(item.demandId), item]));
    if (lastClaim.value?.state === 'confirmed') next.set(String(lastClaim.value.demandId), lastClaim.value);
    receipts.value = next;
    receiptFailed.value = false;
  } catch { receiptFailed.value = true; }
}

async function load(reset = true) {
  if (!page.visible.value || reading.value || claiming.value) return;
  const operation = page.capture();
  const version = ++readVersion;
  const current = () => operation.isCurrent() && version === readVersion;
  reading.value = true;
  retryReset = reset;
  try {
    await userStore.init();
    if (!current()) return;
    if (!userStore.currentUser) {
      if (getAccessToken()) throw new Error('账户资料读取失败，请重试');
      clear();
      return;
    }
    refreshReceipts();
    await loadPage(reset);
    if (!current() || receiptFailed.value) return;
    const pendingIds = new Set([...receipts.value.values()].filter(item => item.state === 'unknown').map(item => String(item.demandId)));
    await reconcileClaimReceipts(userStore.realUserId || '', current);
    if (current()) {
      refreshReceipts();
      const recovered = [...receipts.value.values()].find(item => item.state === 'confirmed' && pendingIds.has(String(item.demandId)));
      if (recovered) lastClaim.value = recovered;
    }
  } catch (error) {
    if (current()) { loadFailed.value = true; uni.showToast({ title: error instanceof Error ? error.message : '求购任务读取失败', icon: 'none' }); }
  } finally { if (version === readVersion) { reading.value = false; uni.stopPullDownRefresh(); } }
}
onShow(() => load());
onPullDownRefresh(() => load());
onReachBottom(() => load(false));
onHide(() => { readVersion++; reading.value = false; opening.value = false; invalidate(); });

async function onClaim(req: Api.PurchaseRequest.PurchaseRequest) {
  if (!page.visible.value || reading.value || loading.value || loadFailed.value || receiptFailed.value || claiming.value || !canClaim.value || req.status !== 'pushing'
    || receipts.value.has(String(req.id)) || String(req.customerId) === userStore.realUserId || !list.value.some(item => String(item.id) === String(req.id))) return;
  const operation = page.capture();
  claiming.value = true;
  try {
    const receipt = await claimPurchase(req, operation.isCurrent);
    if (!operation.sameSession()) return;
    lastClaim.value = receipt;
    receipts.value.set(String(req.id), receipt);
    if (operation.isCurrent()) uni.showToast({ title: '接单成功', icon: 'success' });
  } catch (error) {
    if (!operation.sameSession()) return;
    refreshReceipts();
    if (operation.isCurrent()) uni.showToast({ title: receipts.value.get(String(req.id))?.state === 'unknown' ? '接单结果尚未确认，请刷新核对，不要重复接单' : error instanceof Error ? error.message : '接单失败', icon: 'none' });
  } finally {
    if (operation.sameSession()) {
      claiming.value = false;
      if (page.visible.value) await load();
    }
  }
}

async function openProtected(url: string) {
  if (!page.visible.value || opening.value || claiming.value) return;
  const operation = page.capture();
  opening.value = true;
  try { if (await requireLogin(url) && operation.isCurrent()) await uni.navigateTo({ url }); }
  catch (error) { if (operation.isCurrent()) uni.showToast({ title: error instanceof Error ? error.message : '页面打开失败，请重试', icon: 'none' }); }
  finally { if (operation.isCurrent()) opening.value = false; }
}

const goMy = () => openProtected('/pages/purchase/my-list');
const goCreate = () => openProtected('/pages/purchase/create');
const loginToHall = async () => { if (await requireLogin('/pages/purchase/hall')) await load(); };
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
          <wd-button plain size="small" :disabled="opening || claiming" @click="goMy">我的求购</wd-button>
          <wd-button type="primary" size="small" :disabled="opening || claiming" @click="goCreate"><wd-icon name="add" size="15px" /> 发起</wd-button>
        </view>
      </view>
    </view>

    <view v-if="canClaim" class="tip">
      <wd-icon name="shield" size="16px" />
      <text>您是认证买手，下方为推送给您的求购任务</text>
    </view>

    <view class="list">
      <view v-if="displayedRequests.length">
        <PurchaseRequestCard
          v-for="r in displayedRequests"
          :key="r.id"
          :request="r"
          mode="hall"
          :can-claim="canClaim && !claiming && !reading && !loadFailed && !receiptFailed && !receipts.has(String(r.id)) && String(r.customerId) !== userStore.realUserId"
          @claim="onClaim"
        />
      </view>
      <EmptyState
        v-else-if="loadFailed"
        title="求购大厅加载失败"
        description="请稍后重试"
      />
      <view v-else-if="loading" class="hall-loading"><wd-loading size="44rpx" /><text>正在加载求购任务</text></view>
      <EmptyState v-else-if="!userStore.currentUser" title="请先登录查看求购任务" action-text="登录" @action="loginToHall" />
      <EmptyState
        v-else-if="!loading"
        title="暂无求购任务"
        description="发起求购让全球买手为您代购"
        action-text="发起求购"
        @action="goCreate"
      />
      <wd-button v-if="userStore.currentUser && (hasMore || loadFailed)" block plain :loading="reading" :disabled="claiming" @click="load(loadFailed ? retryReset : false)">{{ loadFailed ? '加载失败，点击重试' : '加载更多' }}</wd-button>
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

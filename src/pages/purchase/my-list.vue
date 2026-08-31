<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onHide, onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import { usePagedList } from '@/utils/paged-list';
import { usePageOperation } from '@/utils/page-operation';
import { getAccessToken } from '@/service/request/token';
import { go, useNavigationGuards } from '@/utils/navigate';
import PurchaseRequestCard from '@/components/purchase/purchase-request-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { fetchMyPurchases } from '@/service/api/purchase';
import { cancelPurchaseWithReceipt, readPurchaseCancelReceipts, reconcilePurchaseCancel, purchaseCancelMessage, type PurchaseCancelReceipt } from '@/utils/purchase-cancel';
import { UI_ASSETS } from '@/constants/ui-assets';

const userStore = useUserStore();
const { requireLogin } = useNavigationGuards();
const activeKey = ref('all');
const operating = ref(false);
const reading = ref(false);
const initFailed = ref(false);
const receiptFailed = ref(false);
const receipts = ref<PurchaseCancelReceipt[]>([]);
const scanPaused = ref(false);
let readVersion = 0;
let filterVersion = 0;
let retryReset = true;
const page = usePageOperation(() => {
  readVersion++; filterVersion++;
  operating.value = false; reading.value = false; initFailed.value = false;
  receiptFailed.value = false; receipts.value = []; scanPaused.value = false;
});

const TABS: { key: string; label: string; statuses?: Api.PurchaseRequest.RequestStatus[] }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待审核', statuses: ['pending_audit'] },
  { key: 'pushing', label: '推送中', statuses: ['pushing'] },
  { key: 'claimed', label: '已接单', statuses: ['claimed'] },
  { key: 'rejected', label: '已驳回', statuses: ['rejected'] },
  { key: 'cancelled', label: '已取消', statuses: ['cancelled'] }
];

const pager = usePagedList<Api.PurchaseRequest.PurchaseRequest>({
  key: item => item.id,
  preserveOnReset: true,
  fetch: (pageNo, pageSize) => fetchMyPurchases(userStore.realUserId!, undefined, { current: pageNo, size: pageSize })
});
const allLoaded = pager.list;
const hasMore = pager.hasMore;
const loading = computed(() => reading.value || pager.loading.value);
const loadFailed = computed(() => initFailed.value || pager.loadFailed.value);
const list = computed(() => {
  const statuses = TABS.find(tab => tab.key === activeKey.value)?.statuses;
  return statuses ? allLoaded.value.filter(item => statuses.includes(item.status)) : allLoaded.value;
});
function refreshReceipts() {
  if (!userStore.realUserId) return;
  try {
    const next = new Map(readPurchaseCancelReceipts(userStore.realUserId).map(item => [String(item.demandId), item]));
    for (const receipt of receipts.value) {
      const saved = next.get(String(receipt.demandId));
      if (receipt.state !== 'unknown' && (!saved || (saved.attempt === receipt.attempt
        && (saved.state === 'unknown' || receipt.state === 'verified')))) next.set(String(receipt.demandId), receipt);
    }
    receipts.value = [...next.values()]; receiptFailed.value = false;
  } catch { receiptFailed.value = true; }
}
function receiptFor(request: Api.PurchaseRequest.PurchaseRequest) { return receipts.value.find(item => String(item.demandId) === String(request.id)); }
function retainReceipt(receipt: PurchaseCancelReceipt) {
  const previous = receipts.value.find(item => String(item.demandId) === String(receipt.demandId));
  if (previous?.attempt === receipt.attempt && (previous.state === 'verified' || (previous.state === 'confirmed' && receipt.state === 'unknown'))) return;
  receipts.value = [...receipts.value.filter(item => String(item.demandId) !== String(receipt.demandId)), receipt];
}
async function loadFiltered(reset = true) {
  if (!page.visible.value || reading.value || operating.value) return;
  const operation = page.capture(), version = ++readVersion;
  const current = () => operation.isCurrent() && version === readVersion;
  reading.value = true; initFailed.value = false; scanPaused.value = false; retryReset = reset;
  try {
    await userStore.init();
    if (!current()) return;
    if (!userStore.currentUser || !userStore.realUserId) {
      if (getAccessToken()) throw new Error('账户资料加载失败，请重试');
      pager.clear(); return;
    }
    refreshReceipts();
    // 契约没有 status 条件；每轮至多 5 页，可继续扫描，不把未扫完误报为真实空态。
    let nextReset = reset;
    for (let scanned = 0; scanned < 5; scanned++) {
      retryReset = nextReset;
      if (!current() || !await pager.load(nextReset) || !current()) return;
      nextReset = false;
      if (activeKey.value === 'all' || list.value.length || !hasMore.value) break;
    }
    scanPaused.value = activeKey.value !== 'all' && !list.value.length && hasMore.value;
  } catch (error) {
    if (current()) {
      initFailed.value = true;
      uni.showToast({ title: error instanceof Error ? error.message : '求购列表加载失败', icon: 'none' });
    }
  } finally {
    if (current()) { reading.value = false; uni.stopPullDownRefresh(); }
  }
}
function retry() { return loadFiltered(loadFailed.value ? retryReset : true); }
async function login() {
  const operation = page.capture();
  if (await requireLogin('/pages/purchase/my-list') && operation.isCurrent()) await loadFiltered();
}
function canCancel(request: Api.PurchaseRequest.PurchaseRequest) {
  return page.visible.value && !!userStore.realUserId && !loading.value && !loadFailed.value && !operating.value && !receiptFailed.value
    && list.value.includes(request) && String(request.customerId) === userStore.realUserId
    && ['pending_audit', 'pushing'].includes(request.status) && !receiptFor(request);
}
async function onCancel(request: Api.PurchaseRequest.PurchaseRequest) {
  if (!canCancel(request)) return;
  const operation = page.capture(), filter = filterVersion;
  const current = () => operation.isCurrent() && filter === filterVersion;
  operating.value = true;
  try {
    const receipt = await cancelPurchaseWithReceipt(request, current);
    if (receipt && operation.sameSession()) retainReceipt(receipt);
    if (receipt && current()) {
      const checked = await reconcilePurchaseCancel(userStore.realUserId!, request.id, current);
      if (operation.sameSession() && checked) retainReceipt(checked);
      if (current()) uni.showToast({ title: purchaseCancelMessage(receiptFor(request) || receipt), icon: 'none' });
    }
  } catch (error) {
    if (operation.sameSession()) refreshReceipts();
    if (current()) uni.showToast({ title: receiptFor(request) ? purchaseCancelMessage(receiptFor(request)!) : error instanceof Error ? error.message : '撤销失败', icon: 'none' });
  } finally {
    if (operation.sameSession()) { operating.value = false; if (page.visible.value) await loadFiltered(); }
  }
}
function changeFilter() {
  filterVersion++; readVersion++; reading.value = false; initFailed.value = false; scanPaused.value = false; retryReset = true;
  pager.clear(); loadFiltered();
}
onShow(() => loadFiltered());
onHide(() => { readVersion++; reading.value = false; pager.invalidate(); });
onPullDownRefresh(() => { if (!operating.value) return loadFiltered(); uni.stopPullDownRefresh(); });
onReachBottom(() => { if (!scanPaused.value) return loadFailed.value ? retry() : loadFiltered(false); });
watch(activeKey, changeFilter, { flush: 'sync' });
</script>

<template>
  <view class="my-purchase-page yb-page yb-page--full-bleed">
    <view class="hero" :style="{ backgroundImage: `url(${UI_ASSETS.backgrounds.purchase})` }">
      <text class="hero-eyebrow">MY PURCHASE REQUESTS</text>
      <text class="hero-title">我的求购</text>
      <text class="hero-sub">跟踪状态 · 接单进度 · 关联订单</text>
    </view>
    <view class="yb-sticky-tabs-frame">
      <wd-tabs v-model="activeKey">
        <wd-tab v-for="t in TABS" :key="t.key" :name="t.key" :title="t.label" />
      </wd-tabs>
    </view>
    <view class="list">
      <view v-if="loading && !list.length" class="loading"><wd-loading size="44rpx" /><text>正在加载求购</text></view>
      <view v-else-if="list.length">
        <view v-for="r in list" :key="r.id">
          <PurchaseRequestCard :request="r" mode="mine" :cancel-disabled="!canCancel(r)" :navigation-disabled="operating || loading" @cancel="onCancel" />
        </view>
      </view>
      <EmptyState v-else-if="loadFailed" title="求购列表加载失败" description="请稍后重试" />
      <EmptyState v-else-if="!userStore.currentUser" title="请先登录查看求购" description="尚未读取账号求购" action-text="登录或重试" @action="login" />
      <EmptyState v-else-if="scanPaused" title="已读取的记录中暂无匹配项" :description="`已读取 ${allLoaded.length} 条记录，尚未完成全部筛选，请继续加载。`" />
      <EmptyState
        v-else
        title="暂无求购"
        description="发起求购让全球买手为您代购"
        action-text="发起求购"
        @action="go('/pages/purchase/create')"
      />
      <text v-if="loadFailed && list.length">刷新失败，当前显示上次数据，撤销操作已暂停。</text>
      <wd-button v-if="loadFailed" block plain :loading="loading" :disabled="operating" @click="retry">加载失败，点击重试</wd-button>
      <wd-button v-else-if="userStore.currentUser && hasMore" block plain :loading="loading" :disabled="operating" @click="loadFiltered(false)">{{ scanPaused ? '继续筛选剩余记录' : '加载更多' }}</wd-button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.my-purchase-page { min-height:100%; }
.hero {
  background-color: #10131f;
  background-size: cover;
  background-position:center;
  color:#fff;
  padding: 44rpx 28rpx 32rpx;
}
.hero-eyebrow {
  display: block;
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 3rpx;
  color: rgba(255,255,255,.64);
  margin-bottom: 12rpx;
}
.hero-title {
  display: block;
  font-size: 44rpx;
  font-weight: 700;
  color: #fff;
  letter-spacing: -1rpx;
}
.hero-sub {
  display: block;
  font-size: 24rpx;
  color: rgba(255,255,255,.76);
  margin-top: 8rpx;
}
.list { padding:24rpx; }
.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }
</style>

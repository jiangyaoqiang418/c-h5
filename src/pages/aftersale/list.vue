<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onHide, onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import { usePagedList } from '@/utils/paged-list';
import { usePageOperation } from '@/utils/page-operation';
import { getAccessToken } from '@/service/request/token';
import { fetchBoughtRefunds, fetchSoldRefunds } from '@/service/api/order';
import { cancelRefundWithReceipt, readRefundCancelReceipts, reconcileRefundCancels, refundCancelMessage, type RefundCancelReceipt } from '@/utils/refund-cancel';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { go, useNavigationGuards } from '@/utils/navigate';
import { formatUsdt } from '@shared/utils/currency';
import { UI_ASSETS } from '@/constants/ui-assets';

const userStore = useUserStore();
const { requireLogin } = useNavigationGuards();
const activeKey = ref('all');
const operating = ref(false);
const reading = ref(false);
const initFailed = ref(false);
const receiptFailed = ref(false);
const receipts = ref(new Map<string, RefundCancelReceipt>());
let readVersion = 0;
let filterVersion = 0;
let retryReset = true;
const page = usePageOperation(() => {
  readVersion++; filterVersion++;
  operating.value = false; reading.value = false; initFailed.value = false;
  receiptFailed.value = false; receipts.value = new Map();
});
const TABS: { key: string; label: string; status?: Api.RealOrder.RefundStatus }[] = [
  { key: 'all', label: '全部' },
  { key: 'applying', label: '待审核', status: 'APPLYING' },
  { key: 'agreed', label: '已同意', status: 'AGREED' },
  { key: 'rejected', label: '已驳回', status: 'REJECTED' },
  { key: 'canceled', label: '已撤销', status: 'CANCELED' }
];
const statusLabel: Record<Api.RealOrder.RefundStatus, string> = {
  APPLYING: '待审核', AGREED: '已同意', REJECTED: '已驳回', CANCELED: '已撤销'
};
const emptyDescription = computed(() => userStore.isBuyerActive ? '顾客发起的仅退款会显示在这里' : '可在待发货或待收货订单中申请仅退款');
const pager = usePagedList<Api.RealOrder.OrderRefundDTO>({
  key: item => item.refundId,
  preserveOnReset: true,
  fetch: (pageNo, pageSize) => {
    const tab = TABS.find(item => item.key === activeKey.value);
    const query = { pageNo, pageSize, status: tab?.status };
    return userStore.isBuyerActive ? fetchSoldRefunds(query) : fetchBoughtRefunds(query);
  }
});
const list = pager.list;
const hasMore = pager.hasMore;
const loading = computed(() => reading.value || pager.loading.value);
const loadFailed = computed(() => initFailed.value || pager.loadFailed.value);
function refreshReceipts() {
  if (!userStore.realUserId) return;
  try {
    const next = new Map(readRefundCancelReceipts(userStore.realUserId).map(item => [String(item.refundId), item]));
    for (const [id, prior] of receipts.value) {
      const saved = next.get(id);
      if (prior.state !== 'unknown' && (!saved || saved.state === 'unknown' || (prior.state === 'verified' && saved.state !== 'verified'))) next.set(id, prior);
    }
    receipts.value = next;
    receiptFailed.value = false;
  } catch { receiptFailed.value = true; }
}
async function load(reset = true) {
  if (!page.visible.value || reading.value || operating.value) return;
  const operation = page.capture();
  const version = ++readVersion;
  const current = () => operation.isCurrent() && version === readVersion;
  reading.value = true; initFailed.value = false; retryReset = reset;
  try {
    await userStore.init();
    if (!current()) return;
    if (!userStore.currentUser || !userStore.realUserId) {
      if (getAccessToken()) throw new Error('账户资料读取失败，请重试');
      pager.clear();
      return;
    }
    refreshReceipts();
    await pager.load(reset);
    if (!current() || receiptFailed.value) return;
    await reconcileRefundCancels(userStore.realUserId, current);
    if (current()) refreshReceipts();
  } catch (error) {
    if (!current()) return;
    initFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '退款记录读取失败', icon: 'none' });
  } finally {
    if (current()) { reading.value = false; uni.stopPullDownRefresh(); }
  }
}
function retry() { return load(retryReset); }
function canCancel(item: Api.RealOrder.OrderRefundDTO) {
  return page.visible.value && !!userStore.realUserId && !userStore.isBuyerActive && !operating.value && !loading.value && !loadFailed.value
    && !receiptFailed.value && !receipts.value.has(String(item.refundId)) && item.status === 'APPLYING' && list.value.includes(item)
    && (item.buyerId == null || String(item.buyerId) === userStore.realUserId);
}
function openDetail(item: Api.RealOrder.OrderRefundDTO) {
  if (page.visible.value && userStore.currentUser && !operating.value && list.value.includes(item)) go(`/pages/aftersale/detail?id=${encodeURIComponent(String(item.refundId))}`);
}
async function login() {
  const operation = page.capture();
  if (await requireLogin('/pages/aftersale/list') && operation.isCurrent()) await load();
}
async function cancel(item: Api.RealOrder.OrderRefundDTO) {
  if (!canCancel(item)) return;
  const operation = page.capture();
  const filter = filterVersion;
  const current = () => operation.isCurrent() && filter === filterVersion;
  operating.value = true;
  try {
    const receipt = await cancelRefundWithReceipt(item, current);
    if (receipt && operation.sameSession()) receipts.value.set(String(receipt.refundId), receipt);
    if (receipt && current()) uni.showToast({ title: '申请已撤销', icon: 'success' });
  } catch (error) {
    if (!operation.sameSession()) return;
    refreshReceipts();
    const receipt = receipts.value.get(String(item.refundId));
    if (current()) uni.showToast({ title: receipt ? refundCancelMessage(receipt) : error instanceof Error ? error.message : '撤销失败', icon: 'none' });
  } finally {
    if (operation.sameSession()) {
      operating.value = false;
      if (page.visible.value) await load();
    }
  }
}
function changeFilter() {
  filterVersion++; readVersion++;
  reading.value = false; initFailed.value = false; retryReset = true;
  pager.clear();
  load();
}
onShow(() => load());
onPullDownRefresh(() => load());
onReachBottom(() => loadFailed.value ? retry() : load(false));
onHide(() => { readVersion++; reading.value = false; pager.invalidate(); });
watch([activeKey, () => userStore.currentAudience], changeFilter, { flush: 'sync' });
</script>

<template>
  <view class="as-list-page yb-page yb-page--full-bleed">
    <view class="yb-sticky-tabs-frame">
      <wd-tabs v-model="activeKey">
        <wd-tab v-for="tab in TABS" :key="tab.key" :name="tab.key" :title="tab.label" />
      </wd-tabs>
    </view>
    <view class="list">
      <view v-if="loading && !list.length" class="loading"><wd-loading size="44rpx" /><text>正在加载仅退款记录</text></view>
      <view v-else-if="list.length">
        <view v-for="item in list" :key="item.refundId" class="refund-card" @click="openDetail(item)">
          <view class="head">
            <text class="code">订单 {{ item.orderNo || item.orderId }}</text>
            <text class="status yb-status-pill" :class="`status-${item.status.toLowerCase()}`">{{ item.statusText || statusLabel[item.status] }}</text>
          </view>
          <view class="body">
            <image :src="item.productImage || UI_ASSETS.placeholders.product" mode="aspectFill" class="cover" />
            <view class="info">
              <text class="title">{{ item.productTitle || '商品信息待补充' }}</text>
              <text class="reason">退款原因：{{ item.reason || '未填写' }}</text>
              <text class="counterpart">{{ userStore.isBuyerActive ? '顾客' : '买手' }}：{{ userStore.isBuyerActive ? (item.buyerName || '—') : (item.sellerName || '—') }}</text>
            </view>
            <text class="amount">{{ item.amount == null ? '—' : formatUsdt(item.amount) }}</text>
          </view>
          <view v-if="!userStore.isBuyerActive && item.status === 'APPLYING'" class="actions" @click.stop>
            <wd-button plain size="small" :disabled="!canCancel(item)" @click="cancel(item)">撤销申请</wd-button>
          </view>
        </view>
      </view>
      <EmptyState v-else-if="loadFailed" title="仅退款记录加载失败" description="请稍后重试" />
      <EmptyState v-else-if="!userStore.currentUser" title="请先登录查看退款记录" action-text="登录" @action="login" />
      <EmptyState v-else title="暂无仅退款记录" :description="emptyDescription" />
      <wd-button v-if="loadFailed" block plain :loading="loading" :disabled="operating" @click="retry">读取失败，点击重试{{ list.length ? '（当前为上次记录）' : '' }}</wd-button>
      <wd-button v-else-if="userStore.currentUser && hasMore" block plain :loading="loading" :disabled="operating" @click="load(false)">加载更多</wd-button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.as-list-page { min-height: 100%; }
.list { padding: 24rpx; }
.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }
.refund-card { margin-bottom: 20rpx; padding: 24rpx; border-radius: var(--yb-radius-lg); background: var(--yb-surface); border:1rpx solid var(--yb-border); box-shadow:var(--yb-shadow-card); }
.head, .body, .actions { display: flex; }
.head { justify-content: space-between; align-items: center; padding-bottom: 16rpx; border-bottom: 1rpx dashed #f2f3f5; }
.code { min-width: 0; overflow: hidden; color: #4e5969; font-family: ui-monospace, monospace; font-size: 22rpx; text-overflow: ellipsis; white-space: nowrap; }
.status { flex-shrink: 0; margin-left: 16rpx; background: var(--yb-warning-soft); color: #a76f22; }
.status-agreed { background: var(--yb-success-soft); color: var(--yb-success); }
.status-rejected, .status-canceled { background: #f2f3f5; color: var(--yb-muted); }
.body { gap: 16rpx; padding-top: 16rpx; }
.cover { width: 128rpx; height: 128rpx; flex-shrink: 0; border-radius: var(--yb-radius-md); }
.info { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 6rpx; }
.title { display:-webkit-box; overflow:hidden; -webkit-box-orient:vertical; -webkit-line-clamp:2; font-size:26rpx; line-height:1.45; font-weight:500; color:#1d2129; }.reason, .counterpart { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:22rpx; color:#86909c; }
.amount { flex-shrink: 0; color: #0f111a; font-family: ui-monospace, monospace; font-size: 28rpx; font-weight: 700; }
.actions { justify-content: flex-end; margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx dashed #f2f3f5; }
</style>

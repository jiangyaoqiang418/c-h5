<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onHide, onLoad, onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import { usePagedList } from '@/utils/paged-list';
import { usePageOperation } from '@/utils/page-operation';
import { getAccessToken } from '@/service/request/token';
import { RequestError } from '@/service/request';
import { createReviewAppeal, deleteReview, fetchMyReviews, fetchReceivedReviews, fetchReviewableOrders, fetchReviewDetail, replyReview } from '@/service/api/review';
import { go, useNavigationGuards } from '@/utils/navigate';
import ReviewCard from '@/components/review/review-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { UI_ASSETS } from '@/constants/ui-assets';
import { readReviewCreateReceipts, reviewCreateMessage, type ReviewCreateReceipt } from '@/utils/review-create';

const userStore = useUserStore();
const { requireLogin } = useNavigationGuards();
const activeKey = ref<'reviewable' | 'sent' | 'received'>('reviewable');
const operating = ref(false);
const reading = ref(false);
const initFailed = ref(false);
const receiptFailed = ref(false);
const createReceiptFailed = ref(false);
const createReceipts = ref<ReviewCreateReceipt[]>([]);
type Action = 'delete' | 'reply' | 'appeal';
interface Receipt { reviewId: Api.RealReview.Id; orderId: Api.RealReview.Id; action: Action; attempt: string; state: 'unknown' | 'confirmed' | 'verified'; receiptId?: Api.RealReview.Id; previousAppealId?: Api.RealReview.Id; }
const receipts = ref<Receipt[]>([]);
const drafts = ref(new Map<string, string>());
const receiptKey = (item: Pick<Receipt, 'reviewId' | 'action'>) => `${item.reviewId}:${item.action}`;
const storageKey = (userId: string) => `bw_h5_review_operations_v1:${encodeURIComponent(userId)}`;
const validId = (id: unknown) => typeof id === 'string' ? !!id.trim() : typeof id === 'number' && Number.isSafeInteger(id);
let readVersion = 0;
let filterVersion = 0;
let retryReset = true;
const page = usePageOperation(() => {
  readVersion++; filterVersion++;
  operating.value = false; reading.value = false; initFailed.value = false;
  receipts.value = []; receiptFailed.value = false; drafts.value = new Map();
  createReceipts.value = []; createReceiptFailed.value = false;
});
const pager = usePagedList<Api.RealReview.ReviewDTO | Api.RealReview.ReviewableOrderVO>({
  key: item => 'reviewId' in item ? item.reviewId : item.orderId,
  preserveOnReset: true,
  fetch: (pageNo, pageSize) => {
    const query = { pageNo, pageSize };
    if (activeKey.value === 'reviewable') return fetchReviewableOrders(query);
    return activeKey.value === 'sent' ? fetchMyReviews(query) : fetchReceivedReviews(query);
  }
});
const records = pager.list;
const hasMore = pager.hasMore;
const loading = computed(() => reading.value || pager.loading.value);
const loadFailed = computed(() => initFailed.value || pager.loadFailed.value);
const list = computed(() => records.value.filter((item): item is Api.RealReview.ReviewDTO => 'reviewId' in item
  && !receipts.value.some(receipt => receipt.action === 'delete' && receipt.state !== 'unknown' && String(receipt.reviewId) === String(item.reviewId))));
const reviewable = computed(() => records.value.filter((item): item is Api.RealReview.ReviewableOrderVO => !('reviewId' in item)));
const pendingReceipts = computed(() => receipts.value.filter(item => item.state !== 'verified'));
function showError(error: unknown, fallback: string) {
  uni.showToast({ title: error instanceof Error ? error.message : fallback, icon: 'none' });
}
function readReceipts(userId: string): Receipt[] {
  const stored = uni.getStorageSync(storageKey(userId));
  if (stored == null || stored === '') return [];
  if (!Array.isArray(stored) || stored.some(item => !item || !validId(item.reviewId) || !validId(item.orderId)
    || !['delete', 'reply', 'appeal'].includes(item.action) || !['unknown', 'confirmed', 'verified'].includes(item.state)
    || typeof item.attempt !== 'string' || !item.attempt || (item.receiptId != null && !validId(item.receiptId))
    || (item.previousAppealId != null && !validId(item.previousAppealId)) || (item.state !== 'unknown' && (!validId(item.receiptId)
      || (item.action !== 'appeal' && String(item.receiptId) !== String(item.reviewId)))))
    || new Set(stored.map(receiptKey)).size !== stored.length) throw new Error('本机评价回执读取失败，请先核对记录');
  return stored;
}
function refreshReceipts() {
  if (!userStore.realUserId) return;
  try {
    const saved = readReceipts(userStore.realUserId);
    const next = new Map(saved.map(item => [receiptKey(item), item]));
    for (const receipt of receipts.value) {
      const stored = next.get(receiptKey(receipt));
      if (receipt.state !== 'unknown' && (!stored || (stored.attempt === receipt.attempt
        && (stored.state === 'unknown' || receipt.state === 'verified')))) next.set(receiptKey(receipt), receipt);
    }
    receipts.value = [...next.values()]; receiptFailed.value = false;
  } catch { receiptFailed.value = true; }
}
function refreshCreateReceipts() {
  try {
    createReceipts.value = userStore.realUserId ? readReviewCreateReceipts(userStore.realUserId).filter(r => r.state !== 'verified') : [];
    createReceiptFailed.value = false;
  } catch { createReceiptFailed.value = true; }
}
function openReviewRecovery(receipt: ReviewCreateReceipt) {
  if (!page.visible.value || !userStore.realUserId || operating.value || loading.value || createReceiptFailed.value) return;
  refreshCreateReceipts();
  if (!createReceiptFailed.value && createReceipts.value.some(r => r.attempt === receipt.attempt
    && String(r.request.orderId) === String(receipt.request.orderId))) go(`/pages/review/write?orderId=${encodeURIComponent(String(receipt.request.orderId))}`);
}
function saveReceipt(userId: string, receipt: Receipt, replaceAttempt?: string, remove = false) {
  const all = readReceipts(userId);
  const prior = all.find(item => receiptKey(item) === receiptKey(receipt));
  if (prior && prior.attempt !== receipt.attempt && prior.attempt !== replaceAttempt) throw new Error('评价操作记录已变化，请刷新核对');
  if (prior?.attempt === receipt.attempt && (prior.state === 'verified' || (prior.state === 'confirmed' && (remove || receipt.state === 'unknown')))) return;
  const next = all.filter(item => receiptKey(item) !== receiptKey(receipt));
  if (!remove) next.push(receipt);
  uni.setStorageSync(storageKey(userId), next);
  const saved = readReceipts(userId).find(item => receiptKey(item) === receiptKey(receipt));
  if (remove ? !!saved : saved?.attempt !== receipt.attempt || saved?.state !== receipt.state
    || String(saved?.receiptId) !== String(receipt.receiptId)) throw new Error('评价进度保存失败，请检查本机存储');
}
function eligible(review: Api.RealReview.ReviewDTO, action: Action, userId = userStore.realUserId) {
  if (!userId || !validId(review.reviewId) || !validId(review.orderId) || !['PENDING', 'PUBLISHED', 'REJECTED', 'HIDDEN'].includes(review.status)) return false;
  if (action === 'delete') return String(review.userId) === userId && review.status !== 'HIDDEN';
  if (String(review.sellerId) !== userId || review.status !== 'PUBLISHED') return false;
  return action === 'reply' ? !review.replyContent : !review.appealId || ['APPROVED', 'REJECTED'].includes(review.appealStatus || '');
}
function receiptBlocks(review: Api.RealReview.ReviewDTO, action: Action) {
  const receipt = receipts.value.find(item => item.action === action && String(item.reviewId) === String(review.reviewId));
  if (!receipt) return false;
  return !(action === 'appeal' && receipt.state === 'verified' && String(review.appealId) === String(receipt.receiptId)
    && ['APPROVED', 'REJECTED'].includes(review.appealStatus || ''));
}
function canAct(review: Api.RealReview.ReviewDTO, action: Action) {
  return page.visible.value && !operating.value && !loading.value && !loadFailed.value && !receiptFailed.value
    && list.value.includes(review) && activeKey.value === (action === 'delete' ? 'sent' : 'received')
    && eligible(review, action) && !receiptBlocks(review, action);
}
function receiptMessage(receipt: Receipt) {
  const label = { delete: '删除', reply: '回复', appeal: '申诉' }[receipt.action];
  return receipt.state === 'unknown' ? `${label}结果尚未确认，请核对，不要重复提交`
    : receipt.state === 'confirmed' ? `${label}已提交，最新状态待同步` : `${label}记录已核对`;
}
async function reconcile(receipt: Receipt, current: () => boolean) {
  const userId = userStore.realUserId;
  if (!userId || !current() || receipt.state === 'verified') return;
  try {
    const review = await fetchReviewDetail(receipt.reviewId);
    if (!current() || userId !== userStore.realUserId || String(review.reviewId) !== String(receipt.reviewId)
      || String(review.orderId) !== String(receipt.orderId) || String(receipt.action === 'delete' ? review.userId : review.sellerId) !== userId) return;
    let receiptId = receipt.receiptId;
    if (receipt.action === 'reply' && review.replyContent) receiptId = review.reviewId;
    else if (receipt.action === 'appeal' && validId(review.appealId) && ['PENDING', 'APPROVED', 'REJECTED'].includes(review.appealStatus || '')
      && (receipt.state === 'confirmed' ? String(review.appealId) === String(receipt.receiptId)
        : String(review.appealId) !== String(receipt.previousAppealId))) receiptId = review.appealId;
    else return; // 删除后的 404 或列表缺席不能证明未知删除成功。
    const verified: Receipt = { ...receipt, state: 'verified', receiptId };
    try { saveReceipt(userId, verified); } catch { /* 保留已有持久防重记录及当前回读证据。 */ }
    const prior = receipts.value.find(item => receiptKey(item) === receiptKey(receipt));
    if (prior?.attempt === receipt.attempt) receipts.value = receipts.value.map(item => receiptKey(item) === receiptKey(receipt) ? verified : item);
  } catch { /* 读取失败不影响提交回执，也不解锁未知结果。 */ }
}
async function load(reset = true) {
  if (!page.visible.value || reading.value || operating.value) return;
  const operation = page.capture(), version = ++readVersion;
  const current = () => operation.isCurrent() && version === readVersion;
  reading.value = true; initFailed.value = false; retryReset = reset;
  try {
    await userStore.init();
    if (!current()) return;
    if (!userStore.currentUser || !userStore.realUserId) {
      if (getAccessToken()) throw new Error('账户资料加载失败，请重试');
      pager.clear(); return;
    }
    refreshReceipts();
    refreshCreateReceipts();
    if (!await pager.load(reset) || !current() || receiptFailed.value) return;
    for (const receipt of pendingReceipts.value) {
      if (!current()) return;
      if (records.value.some(item => 'reviewId' in item && String(item.reviewId) === String(receipt.reviewId))) await reconcile(receipt, current);
    }
  } catch (error) {
    if (current()) { initFailed.value = true; showError(error, '评价读取失败'); }
  } finally {
    if (current()) { reading.value = false; uni.stopPullDownRefresh(); }
  }
}
function retry() { return load(loadFailed.value ? retryReset : true); }
async function login() {
  const operation = page.capture();
  if (await requireLogin('/pages/review/list') && operation.isCurrent()) await load();
}
async function checkReceipt(receipt: Receipt) {
  if (!page.visible.value || operating.value || loading.value || receiptFailed.value
    || !receipts.value.some(item => receiptKey(item) === receiptKey(receipt) && item.attempt === receipt.attempt)) return;
  const operation = page.capture(), filter = filterVersion;
  operating.value = true;
  try {
    await reconcile(receipt, () => operation.isCurrent() && filter === filterVersion);
  } finally {
    if (operation.sameSession()) { operating.value = false; if (page.visible.value) await load(); }
  }
}
async function act(review: Api.RealReview.ReviewDTO, action: Action) {
  if (!canAct(review, action)) return;
  const operation = page.capture(), filter = filterVersion;
  const current = () => operation.isCurrent() && filter === filterVersion;
  const userId = userStore.realUserId!;
  const key = receiptKey({ reviewId: review.reviewId, action });
  const prior = receipts.value.find(item => receiptKey(item) === key);
  operating.value = true;
  let marker: Receipt | undefined, sent = false;
  try {
    const result = await uni.showModal(action === 'delete'
      ? { title: '删除评价？', content: '删除后将不再对外展示，且不能重新评价该订单。' }
      : { title: action === 'reply' ? '回复评价' : '发起申诉', editable: true, content: drafts.value.get(key) || '', placeholderText: action === 'reply' ? '请输入回复内容' : '请输入申诉理由' });
    if (operation.sameSession() && action !== 'delete' && typeof result.content === 'string') drafts.value.set(key, result.content);
    if (!result.confirm || !current()) return;
    const content = (result.content || '').trim();
    if (action !== 'delete' && (!content || content.length > (action === 'reply' ? 500 : 512))) throw new Error(action === 'reply' ? '回复内容需为 1–500 字' : '申诉理由需为 1–512 字');
    const latest = await fetchReviewDetail(review.reviewId);
    if (!current()) return;
    if (String(latest.reviewId) !== String(review.reviewId) || String(latest.orderId) !== String(review.orderId)
      || !eligible(latest, action, userId) || receiptBlocks(latest, action)
      || (action === 'appeal' && String(latest.appealId) !== String(review.appealId))) throw new Error('评价归属或状态已变化，请刷新后操作');
    marker = { reviewId: review.reviewId, orderId: review.orderId, action, attempt: `${Date.now()}-${Math.random().toString(36).slice(2)}`, state: 'unknown', previousAppealId: latest.appealId };
    saveReceipt(userId, marker, prior?.attempt);
    receipts.value = [...receipts.value.filter(item => receiptKey(item) !== key), marker];
    sent = true;
    const receiptId = action === 'delete' ? await deleteReview(review.reviewId) : action === 'reply'
      ? await replyReview({ reviewId: review.reviewId, content }) : await createReviewAppeal({ reviewId: review.reviewId, reason: content });
    if (!validId(receiptId) || (action !== 'appeal' && String(receiptId) !== String(review.reviewId))
      || (action === 'appeal' && String(receiptId) === String(marker.previousAppealId))) throw new Error('提交回执缺失或不匹配，请核对记录');
    const confirmed: Receipt = { ...marker, receiptId, state: action === 'delete' ? 'verified' : 'confirmed' };
    try { saveReceipt(userId, confirmed); } catch { /* 提交成功不能被存储失败覆盖；原未知记录继续防重。 */ }
    if (!operation.sameSession()) return;
    receipts.value = [...receipts.value.filter(item => receiptKey(item) !== key), confirmed];
    refreshReceipts();
    drafts.value.delete(key);
    if (current()) uni.showToast({ title: action === 'delete' ? '已删除' : action === 'reply' ? '回复已提交' : '申诉已提交', icon: 'success' });
  } catch (error) {
    if (sent && marker && error instanceof RequestError && (error.kind === 'business' || error.kind === 'config')) {
      try { saveReceipt(userId, marker, undefined, true); } catch { /* 保守保留未知标记。 */ }
    }
    if (operation.sameSession()) refreshReceipts();
    if (current()) showError(sent && receipts.value.some(item => receiptKey(item) === key)
      ? new Error('操作结果尚未确认，请核对记录，不要重复提交') : error, '评价操作失败');
  } finally {
    if (operation.sameSession()) { operating.value = false; if (page.visible.value) await load(); }
  }
}
const remove = (review: Api.RealReview.ReviewDTO) => act(review, 'delete');
const reply = (review: Api.RealReview.ReviewDTO) => act(review, 'reply');
const appeal = (review: Api.RealReview.ReviewDTO) => act(review, 'appeal');
function openReview(order: Api.RealReview.ReviewableOrderVO) {
  if (page.visible.value && userStore.currentUser && !operating.value && !loading.value && !loadFailed.value && reviewable.value.includes(order)) go(`/pages/review/write?orderId=${encodeURIComponent(String(order.orderId))}`);
}
function changeFilter() {
  filterVersion++; readVersion++; reading.value = false; initFailed.value = false; retryReset = true;
  pager.clear(); load();
}
onShow(() => load());
onLoad(query => { if (query?.tab === 'sent' || query?.tab === 'received') activeKey.value = query.tab; });
onHide(() => { readVersion++; reading.value = false; pager.invalidate(); });
onPullDownRefresh(() => { if (!operating.value) return load(); uni.stopPullDownRefresh(); });
onReachBottom(() => loadFailed.value ? retry() : load(false));
watch(activeKey, changeFilter, { flush: 'sync' });
</script>

<template>
  <view class="review-list yb-page yb-page--full-bleed">
    <view class="yb-sticky-tabs-frame">
      <wd-tabs v-model="activeKey"><wd-tab name="reviewable" title="待评价" /><wd-tab name="sent" title="我发出的" /><wd-tab name="received" title="我收到的" /></wd-tabs>
    </view>
    <view class="list">
      <view v-if="loading && !records.length" class="loading"><wd-loading size="44rpx" color="var(--yb-brand)" /><text>正在加载评价</text></view>
      <template v-else>
        <EmptyState v-if="loadFailed && !records.length" title="评价加载失败" description="请稍后重试" />
        <EmptyState v-else-if="!userStore.currentUser" title="请先登录查看评价" description="尚未读取账号评价" action-text="登录或重试" @action="login" />
        <view v-else-if="activeKey === 'reviewable' && reviewable.length">
          <view v-for="order in reviewable" :key="order.orderId" class="reviewable-card" @click="openReview(order)">
            <image :src="order.productImage || UI_ASSETS.placeholders.product" class="cover" mode="aspectFill" />
            <view class="reviewable-main"><text class="title">{{ order.productTitle || '订单商品' }}</text><text class="order-no">订单 {{ order.orderNo || order.orderId }}</text></view>
            <wd-button size="small" type="primary">去评价</wd-button>
          </view>
        </view>
        <view v-else-if="activeKey !== 'reviewable' && list.length"><ReviewCard v-for="r in list" :key="r.reviewId" :review="r" :received="activeKey === 'received'" :delete-disabled="!canAct(r, 'delete')" :reply-disabled="!canAct(r, 'reply')" :appeal-disabled="!canAct(r, 'appeal')" @delete="remove" @reply="reply" @appeal="appeal" /></view>
        <EmptyState v-else title="暂无评价" />
      </template>
      <text v-if="loadFailed && records.length">刷新失败，当前显示上次数据，写操作已暂停。</text>
      <wd-button v-if="loadFailed" block plain :loading="loading" :disabled="operating" @click="retry">加载失败，点击重试</wd-button>
      <wd-button v-else-if="userStore.currentUser && hasMore" block plain :loading="loading" :disabled="operating" @click="load(false)">加载更多</wd-button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.review-list { min-height:100%; }.list { padding:24rpx; }.loading { display:flex; flex-direction:column; align-items:center; padding:96rpx 0; gap:16rpx; color:#86909c; font-size:24rpx; }
.reviewable-card { display:flex; gap:16rpx; align-items:center; background:#fff; padding:20rpx; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card); margin-bottom:16rpx; }.cover { width:96rpx; height:96rpx; border-radius:var(--yb-radius-md); background:#f2f3f5; }.reviewable-main { flex:1; min-width:0; }.title, .order-no { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.title { color:#1d2129; font-size:27rpx; font-weight:600; }.order-no { color:#86909c; font-size:22rpx; margin-top:8rpx; }
</style>

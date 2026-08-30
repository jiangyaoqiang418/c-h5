<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onHide, onReachBottom, onShow } from '@dcloudio/uni-app';
import { usePagedList } from '@/utils/paged-list';
import { usePageOperation } from '@/utils/page-operation';
import { useNavigationGuards } from '@/utils/navigate';
import { RequestError } from '@/service/request';
import { formatAmount } from '@/utils/format-bridge';
import { fetchBuyerDepositLedger, payBuyerDeposit, refundBuyerDeposit } from '@/service/api/buyer';
import { useUserStore } from '@/stores';
import { UI_ASSETS } from '@/constants/ui-assets';

const userStore = useUserStore();
const { requireLogin } = useNavigationGuards();
const submitting = ref(false);

const payPopup = ref(false);
const refundPopup = ref(false);
const amountInput = ref('');
type PendingDeposit = Api.RealUser.BuyerDepositParams & { action: 'pay' | 'refund'; receiptId?: string | number };
const pending = ref<PendingDeposit>();
const pendingLoadFailed = ref(false);
const retryReset = ref(true);
let popupVersion = 0;
const page = usePageOperation(() => {
  payPopup.value = false;
  refundPopup.value = false;
  amountInput.value = '';
  pending.value = undefined;
  pendingLoadFailed.value = false;
  submitting.value = false;
});
watch([payPopup, refundPopup], () => { popupVersion++; }, { flush: 'sync' });
function pendingKey() {
  if (!userStore.realUserId) throw new Error('请先登录');
  return `bw_h5_deposit_pending_v1:${String(userStore.realUserId)}`;
}
function readPending() {
  pendingLoadFailed.value = false;
  try {
    if (!userStore.realUserId) { pending.value = undefined; return; }
    const saved = uni.getStorageSync(pendingKey());
    if (!saved) { if (pending.value?.receiptId == null) pending.value = undefined; return; }
    if ((saved.action !== 'pay' && saved.action !== 'refund') || typeof saved.amount !== 'number'
      || !Number.isFinite(saved.amount) || saved.amount <= 0 || typeof saved.idempotencyKey !== 'string'
      || !saved.idempotencyKey.trim() || saved.idempotencyKey.length > 36
      || (saved.receiptId != null && (!['string', 'number'].includes(typeof saved.receiptId) || !String(saved.receiptId).trim()
        || (typeof saved.receiptId === 'number' && !Number.isFinite(saved.receiptId))))) {
      throw new Error('本机原请求无法识别，请先核对保证金记录，未创建新请求');
    }
    if (pending.value?.idempotencyKey !== saved.idempotencyKey || pending.value?.receiptId == null) pending.value = { ...saved };
  } catch (error) { pendingLoadFailed.value = true; throw error; }
}

const { list: ledgers, loadFailed, loading, hasMore, total, load, invalidate, pageNo } = usePagedList<Api.RealUser.BuyerDepositLedgerDTO>({
  key: item => item.id,
  preserveOnReset: true,
  fetch: async (pageNo, pageSize) => {
    const operation = page.capture();
    if (!operation.isCurrent() || !userStore.currentUser?.isBuyer) throw new Error('请先登录买手账号');
    const result = await fetchBuyerDepositLedger({ pageNo, pageSize });
    if (!operation.isCurrent()) throw new Error('页面已切换');
    if (result.records.some(item => String(item.userId) !== String(userStore.realUserId))) throw new Error('保证金流水归属不匹配');
    return result;
  }
});
onShow(loadPage);
onHide(() => { invalidate(); payPopup.value = false; refundPopup.value = false; });
onReachBottom(() => refreshRecords(false));

const currentBalance = computed(() => {
  const amount = ledgers.value[0]?.balanceAfter;
  if (!userStore.currentUser || !pageNo.value || loading.value || loadFailed.value || pending.value?.receiptId != null
    || amount == null || String(amount).trim() === '' || !Number.isFinite(Number(amount))) return undefined;
  return amount;
});

function sameRequest(value: PendingDeposit | undefined, request: PendingDeposit) {
  return value?.idempotencyKey === request.idempotencyKey && value.action === request.action && value.amount === request.amount;
}

async function refreshRecords(reset = true) {
  if (!page.visible.value || !userStore.currentUser?.isBuyer || submitting.value || loading.value) return;
  const operation = page.capture();
  retryReset.value = reset;
  const success = await load(reset);
  if (!success || !operation.isCurrent() || pendingLoadFailed.value) return;
  const request = pending.value;
  if (request?.receiptId == null || !ledgers.value.some(item => String(item.id) === String(request.receiptId)
    && item.bizType === (request.action === 'pay' ? 'PAY' : 'REFUND'))) return;
  try {
    const key = pendingKey();
    const stored = uni.getStorageSync(key);
    if (stored && !sameRequest(stored, request)) { readPending(); return; }
    if (stored) uni.removeStorageSync(key);
    pending.value = undefined;
  } catch { uni.showToast({ title: '流水已核对，本机回执清理失败，请重试刷新', icon: 'none' }); }
}

async function loadPage() {
  if (!page.visible.value || submitting.value) return;
  const operation = page.capture();
  try {
    if (!await requireLogin('/pages/buyer/deposit') || !operation.isCurrent()) return;
    try { readPending(); }
    catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '原请求读取失败', icon: 'none' }); }
    await refreshRecords();
  } catch (error) {
    if (operation.isCurrent()) uni.showToast({ title: error instanceof Error ? error.message : '保证金信息加载失败', icon: 'none' });
  }
}

function createIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function openPay(): void {
  openOperation('pay');
}

function openRefund(): void {
  openOperation('refund');
}

function openOperation(action: PendingDeposit['action']) {
  if (!page.visible.value || submitting.value || !userStore.currentUser?.isBuyer) return;
  try {
    readPending();
    if (pending.value?.receiptId != null) { uni.showToast({ title: '操作已成功，请刷新核对流水', icon: 'none' }); return; }
    const target = pending.value?.action || action;
    amountInput.value = pending.value ? String(pending.value.amount) : '';
    payPopup.value = target === 'pay';
    refundPopup.value = target === 'refund';
  } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '原请求读取失败', icon: 'none' }); }
}

async function submitPay() {
  await submitDeposit('pay');
}

async function submitRefund() {
  await submitDeposit('refund');
}

async function submitDeposit(action: PendingDeposit['action']) {
  const popupOpen = () => action === 'pay' ? payPopup.value : refundPopup.value;
  if (!page.visible.value || submitting.value || !popupOpen() || !userStore.currentUser?.isBuyer || pendingLoadFailed.value) return;
  const operation = page.capture();
  const version = popupVersion;
  const current = () => operation.isCurrent() && version === popupVersion && popupOpen();
  submitting.value = true;
  let key = '';
  let request: PendingDeposit | undefined;
  let sent = false;
  try {
    key = pendingKey();
    readPending();
    if (pending.value?.receiptId != null) throw new Error('操作已成功，请刷新核对流水');
    if (pending.value && pending.value.action !== action) throw new Error('请先恢复上一笔保证金操作');
    request = pending.value ? { ...pending.value } : { action, amount: Number(amountInput.value), idempotencyKey: createIdempotencyKey() };
    if (!Number.isFinite(request.amount) || request.amount <= 0) throw new Error('金额无效');
    const recovering = !!pending.value;
    await userStore.refreshProfile();
    if (!current()) return;
    if (!userStore.currentUser?.isBuyer) throw new Error('当前账号已不具备买手资格');
    if (!recovering && Number(amountInput.value) !== request.amount) throw new Error('金额已变化，请重新确认');
    readPending();
    if (pending.value?.receiptId != null) throw new Error('操作已成功，请刷新核对流水');
    if (pending.value && !sameRequest(pending.value, request)) throw new Error('已有另一笔原请求，请先核对后恢复');
    uni.setStorageSync(key, request);
    if (!sameRequest(uni.getStorageSync(key), request)) throw new Error('无法保存幂等请求，本次未提交');
    pending.value = request;
    const params = { amount: request.amount, idempotencyKey: request.idempotencyKey };
    sent = true;
    const id = await (action === 'pay' ? payBuyerDeposit(params) : refundBuyerDeposit(params));
    if (id === undefined || id === null || id === '') throw new Error('缺少成功回执，请恢复原操作核对');
    const receipt = { ...request, receiptId: id };
    try { if (sameRequest(uni.getStorageSync(key), request)) uni.setStorageSync(key, receipt); } catch { /* 原请求仍可同键恢复；本页保留已成功回执。 */ }
    if (!operation.sameSession()) return;
    pending.value = receipt;
    if (operation.isCurrent()) uni.showToast({ title: action === 'pay' ? '保证金缴纳成功' : '保证金退还成功', icon: 'success' });
    payPopup.value = false;
    refundPopup.value = false;
    amountInput.value = '';
  } catch (error) {
    if (sent && key && request && error instanceof RequestError && (error.kind === 'business' || error.kind === 'config')) {
      try {
        const stored = uni.getStorageSync(key);
        if (sameRequest(stored, request) && stored.receiptId == null) uni.removeStorageSync(key);
        if (operation.sameSession()) {
          if (sameRequest(pending.value, request) && pending.value?.receiptId == null) pending.value = undefined;
          readPending();
        }
      } catch { /* 保留原请求供核对。 */ }
    }
    if (operation.isCurrent()) uni.showToast({ title: pending.value?.receiptId != null ? '已取得成功回执，请刷新核对流水' : error instanceof Error ? error.message : '结果待核对，请使用原请求恢复', icon: 'none' });
  } finally {
    if (operation.sameSession()) {
      submitting.value = false;
      if (page.visible.value) await refreshRecords();
    }
  }
}

function bizTypeText(type: Api.RealUser.BuyerDepositBizType): string {
  return ({ PAY: '缴纳保证金', REFUND: '退还保证金', DEDUCT: '保证金扣罚', FREEZE: '保证金冻结', UNFREEZE: '保证金解冻' })[type];
}

function toTime(value: string | number): number {
  const date = typeof value === 'number' ? new Date(value) : /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
  return date.getTime();
}

function formatTime(value: string | number): string {
  const timestamp = toTime(value);
  return Number.isNaN(timestamp) ? '-' : new Date(timestamp).toLocaleString();
}
</script>

<template>
  <view class="dep-page yb-page">
    <view class="hero" :style="{ backgroundImage: `url(${UI_ASSETS.backgrounds.buyer})` }">
      <text class="hero-label">最近流水保证金余额 (USDT)</text>
      <text class="hero-amount">U {{ currentBalance == null ? '—' : formatAmount(currentBalance) }}</text>

      <view class="meter">
        <view class="meter-info">
          <text>以最新真实保证金流水余额为准</text>
          <text>已加载 {{ ledgers.length }} / {{ total }} 条记录</text>
        </view>
      </view>

      <view class="hero-cells">
        <view class="cell">
          <text class="cell-lbl">最新余额</text>
          <text class="cell-val">{{ currentBalance == null ? '—' : formatAmount(currentBalance) }}</text>
        </view>
        <view class="cell">
          <text class="cell-lbl">最新类型</text>
          <text class="cell-val">{{ ledgers[0] ? bizTypeText(ledgers[0].bizType) : '暂无' }}</text>
        </view>
      </view>

      <view class="hero-actions">
        <wd-button type="primary" :disabled="submitting || !userStore.currentUser?.isBuyer || pendingLoadFailed || pending?.receiptId != null" @click="openPay">缴纳保证金</wd-button>
        <wd-button plain :disabled="submitting || !userStore.currentUser?.isBuyer || pendingLoadFailed || pending?.receiptId != null" @click="openRefund">退还保证金</wd-button>
      </view>
    </view>

    <view class="section">
      <view v-if="pending"><text>上次{{ pending.action === 'pay' ? '缴纳' : '退还' }} U {{ pending.amount }} {{ pending.receiptId != null ? '已成功，正在等待对应流水回读。' : '结果待核对，恢复时复用原请求，不会创建新幂等键。' }}</text><wd-button v-if="pending.receiptId == null" plain :disabled="submitting" @click="pending.action === 'pay' ? openPay() : openRefund()">恢复原操作</wd-button></view>
      <text v-if="pendingLoadFailed" class="empty-text">本机原请求读取失败，暂不能创建新操作；原记录未删除。</text>
      <text v-if="!userStore.currentUser" class="empty-text">请先登录查看保证金记录</text>
      <text v-else-if="!userStore.currentUser.isBuyer" class="empty-text">当前账号尚未成为买手</text>
      <wd-button block plain :loading="loading" :disabled="submitting" @click="loadPage">{{ userStore.currentUser ? '刷新并核对流水' : '登录或重试' }}</wd-button>
      <text class="section-title">押金流水</text>
      <view v-if="ledgers.length">
        <view v-for="t in ledgers" :key="String(t.id)" class="txn-row">
          <view class="txn-main">
            <text class="txn-title">{{ bizTypeText(t.bizType) }}</text>
            <text v-if="t.remark" class="txn-remark">{{ t.remark }}</text>
            <text class="txn-time">{{ formatTime(t.createdAt) }}</text>
          </view>
          <view class="txn-side">
            <text class="txn-amount">U {{ formatAmount(t.amount) }}</text>
            <text class="txn-balance">余额 {{ formatAmount(t.balanceAfter) }}</text>
          </view>
        </view>
      </view>
      <text v-else-if="loadFailed" class="empty-text">保证金流水加载失败，请稍后重试</text>
      <text v-else-if="loading" class="empty-text">正在读取保证金流水</text>
      <text v-else-if="userStore.currentUser?.isBuyer && pageNo" class="empty-text">暂无押金流水</text>
      <wd-button v-if="userStore.currentUser?.isBuyer && (hasMore || loadFailed)" block plain :loading="loading" :disabled="submitting" @click="refreshRecords(loadFailed ? retryReset : false)">{{ loadFailed ? '加载失败，点击重试' : '加载更多' }}</wd-button>
    </view>

    <wd-popup v-model="payPopup" position="bottom" :safe-area-inset-bottom="true">
      <view class="popup">
        <text class="popup-title">缴纳保证金</text>
        <wd-input v-model="amountInput" label="金额 (USDT)" type="digit" :disabled="submitting || !!pending" />
        <text class="popup-hint">将从钱包可用余额划入保证金，重复提交只会生效一次。</text>
        <wd-button type="primary" block class="popup-btn" :loading="submitting" @click="submitPay">确认缴纳</wd-button>
      </view>
    </wd-popup>

    <wd-popup v-model="refundPopup" position="bottom" :safe-area-inset-bottom="true">
      <view class="popup">
        <text class="popup-title">退还保证金</text>
        <text class="popup-hint">仅可退未被在途订单冻结的部分，实际可退金额以后端校验为准。</text>
        <wd-input v-model="amountInput" label="金额 (USDT)" type="digit" :disabled="submitting || !!pending" />
        <wd-button type="primary" block class="popup-btn" :loading="submitting" @click="submitRefund">确认退还</wd-button>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
.dep-page { min-height:100%; }.hero { background-color:#10131f; background-size:cover; background-position:center; color:#fff; padding:48rpx 28rpx 32rpx; }
.hero-label { display: block; font-size: 22rpx; opacity: 0.8; }
.hero-amount { display: block; font-size: 64rpx; font-weight: 700; font-family: ui-monospace, monospace; margin: 12rpx 0 24rpx; }
.meter-info { display: flex; justify-content: space-between; font-size: 22rpx; margin-top: 8rpx; opacity: 0.85; }
.hero-cells { display: flex; gap: 16rpx; margin-top: 24rpx; }
.cell { flex:1; background:rgba(255,255,255,.12); border:1rpx solid rgba(255,255,255,.16); border-radius:var(--yb-radius-md); padding:16rpx; }
.cell-lbl { display: block; font-size: 22rpx; opacity: 0.8; }
.cell-val { display: block; font-size: 32rpx; font-weight: 700; font-family: ui-monospace, monospace; margin-top: 4rpx; }
.hero-actions { display: flex; gap: 12rpx; margin-top: 24rpx; }
.hero-actions > * { flex: 1; }
.section { background:#fff; margin:24rpx; padding:24rpx; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card); }
.section-title { display: block; font-size: 28rpx; font-weight: 600; margin-bottom: 16rpx; }
.txn-row { display: flex; justify-content: space-between; align-items: center; padding: 16rpx 0; border-bottom: 1rpx solid #f2f3f5; }
.txn-main { display: flex; flex-direction: column; }
.txn-title { font-size: 24rpx; }
.txn-remark { font-size: 22rpx; color: #4e5969; margin-top: 4rpx; }
.txn-time { font-size: 22rpx; color: #86909c; margin-top: 4rpx; }
.txn-side { display: flex; flex-direction: column; align-items: flex-end; }
.txn-amount { font-size: 28rpx; font-weight: 700; font-family: ui-monospace, monospace; }
.txn-balance { font-size: 22rpx; color: #86909c; margin-top: 4rpx; }
.empty-text { display: block; text-align: center; color: #86909c; padding: 32rpx 0; font-size: 24rpx; }
.popup { padding: 24rpx; }
.popup-title { display: block; font-size: 30rpx; font-weight: 600; margin-bottom: 16rpx; }
.popup-hint { display: block; font-size: 22rpx; color: #86909c; margin-bottom: 16rpx; }
.popup-btn { margin-top: 16rpx; }
</style>

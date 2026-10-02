<script setup lang="ts">
import ContentText from '@/components/common/content-text.vue';
import { computed, ref, watch } from 'vue';
import { onHide, onReachBottom, onShow } from '@dcloudio/uni-app';
import { usePagedList } from '@/utils/paged-list';
import { usePageOperation } from '@/utils/page-operation';
import { isMissingOperationRecord } from '@/utils/storage';
import { useNavigationGuards } from '@/utils/navigate';
import { RequestError } from '@/service/request';
import { formatAmount } from '@/utils/format-bridge';
import { fetchBuyerDepositLedger, fetchBuyerDepositSummary, payBuyerDeposit, refundBuyerDeposit } from '@/service/api/buyer';
import { useUserStore } from '@/stores';
import PayPasswordPopup from '@/components/common/pay-password-popup.vue';

const userStore = useUserStore();
const { requireLogin } = useNavigationGuards();
const submitting = ref(false);
const summary = ref<Api.RealUser.BuyerDepositSummary>();
const summaryLoading = ref(true);
const summaryLoadFailed = ref(false);
let summarySequence = 0;
const payPasswordPopup = ref<InstanceType<typeof PayPasswordPopup>>();

const payPopup = ref(false);
const refundPopup = ref(false);
const amountInput = ref('');
type PendingDeposit = Api.RealUser.BuyerDepositParams & { action: 'pay' | 'refund'; receiptId?: string | number };
const pending = ref<PendingDeposit>();
const pendingLoadFailed = ref(false);
const retryReset = ref(true);
let popupVersion = 0;
const page = usePageOperation(() => {
  summarySequence++;
  summary.value = undefined;
  summaryLoading.value = false;
  summaryLoadFailed.value = false;
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
    if (isMissingOperationRecord(pendingKey(), saved)) { if (pending.value?.receiptId == null) pending.value = undefined; return; }
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
onHide(() => { summarySequence++; summaryLoading.value = false; invalidate(); payPopup.value = false; refundPopup.value = false; });
onReachBottom(() => refreshRecords(false));

const currentBalance = computed(() => summary.value?.depositBalance);
const qualificationText = computed(() => {
  if (summaryLoading.value) return '正在核对上架资格';
  if (!userStore.currentUser) return '登录后核对上架资格';
  if (!userStore.currentUser.isBuyer) return '当前账号尚未成为买手';
  if (summaryLoadFailed.value || !summary.value) return '上架资格待核对';
  if (summary.value.depositExempt === true) return '当前买手免押';
  if (summary.value.listable === true) return '当前可上架';
  if (summary.value.listable === false) return '当前不可上架';
  return '上架资格待核对';
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
  const sequence = ++summarySequence;
  const current = () => operation.isCurrent() && sequence === summarySequence;
  summaryLoading.value = true;
  summaryLoadFailed.value = false;
  try {
    if (!await requireLogin('/pages/buyer/deposit') || !operation.isCurrent()) return;
    try { readPending(); }
    catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '原请求读取失败', icon: 'none' }); }
    const [summaryResult] = await Promise.all([fetchBuyerDepositSummary(), refreshRecords()]);
    if (current()) summary.value = summaryResult;
  } catch (error) {
    if (current()) {
      summaryLoadFailed.value = true;
      uni.showToast({ title: error instanceof Error ? error.message : '保证金信息加载失败', icon: 'none' });
    }
  } finally { if (current()) summaryLoading.value = false; }
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
    if (action === 'refund') {
      const available = Number(summary.value?.depositAvailable);
      if (!Number.isFinite(available)) throw new Error('可退保证金尚未加载，请刷新后重试');
      if (request.amount > available) throw new Error('退还金额不能超过可退保证金');
    }
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
    const payPassword = action === 'pay' ? await payPasswordPopup.value?.request('/pages/buyer/deposit') : undefined;
    if ((action === 'pay' && !payPassword) || !current()) return;
    const params = { amount: request.amount, idempotencyKey: request.idempotencyKey, ...(action === 'pay' ? { payPassword } : {}) };
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
      if (page.visible.value) {
        await userStore.refreshProfile().catch(() => undefined);
        await loadPage();
      }
    }
  }
}

function bizTypeText(type: Api.RealUser.BuyerDepositBizType): string {
  return ({ PAY: '缴纳保证金', REFUND: '退还保证金', DEDUCT: '保证金扣罚', FREEZE: '订单占用', UNFREEZE: '订单释放' })[type];
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
    <PayPasswordPopup ref="payPasswordPopup" />
    <view class="hero" >
      <text class="hero-label">保证金总额 (USDT)</text>
      <text class="hero-amount">{{ currentBalance == null ? '—' : formatAmount(currentBalance) }}</text>

      <view class="meter">
        <view class="meter-info">
          <text>{{ qualificationText }}</text><text>保证金使用率 {{ summary?.usageRate == null ? '—' : `${summary.usageRate}%` }}</text>

        </view>
      </view>

      <text v-if="summaryLoadFailed" class="balance-note">保证金信息读取失败，请刷新核对；下方已有金额为上次读取结果。</text>
      <text v-else-if="!summaryLoading && currentBalance == null" class="balance-note">保证金金额暂未读取，请刷新核对。</text>
      <view class="hero-cells">
        <view class="cell">
          <text class="cell-lbl">订单占用</text>
          <text class="cell-val">{{ summary?.depositFrozen == null ? '—' : formatAmount(summary.depositFrozen) }}</text>
        </view>
        <view class="cell">
          <text class="cell-lbl">可退保证金</text>
          <text class="cell-val">{{ summary?.depositAvailable == null ? '—' : formatAmount(summary.depositAvailable) }}</text>
        </view>
      </view>

      <view class="hero-actions">
        <wd-button type="primary" :disabled="submitting || !userStore.currentUser?.isBuyer || pendingLoadFailed || pending?.receiptId != null" @click="openPay">缴纳保证金</wd-button>
        <wd-button plain :disabled="submitting || !userStore.currentUser?.isBuyer || pendingLoadFailed || pending?.receiptId != null" @click="openRefund">退还保证金</wd-button>
      </view>
    </view>

    <view class="section">
      <text v-if="!userStore.currentUser" class="empty-text">请先登录查看保证金记录</text>
      <text v-else-if="!userStore.currentUser.isBuyer" class="empty-text">当前账号尚未成为买手</text>
      <wd-button block plain :loading="summaryLoading || loading" :disabled="submitting" @click="loadPage">{{ userStore.currentUser ? '刷新并核对流水' : '登录或重试' }}</wd-button>
      <view class="ledger-heading"><text class="section-title">押金流水</text><text>已加载 {{ ledgers.length }} / {{ total }} 条</text></view>
      <view v-if="ledgers.length">
        <view v-for="t in ledgers" :key="String(t.id)" class="txn-row">
          <view class="txn-main">
            <text class="txn-title">{{ bizTypeText(t.bizType) }}</text>
            <ContentText v-if="t.remark" class="txn-remark" :text="t.remark" :lines="2" />
            <text class="txn-time">{{ formatTime(t.createdAt) }}</text>
          </view>
          <view class="txn-side">
            <text class="txn-amount">{{ formatAmount(t.amount) }} USDT</text>
            <text class="txn-balance">变动后余额 {{ formatAmount(t.balanceAfter) }} USDT</text>
          </view>
        </view>
      </view>
      <text v-else-if="loadFailed" class="empty-text">保证金流水加载失败，请稍后重试</text>
      <text v-else-if="loading" class="empty-text">正在读取保证金流水</text>
      <text v-else-if="userStore.currentUser?.isBuyer && pageNo" class="empty-text">暂无押金流水</text>
      <wd-button v-if="userStore.currentUser?.isBuyer && (hasMore || loadFailed)" block plain :loading="loading" :disabled="submitting" @click="refreshRecords(loadFailed ? retryReset : false)">{{ loadFailed ? '加载失败，点击重试' : '加载更多' }}</wd-button>
    </view>

    <wd-popup v-model="payPopup" position="bottom" closable :safe-area-inset-bottom="true">
      <view class="popup">
        <text class="popup-title">缴纳保证金</text>
        <wd-input v-model="amountInput" label="金额 (USDT)" type="digit" :disabled="submitting || !!pending" />
        <text class="popup-hint">将从钱包可用余额划入保证金，重复提交只会生效一次。</text>
        <wd-button type="primary" block class="popup-btn" :loading="submitting" @click="submitPay">确认缴纳</wd-button>
      </view>
    </wd-popup>

    <wd-popup v-model="refundPopup" position="bottom" closable :safe-area-inset-bottom="true">
      <view class="popup">
        <text class="popup-title">退还保证金</text>
        <text class="popup-hint">仅可退未被在途订单冻结的部分，实际可退金额以申请时核实结果为准。</text>
        <wd-input v-model="amountInput" label="金额 (USDT)" type="digit" :disabled="submitting || !!pending" />
        <wd-button type="primary" block class="popup-btn" :loading="submitting" @click="submitRefund">确认退还</wd-button>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
.dep-page { min-height:100%; padding-top:24rpx; }.hero { background-color:var(--yb-surface); background-size:cover; background-position:center; color:var(--yb-ink); padding:24rpx; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); }
.hero-label { display: block; font-size: 24rpx; color: var(--yb-muted); }
.hero-amount { display: block; font-size: 64rpx; font-weight: 700; font-family: var(--yb-font-body); margin: 12rpx 0 24rpx; overflow-wrap:anywhere; }
.meter-info { display: flex; flex-wrap:wrap; justify-content: space-between; gap: 8rpx 16rpx; font-size: 24rpx; margin-top: 8rpx; color: var(--yb-muted); }
.balance-note { display: block; margin-top: 16rpx; font-size: 24rpx; color: var(--yb-muted); }
.hero-cells { display: flex; gap: 16rpx; margin-top: 24rpx; }
.cell { flex:1; min-width:0; background:var(--yb-bg); border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-md); padding:16rpx; }
.cell-lbl { display: block; font-size: 24rpx; color: var(--yb-muted); }
.cell-val { display: block; font-size: 32rpx; font-weight: 700; font-family: var(--yb-font-body); margin-top: 4rpx; overflow-wrap:anywhere; }
.hero-actions { display: flex; gap: 12rpx; margin-top: 24rpx; }
.hero-actions > * { flex: 1; }
.section { background:#fff; margin-top:20rpx; padding:24rpx; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card); }
.section-title { display: block; font-size: 28rpx; font-weight: 600; margin:20rpx 0 16rpx; }
.txn-row { display: flex; justify-content: space-between; align-items: center; gap:16rpx; padding: 16rpx 0; border-bottom: 1rpx solid #f2f3f5; }
.txn-main { display: flex; flex-direction: column; min-width:0; flex:1; }
.txn-title { font-size: 24rpx; }
.txn-remark { font-size: 24rpx; color: var(--yb-muted); margin-top: 4rpx; }
.txn-time { font-size: 24rpx; color: var(--yb-muted); margin-top: 4rpx; }
.txn-side { display: flex; flex-direction: column; align-items: flex-end; min-width:0; flex:1; text-align:right; overflow-wrap:anywhere; }
.txn-amount { font-size: 28rpx; font-weight: 700; font-family: var(--yb-font-body); }
.txn-balance { font-size: 24rpx; color: var(--yb-muted); margin-top: 4rpx; }
.empty-text { display: block; text-align: center; color: var(--yb-muted); padding: 32rpx 0; font-size: 24rpx; }
.popup { padding: 24rpx; }
.popup-title { display: block; font-size: 30rpx; font-weight: 600; margin-bottom: 16rpx; }
.popup-hint { display: block; font-size: 24rpx; color: var(--yb-muted); line-height: 1.6; margin-bottom: 16rpx; }
.popup-btn { margin-top: 16rpx; }
.ledger-heading { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12rpx; font-size:24rpx; color:var(--yb-muted); margin:20rpx 0 12rpx; }.ledger-heading .section-title { margin:0; }
</style>

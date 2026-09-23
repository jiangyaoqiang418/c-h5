<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import { fetchLatestWalletPay, fetchWalletPayDetail, fetchWalletPayChains, submitWalletPayTx, validateWalletPay, type WalletPayOrder } from '@/service/api/wallet-pay';
import { availableWallets, connectPaymentWallet, walletRequestRejected } from '@/utils/wallet-pay-provider';
import { readWalletTransferProgress, saveWalletTransferProgress, clearWalletTransferProgress, type WalletTransferProgress } from '@/utils/wallet-pay-progress';
import { readPendingCheckouts, removePendingCheckout, savePendingCheckout } from '@/utils/checkout-progress';
import { walletPayEntryEnabled } from '@/utils/wallet-pay-feature';
import { useCartStore, useUserStore } from '@/stores';
import { go, reLaunch } from '@/utils/navigate';
import { getAccessToken } from '@/service/request/token';

const userStore = useUserStore();
const cart = useCartStore();
const group = ref('');
const pay = ref<WalletPayOrder>();
const progress = ref<WalletTransferProgress>();
const selectedWallet = ref('');
const account = ref('');
const newHash = ref('');
const loading = ref(false);
const busy = ref(false);
const errorText = ref('');
const recoveryBlocked = ref(false);
const minConfirmations = ref<number>();
const wallets = computed(() => availableWallets(pay.value?.chain || ''));
let visible = false;
let version = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let successHandled = false;

onLoad(query => { group.value = typeof query?.orderGroupNo === 'string' ? query.orderGroupNo : ''; });
onShow(() => { visible = true; void load(); });
onHide(() => { visible = false; version++; stopPolling(); });
onUnload(() => { visible = false; version++; stopPolling(); });

function stopPolling() { if (timer) clearTimeout(timer); timer = undefined; }
function schedulePolling() {
  stopPolling();
  if (!visible || !pay.value || !['SUBMITTED', 'CLOSED'].includes(pay.value.status)) return;
  timer = setTimeout(() => { void refreshDetail(); }, pay.value.status === 'SUBMITTED' ? 4000 : 30000);
}
function validHash(chain: string, hash: string) {
  return chain === 'TRON' ? /^[0-9a-fA-F]{64}$/.test(hash) : /^0x[0-9a-fA-F]{64}$/.test(hash);
}
function expiryText(value: string | number) {
  const time = Number(value);
  return Number.isSafeInteger(time) && time > 0 ? new Date(time).toLocaleString() : '请以服务端状态为准';
}
function readProgress(current: WalletPayOrder) {
  const userId = userStore.realUserId;
  if (!userId) return;
  try { progress.value = readWalletTransferProgress(userId, current.payNo); recoveryBlocked.value = false; }
  catch (error) { recoveryBlocked.value = true; errorText.value = error instanceof Error ? error.message : '本机转账记录无法读取'; }
}
function acceptPay(next: WalletPayOrder) {
  pay.value = validateWalletPay(next, group.value);
  readProgress(next);
  if (next.status === 'SUCCESS') void finishSuccess(next);
  schedulePolling();
}
async function load() {
  const current = ++version;
  stopPolling();
  pay.value = undefined; progress.value = undefined; recoveryBlocked.value = false; errorText.value = '';
  loading.value = true;
  try {
    await userStore.init();
    if (current !== version || !visible) return;
    if (!walletPayEntryEnabled || !group.value) throw new Error('钱包直付入口暂未开放，请从订单页核对');
    if (!userStore.realUserId) {
      if (getAccessToken()) throw new Error('账户资料暂未加载成功，请稍后重试');
      go(`/pages/auth/login?redirect=${encodeURIComponent(`/pages/checkout/wallet-pay?orderGroupNo=${encodeURIComponent(group.value)}`)}`);
      return;
    }
    const next = await fetchLatestWalletPay(group.value);
    if (current !== version || !visible) return;
    if (!next) throw new Error('未找到钱包支付单，请返回结算页核对');
    acceptPay(next);
    selectedWallet.value = wallets.value[0]?.key || '';
    void fetchWalletPayChains().then(chains => {
      if (current === version) minConfirmations.value = chains.find(chain => chain.chain === next.chain && chain.network === next.network)?.minConfirmations;
    }).catch(() => undefined);
    const saved = readWalletTransferProgress(userStore.realUserId, next.payNo);
    if (saved?.txHash && next.status === 'PENDING') void retryReport();
  } catch (error) {
    if (current === version) errorText.value = error instanceof Error ? error.message : '支付单读取失败';
  } finally { if (current === version) loading.value = false; }
}
async function refreshDetail() {
  const currentPay = pay.value;
  const userId = userStore.realUserId;
  const current = version;
  if (!currentPay || !userId) return;
  try {
    const next = await fetchWalletPayDetail(currentPay.payNo);
    if (current !== version || !visible || userStore.realUserId !== userId || pay.value?.payNo !== currentPay.payNo) return;
    errorText.value = '';
    acceptPay(next);
  } catch (error) {
    if (current === version) errorText.value = error instanceof Error ? error.message : '支付状态读取失败';
    schedulePolling();
  }
}
async function reportFor(currentPay: WalletPayOrder, userId: string, hash: string, fromAddress?: string) {
  if (!validHash(currentPay.chain, hash)) throw new Error('交易哈希格式无效，请核对钱包交易记录');
  const marker: WalletTransferProgress = { started: true, txHash: hash, ...(fromAddress ? { fromAddress } : {}) };
  saveWalletTransferProgress(userId, currentPay.payNo, marker);
  if (pay.value?.payNo === currentPay.payNo && userStore.realUserId === userId) progress.value = marker;
  if (userStore.realUserId !== userId) throw new Error('账号已切换，交易哈希已保留在原账号，请切回后上报');
  const next = await submitWalletPayTx({ payNo: currentPay.payNo, txHash: hash, ...(fromAddress ? { fromAddress } : {}) });
  if (pay.value?.payNo === currentPay.payNo && userStore.realUserId === userId) acceptPay(next);
}
async function retryReport() {
  const currentPay = pay.value;
  const userId = userStore.realUserId;
  const marker = progress.value;
  if (!currentPay || !userId || !marker?.txHash || busy.value) return;
  busy.value = true; errorText.value = '';
  try { await reportFor(currentPay, userId, marker.txHash, marker.fromAddress); }
  catch (error) { errorText.value = error instanceof Error ? error.message : '哈希上报失败，请重试同一笔交易'; }
  finally { busy.value = false; }
}
async function reportManual() {
  const currentPay = pay.value;
  const userId = userStore.realUserId;
  const hash = newHash.value.trim();
  if (!currentPay || !userId || busy.value) return;
  if (!validHash(currentPay.chain, hash)) { uni.showToast({ title: '交易哈希格式不正确', icon: 'none' }); return; }
  busy.value = true; errorText.value = '';
  try { await reportFor(currentPay, userId, hash, progress.value?.fromAddress); newHash.value = ''; }
  catch (error) { errorText.value = error instanceof Error ? error.message : '交易哈希上报失败，请保留哈希重试'; }
  finally { busy.value = false; }
}
async function transfer() {
  const currentPay = pay.value;
  const userId = userStore.realUserId;
  if (!currentPay || !userId || busy.value || recoveryBlocked.value || currentPay.status !== 'PENDING') return;
  if (progress.value?.started) { uni.showToast({ title: '先核对原交易，勿重复转账', icon: 'none' }); return; }
  busy.value = true; errorText.value = '';
  let signatureStarted = false;
  try {
    if (Number(currentPay.expireAt) <= Date.now()) throw new Error('支付单已过期，请刷新状态');
    const latest = validateWalletPay(await fetchWalletPayDetail(currentPay.payNo), group.value);
    if (latest.status !== 'PENDING' || latest.chain !== currentPay.chain || latest.rawAmount !== currentPay.rawAmount
      || latest.network !== currentPay.network || latest.toAddress !== currentPay.toAddress || latest.tokenContract !== currentPay.tokenContract) {
      acceptPay(latest); throw new Error('支付单状态或参数已变化，请重新核对');
    }
    const wallet = await connectPaymentWallet(latest, selectedWallet.value);
    if (userStore.realUserId !== userId || pay.value?.payNo !== latest.payNo) throw new Error('账号或支付单已变化');
    account.value = wallet.account;
    const confirm = await uni.showModal({ title: '核对链上转账', content: `${latest.chainLabel || latest.chain} ${latest.network}\n账户：${wallet.account}\n应转：${latest.payAmount} USDT\n收款：${latest.toAddress}\n请确认后在钱包内签名。`, confirmText: '打开钱包' });
    if (!confirm.confirm || userStore.realUserId !== userId || pay.value?.payNo !== latest.payNo) return;
    const before = validateWalletPay(await fetchWalletPayDetail(latest.payNo), group.value);
    if (before.status !== 'PENDING' || before.rawAmount !== latest.rawAmount || before.toAddress !== latest.toAddress
      || before.tokenContract !== latest.tokenContract || before.network !== latest.network || Number(before.expireAt) <= Date.now()) {
      acceptPay(before); throw new Error('支付单已变化，请重新核对，勿转账');
    }
    if (userStore.realUserId !== userId || pay.value?.payNo !== latest.payNo) return;
    const marker: WalletTransferProgress = { started: true, fromAddress: wallet.account };
    saveWalletTransferProgress(userId, latest.payNo, marker);
    progress.value = marker; signatureStarted = true;
    const hash = await wallet.sendTransfer();
    await reportFor(latest, userId, hash, wallet.account);
  } catch (error) {
    if (signatureStarted && walletRequestRejected(error)) {
      clearWalletTransferProgress(userId, currentPay.payNo);
      progress.value = undefined;
    }
    errorText.value = error instanceof Error ? error.message : '钱包操作未确认，请先核对钱包交易，勿重复转账';
  } finally { busy.value = false; }
}
async function finishSuccess(currentPay: WalletPayOrder) {
  if (successHandled || !visible) return;
  const userId = userStore.realUserId;
  if (!userId) return;
  successHandled = true;
  let pending;
  try { pending = readPendingCheckouts().find(item => item.userId === userId && item.orderGroupNo === currentPay.orderGroupNo); }
  catch { uni.showToast({ title: '支付已确认，请到订单列表核对', icon: 'none' }); }
  const orderIds = pending?.orderIds?.map(String) || currentPay.payResult?.items?.map(item => String(item.orderId)) || [];
  try {
    clearWalletTransferProgress(userId, currentPay.payNo);
    if (pending) {
      if (pending.mode === 'buy-now' && pending.contextId) cart.clearBuyNow(pending.contextId);
      else if (pending.mode === 'cart') pending.lines?.forEach(line => {
        const item = cart.enrichedItems.find(cartItem => cartItem.key === line.key);
        if (item?.qty === line.qty) cart.remove(line.key);
      });
      removePendingCheckout(pending);
    }
  } catch { uni.showToast({ title: '付款已成功，本机清理待核对', icon: 'none' }); }
  if (userStore.realUserId !== userId || !visible) { successHandled = false; return; }
  if (orderIds.length) reLaunch(`/pages/checkout/success?orderId=${encodeURIComponent(orderIds[0])}&orderIds=${encodeURIComponent(JSON.stringify(orderIds))}`);
  else go('/pages/order/list');
}
async function restartClosed() {
  const currentPay = pay.value;
  const userId = userStore.realUserId;
  if (!currentPay || currentPay.status !== 'CLOSED' || !userId) return;
  if (progress.value?.started || recoveryBlocked.value) { uni.showToast({ title: '请先核对原交易，勿重复付款', icon: 'none' }); return; }
  const answer = await uni.showModal({ title: '重新发起支付？', content: '只有确认未发生链上转账后才可重新创建支付单。旧单关闭后仍可能收到到账回调。', confirmText: '返回结算' });
  if (!answer.confirm || userStore.realUserId !== userId) return;
  try {
    const pending = readPendingCheckouts().find(item => item.userId === userId && item.orderGroupNo === currentPay.orderGroupNo);
    if (pending?.walletPayAttempt?.payNo === currentPay.payNo) {
      delete pending.walletPayAttempt;
      savePendingCheckout(pending);
    }
    go('/pages/checkout/index');
  } catch (error) { errorText.value = error instanceof Error ? error.message : '结算记录无法更新，请先核对订单'; }
}
</script>

<template>
  <view class="wallet-pay-page yb-page">
    <view v-if="loading" class="center"><wd-loading size="44rpx" /><text>正在核对支付单</text></view>
    <view v-if="errorText" class="notice warning">{{ errorText }}</view>
    <template v-if="pay">
      <view class="notice" v-if="pay.status === 'PENDING'">转账前请核对链、金额、收款地址和合约。仅平台确认到账才算付款成功。</view>
      <view class="notice" v-else-if="pay.status === 'SUBMITTED'">交易已提交，等待链上确认{{ minConfirmations ? `（至少 ${minConfirmations} 个确认）` : '' }}及平台入账。请勿重复转账。</view>
      <view class="notice warning" v-else-if="pay.status === 'CLOSED'">支付单已关闭，但延迟到账仍可能被处理。请先核对钱包交易。</view>
      <view class="notice warning" v-else-if="pay.status === 'FAILED'">订单支付未成立，已到账资金按后端规则进入平台余额。请核对原因后使用余额支付。</view>
      <view class="card">
        <text class="title">{{ pay.payAmount }} USDT</text>
        <text class="subtitle">{{ pay.statusText || pay.status }} · {{ pay.chainLabel || pay.chain }} {{ pay.network }}</text>
        <view class="detail"><text>支付单号</text><text selectable>{{ pay.payNo }}</text></view>
        <view class="detail"><text>订单组号</text><text selectable>{{ pay.orderGroupNo }}</text></view>
        <view class="detail"><text>收款地址</text><text selectable class="value">{{ pay.toAddress }}</text></view>
        <view class="detail"><text>USDT 合约</text><text selectable class="value">{{ pay.tokenContract }}</text></view>
        <view class="detail"><text>有效期至</text><text>{{ expiryText(pay.expireAt) }}</text></view>
        <view class="detail"><text>钱包账户</text><text selectable class="value">{{ account || progress?.fromAddress || '尚未连接' }}</text></view>
        <view v-if="pay.txHash || progress?.txHash" class="detail"><text>交易哈希</text><text selectable class="value">{{ pay.txHash || progress?.txHash }}</text></view>
        <text v-if="pay.failReason" class="chain-tip">{{ pay.failReason }}</text>
      </view>
      <view v-if="pay.status === 'PENDING' && !progress?.started && !recoveryBlocked" class="card action-card">
        <text class="section-title">选择当前浏览器钱包</text>
        <wd-radio-group v-if="wallets.length" v-model="selectedWallet">
          <wd-radio v-for="wallet in wallets" :key="wallet.key" :value="wallet.key">{{ wallet.label }}</wd-radio>
        </wd-radio-group>
        <text v-else class="chain-tip">当前浏览器未检测到该链的钱包能力。请在对应钱包内置浏览器打开本页；暂不支持无注入能力的外跳签名。</text>
        <wd-button type="primary" block :disabled="!selectedWallet" :loading="busy" @click="transfer">连接钱包并转账</wd-button>
        <text class="chain-tip">请准备该链 Gas 币（ETH、BNB 或 TRX）。</text>
      </view>
      <view v-if="progress?.started && !progress.txHash && pay.status === 'PENDING'" class="card action-card">
        <text class="section-title">核对原交易</text>
        <text class="chain-tip">本机曾请求钱包签名，但未取得哈希。请先核对钱包交易记录，勿再次转账。</text>
        <wd-input v-model="newHash" placeholder="填写原交易哈希" clearable />
        <wd-button block plain :loading="busy" @click="reportManual">上报原交易哈希</wd-button>
      </view>
      <view v-if="progress?.txHash && pay.status === 'PENDING'" class="card action-card">
        <wd-button block plain :loading="busy" @click="retryReport">重试上报同一交易</wd-button>
      </view>
      <view v-if="pay.status === 'SUBMITTED' && progress?.started" class="card action-card">
        <text class="chain-tip">如在钱包中对交易加速或替换，请核对新哈希后上报；不要再发起新的转账。</text>
        <wd-input v-model="newHash" placeholder="替换交易的新哈希（选填）" clearable />
        <wd-button block plain :loading="busy" @click="reportManual">上报替换哈希</wd-button>
      </view>
      <wd-button v-if="pay.status === 'CLOSED'" block plain @click="restartClosed">核对后返回结算页</wd-button>
      <wd-button v-if="pay.status === 'FAILED'" block plain @click="go('/pages/checkout/index')">返回结算页使用余额</wd-button>
    </template>
    <view class="footer-actions">
      <wd-button plain :disabled="loading || busy" @click="pay ? refreshDetail() : load()">刷新支付状态</wd-button>
      <wd-button plain @click="go('/pages/order/list')">查看我的订单</wd-button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.wallet-pay-page { min-height: 100%; padding: 24rpx 24rpx calc(72rpx + env(safe-area-inset-bottom)); background: var(--yb-bg); }
.center { display:flex; align-items:center; justify-content:center; gap:16rpx; padding:80rpx 0; color:var(--yb-muted); }
.notice { padding:20rpx; margin-bottom:20rpx; border-radius:var(--yb-radius-lg); background:#eef6ff; color:#386bb3; font-size:24rpx; line-height:1.5; }
.notice.warning { background:#fff7e8; color:#9e6418; }
.card { padding:28rpx; margin-bottom:20rpx; background:#fff; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card); }
.title { display:block; color:var(--yb-brand); font-size:42rpx; font-weight:700; text-align:center; }
.subtitle { display:block; margin:8rpx 0 24rpx; text-align:center; color:#4e5969; font-size:24rpx; }
.detail { display:flex; justify-content:space-between; gap:24rpx; padding:14rpx 0; border-top:1rpx solid #f2f3f5; font-size:24rpx; }
.detail > text:first-child { flex-shrink:0; color:#86909c; }
.value { max-width:66%; overflow-wrap:anywhere; text-align:right; }
.action-card { display:flex; flex-direction:column; gap:18rpx; }
.section-title { font-size:26rpx; font-weight:600; }
.chain-tip { display:block; color:#86909c; font-size:22rpx; line-height:1.5; }
.footer-actions { display:flex; flex-direction:column; gap:16rpx; margin-top:28rpx; }
</style>

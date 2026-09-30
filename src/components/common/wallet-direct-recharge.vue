<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { fetchRechargeAddress, fetchRechargeChains } from '@/service/api/wallet';
import { fetchWalletPayChains, type WalletTransferParams } from '@/service/api/wallet-pay';
import { amountToRaw, compareAmounts, normalizeAmount } from '@/utils/amount';
import { availableWallets, connectPaymentWallet, walletRequestRejected } from '@/utils/wallet-pay-provider';
import { usePageOperation } from '@/utils/page-operation';
import { useUserStore } from '@/stores';
import { go } from '@/utils/navigate';
import { isMissingOperationRecord } from '@/utils/storage';
import WalletBrowserEntry from './wallet-browser-entry.vue';

const props = defineProps<{ chain: string; disabled?: boolean }>();
const user = useUserStore();
const amount = ref('100'), walletKey = ref(''), error = ref('');
const busy = ref(false), loading = ref(false);
interface RechargeTerms extends WalletTransferParams { decimals: number; minAmount: string; minConfirmations: number }
interface Progress { attempt: string; terms: RechargeTerms; amount: string; fromAddress: string; txHash?: string }
const terms = ref<RechargeTerms>();
const progress = ref<Progress>();
const recordBlocked = ref(false);
const wallets = computed(() => availableWallets(props.chain));
let sequence = 0;
const page = usePageOperation(() => {
  sequence++; terms.value = undefined; progress.value = undefined; error.value = ''; amount.value = '100';
  walletKey.value = ''; busy.value = false; loading.value = false; recordBlocked.value = false;
});
const keyFor = (userId: string) => `bw_h5_direct_recharge_v1:${encodeURIComponent(userId)}`;
function read(userId: string): Progress | undefined {
  const value = uni.getStorageSync(keyFor(userId));
  if (isMissingOperationRecord(keyFor(userId), value)) return;
  if (!value || typeof value !== 'object' || typeof value.attempt !== 'string' || !value.attempt
    || typeof value.amount !== 'string' || typeof value.fromAddress !== 'string' || !value.fromAddress
    || !value.terms || typeof value.terms.chain !== 'string' || typeof value.terms.network !== 'string'
    || typeof value.terms.toAddress !== 'string' || typeof value.terms.tokenContract !== 'string'
    || typeof value.terms.rawAmount !== 'string' || !/^\d+$/.test(value.terms.rawAmount)
    || (value.txHash !== undefined && (typeof value.txHash !== 'string' || !value.txHash))) throw new Error('本机充值进度无法读取，请先核对钱包与平台余额');
  return value;
}
function save(userId: string, value: Progress) {
  uni.setStorageSync(keyFor(userId), value);
  if (JSON.stringify(read(userId)) !== JSON.stringify(value)) throw new Error('充值进度无法保存，已停止签名');
}
async function fetchTerms(chain: string): Promise<RechargeTerms> {
  const [chains, address, paymentChains] = await Promise.all([fetchRechargeChains(), fetchRechargeAddress(chain), fetchWalletPayChains()]);
  const enabled = chains.find(item => item.chain === chain && item.enabled !== false);
  const network = paymentChains.find(item => item.chain === chain && item.enabled);
  if (!enabled || !network || address.chain !== chain || !address.address || !address.tokenContract
    || address.memo || address.decimals !== network.decimals || (enabled.decimals != null && enabled.decimals !== network.decimals)
    || (chain === 'TRON' ? address.tokenContract !== network.tokenContract : address.tokenContract.toLowerCase() !== network.tokenContract.toLowerCase())
    || !Number.isSafeInteger(address.minConfirmations) || address.minConfirmations! < 0) {
    throw new Error('当前链的充值网络、合约或精度无法确认，请使用上方专属地址充值');
  }
  const minima = [address.minAmount, enabled.minAmount].filter(item => item != null).map(item => normalizeAmount(item!));
  return { chain, network: network.network, tokenContract: address.tokenContract, toAddress: address.address,
    decimals: network.decimals, minAmount: minima.reduce((max, value) => compareAmounts(max, value) >= 0 ? max : value, '0'),
    minConfirmations: address.minConfirmations!, rawAmount: '0' };
}
async function load() {
  if (!page.visible.value || busy.value) return;
  const operation = page.capture(), currentSequence = ++sequence, chain = props.chain;
  const current = () => operation.isCurrent() && currentSequence === sequence && props.chain === chain;
  terms.value = undefined; error.value = ''; recordBlocked.value = false; loading.value = false;
  if (!user.realUserId || !chain || props.disabled) return;
  loading.value = true;
  try {
    progress.value = read(user.realUserId);
    const value = await fetchTerms(chain);
    if (!current()) return;
    terms.value = value; walletKey.value = wallets.value[0]?.key || '';
  } catch (cause) {
    if (current()) {
      error.value = cause instanceof Error ? cause.message : '钱包直充配置读取失败';
      try { progress.value = read(user.realUserId!); } catch { recordBlocked.value = true; }
    }
  } finally { if (currentSequence === sequence) loading.value = false; }
}
watch([() => props.chain, () => props.disabled, () => user.realUserId], () => { sequence++; if (!busy.value) void load(); });
onShow(load);
async function transfer() {
  if (busy.value || loading.value || !terms.value || !walletKey.value || props.disabled || progress.value || recordBlocked.value) return;
  const userId = user.realUserId, operation = page.capture(), currentSequence = sequence, chain = props.chain;
  const current = () => operation.isCurrent() && currentSequence === sequence && chain === props.chain && !props.disabled && user.realUserId === userId;
  if (!userId || !current()) return;
  busy.value = true; error.value = '';
  let signatureStarted = false, marker: Progress | undefined;
  try {
    if (read(userId)) throw new Error('上一笔充值结果待核对，暂不重复转账');
    const value = normalizeAmount(amount.value), originalTerms = JSON.stringify(terms.value);
    if (compareAmounts(value, terms.value.minAmount) < 0) throw new Error('金额低于最低充值要求');
    const rawAmount = amountToRaw(value, terms.value.decimals);
    const latest = await fetchTerms(chain);
    if (!current()) return;
    if (JSON.stringify(latest) !== originalTerms) { terms.value = latest; throw new Error('充值条件已变化，请重新核对'); }
    const transferTerms = { ...latest, rawAmount };
    const wallet = await connectPaymentWallet(transferTerms, walletKey.value);
    if (!current()) return;
    const answer = await uni.showModal({ title: '确认钱包充值', content: `${chain} · ${latest.network}\n充值 ${value} USDT\n账户：${wallet.account}\n收款：${latest.toAddress}\n合约：${latest.tokenContract}\n需准备 Gas 币；到账以平台钱包流水为准。`, confirmText: '打开钱包' });
    if (!answer.confirm || !current()) return;
    const before = await fetchTerms(chain);
    if (!current()) return;
    if (JSON.stringify(before) !== JSON.stringify(latest) || normalizeAmount(amount.value) !== value || read(userId)) throw new Error('充值条件或金额已变化，请重新核对');
    marker = { attempt: `${Date.now()}-${Math.random().toString(36).slice(2)}`, terms: transferTerms, amount: value, fromAddress: wallet.account };
    save(userId, marker); progress.value = marker; signatureStarted = true;
    const txHash = await wallet.sendTransfer(current);
    marker = { ...marker, txHash };
    if (current()) progress.value = marker;
    save(userId, marker);
    if (current()) uni.showToast({ title: '交易已发出，请核对到账流水', icon: 'none' });
  } catch (cause) {
    if (signatureStarted && walletRequestRejected(cause)) {
      try {
        if (read(userId)?.attempt === marker?.attempt) {
          uni.removeStorageSync(keyFor(userId));
          if (read(userId)) throw new Error('充值记录清理失败，请先核对');
          if (current()) progress.value = undefined;
        }
      } catch (cleanupError) { if (current()) error.value = cleanupError instanceof Error ? cleanupError.message : '充值记录清理失败，请先核对'; return; }
    }
    if (current()) error.value = cause instanceof Error ? cause.message : '钱包操作未确认，请先核对原交易';
  } finally { if (operation.sameSession()) { busy.value = false; if (!current() && page.visible.value) void load(); } }
}
async function acknowledge() {
  const userId = user.realUserId, operation = page.capture(), marker = progress.value;
  if (!userId || !marker || busy.value || !operation.isCurrent()) return;
  try {
    const answer = await uni.showModal({ title: '已核对本笔充值？', content: '请在钱包检查原交易，并在平台钱包流水核对到账。结果仍未知时请取消，避免重复转账。确认后只清除本机提醒。', confirmText: '已核对' });
    if (!answer.confirm || !operation.isCurrent() || read(userId)?.attempt !== marker.attempt) return;
    uni.removeStorageSync(keyFor(userId));
    if (read(userId)) throw new Error('本机记录清理失败，请重新核对');
    progress.value = undefined; void load();
  } catch (cause) { if (operation.isCurrent()) error.value = cause instanceof Error ? cause.message : '本机记录清理失败，请重新核对'; }
}
function copy(value: string) { if (page.visible.value) uni.setClipboardData({ data: value }); }
</script>
<template>
  <view class="direct-recharge">
    <text class="title">钱包直接充值</text>
    <text class="tip">在钱包内打开本页并确认转账；平台确认到账后才增加余额，不会自动创建申报单。</text>
    <text v-if="error" class="warning">{{ error }}</text>
    <wd-button v-if="!terms && !busy" plain size="small" :loading="loading" :disabled="disabled" @click="load">重新读取钱包配置</wd-button>
    <view v-if="progress" class="progress">
      <text class="warning">上一笔充值已发起，请先核对结果，勿重复转账。</text>
      <text selectable>{{ progress.terms.chain }} · {{ progress.terms.network }} · {{ progress.amount }} USDT</text>
      <text selectable class="value">收款：{{ progress.terms.toAddress }}</text>
      <text selectable class="value">付款：{{ progress.fromAddress }}</text>
      <text selectable class="value">{{ progress.txHash ? `交易哈希：${progress.txHash}` : '尚未收到交易哈希，请在钱包内核对原交易' }}</text>
      <wd-button v-if="progress.txHash" plain size="small" @click="copy(progress.txHash)">复制哈希</wd-button>
      <wd-button plain size="small" :disabled="busy" @click="go('/pages/wallet/history')">查看钱包流水</wd-button>
      <wd-button plain size="small" :disabled="busy" @click="acknowledge">已核对本笔充值</wd-button>
    </view>
    <template v-else-if="terms && !recordBlocked">
      <text class="tip">{{ terms.chain }} · {{ terms.network }}，最低 {{ terms.minAmount }} USDT，至少 {{ terms.minConfirmations }} 个确认。</text>
      <wd-input v-model="amount" label="直充金额" type="digit" :disabled="busy" placeholder="USDT" />
      <template v-if="wallets.length">
        <wd-radio-group v-model="walletKey" :disabled="busy"><wd-radio v-for="item in wallets" :key="item.key" :value="item.key">{{ item.label }}</wd-radio></wd-radio-group>
        <wd-button block type="primary" :loading="busy" :disabled="disabled" @click="transfer">连接钱包并充值</wd-button>
      </template>
      <WalletBrowserEntry v-else :chain="chain" path="/pages/wallet/deposit" />
    </template>
  </view>
</template>
<style scoped>
.direct-recharge { padding:24rpx; margin-bottom:20rpx; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); background:#fff; }
.title { font-size:28rpx; font-weight:600; }.tip, .warning { display:block; margin:16rpx 0; font-size:24rpx; line-height:1.6; }
.tip { color:#86909c; }.warning { color:#ff7d00; }.progress { display:flex; flex-direction:column; gap:16rpx; font-size:24rpx; }.value { word-break:break-all; }
</style>

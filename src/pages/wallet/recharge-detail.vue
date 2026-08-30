<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onLoad, onShow } from '@dcloudio/uni-app';
import { usePageOperation } from '@/utils/page-operation';
import { getAccessToken } from '@/service/request/token';
import { fetchRechargeDetail } from '@/service/api/wallet';
import { cancelRechargeWithReceipt, readRechargeCancelReceipts, rechargeCancelMessage, reconcileRechargeCancel, type RechargeCancelReceipt } from '@/utils/recharge-cancel';
import { formatAmount } from '@/utils/format-bridge';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { useNavigationGuards } from '@/utils/navigate';

const { requireLogin } = useNavigationGuards();

const detail = ref<Api.RealWallet.RechargeVO>();
const canceling = ref(false);
const loading = ref(true);
const loadFailed = ref(false);
const userStore = useUserStore();
const id = ref('');
const cancelReceipt = ref<RechargeCancelReceipt>();
const receiptFailed = ref(false);
let loadVersion = 0;
const page = usePageOperation(() => {
  loadVersion++;
  detail.value = undefined;
  cancelReceipt.value = undefined; receiptFailed.value = false;
  canceling.value = false;
  loading.value = false;
  loadFailed.value = false;
});
const canCancel = computed(() => page.visible.value && !!userStore.currentUser && !!detail.value
  && detail.value.status === 'PENDING' && !detail.value.txHash && !loading.value && !loadFailed.value && !canceling.value && !cancelReceipt.value && !receiptFailed.value);

function refreshCancelReceipt() {
  try {
    cancelReceipt.value = userStore.realUserId ? readRechargeCancelReceipts(userStore.realUserId).find(item => String(item.id) === id.value) : undefined;
    receiptFailed.value = false;
  } catch { receiptFailed.value = true; }
}

function copy(value?: string) {
  if (!value || !page.visible.value || !userStore.currentUser) return;
  const operation = page.capture();
  uni.setClipboardData({ data: value, success: () => { if (operation.isCurrent()) uni.showToast({ title: '已复制', icon: 'none' }); } });
}

function formatTime(value?: string | number): string {
  if (!value) return '-';
  const date = typeof value === 'number' ? new Date(value) : /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

async function load() {
  if (!page.visible.value || canceling.value) return;
  if (!id.value) { loading.value = false; return; }
  const operation = page.capture();
  const version = ++loadVersion;
  const current = () => operation.isCurrent() && version === loadVersion;
  loading.value = true;
  loadFailed.value = false;
  try {
    await userStore.init();
    if (!current()) return;
    if (!userStore.currentUser) {
      if (getAccessToken()) throw new Error('账户资料加载失败，请重试');
      await requireLogin(`/pages/wallet/recharge-detail?id=${encodeURIComponent(id.value)}`);
      return;
    }
    refreshCancelReceipt();
    const result = await fetchRechargeDetail(id.value);
    if (!current()) return;
    if (String(result.id) !== id.value) throw new Error('充值回读记录不匹配，请重试');
    detail.value = result;
    if (cancelReceipt.value && !receiptFailed.value) {
      await reconcileRechargeCancel(userStore.realUserId!, id.value, current);
      if (current()) refreshCancelReceipt();
    }
  } catch (error) {
    if (!current()) return;
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '充值详情加载失败', icon: 'none' });
  } finally {
    if (current()) loading.value = false;
  }
}

onLoad(query => { id.value = String(query?.id || ''); });
onShow(load);
onHide(() => { loadVersion++; loading.value = false; });

async function cancel() {
  if (!canCancel.value || !detail.value) return;
  const operation = page.capture();
  const expected = detail.value;
  canceling.value = true;
  try {
    const receipt = await cancelRechargeWithReceipt(expected, operation.isCurrent);
    if (!operation.sameSession()) return;
    refreshCancelReceipt();
    if (receipt && operation.isCurrent()) uni.showToast({ title: rechargeCancelMessage(receipt), icon: 'none' });
  } catch (error) {
    if (!operation.sameSession()) return;
    refreshCancelReceipt();
    if (operation.isCurrent()) uni.showToast({
      title: cancelReceipt.value ? rechargeCancelMessage(cancelReceipt.value) : error instanceof Error ? error.message : '取消申报失败', icon: 'none'
    });
  } finally {
    if (operation.sameSession()) {
      refreshCancelReceipt();
      canceling.value = false;
      if (page.visible.value) await load();
    }
  }
}
</script>

<template>
  <view v-if="detail" class="detail-page yb-page">
    <view class="summary">
      <text class="status">{{ detail.statusText || detail.status }}</text>
      <text class="amount">U {{ formatAmount(detail.amount) }}</text>
      <text class="chain">{{ detail.chainLabel || `USDT-${detail.chain}` }}</text>
    </view>
    <view class="section">
      <text v-if="receiptFailed" class="block">本机取消回执读取失败，已暂停取消操作，请重新读取并核对。</text>
      <text v-if="cancelReceipt" class="block">{{ rechargeCancelMessage(cancelReceipt) }}</text>
      <text v-if="cancelReceipt && detail.status === 'PENDING'" class="block">当前仍显示待到账，不代表上次取消失败，不会据此重发。</text>
      <text v-if="loadFailed" class="block">详情刷新失败，暂时保留上次信息；请重试后再操作。</text>
      <view class="row"><text class="label">充值单 ID</text><text>{{ detail.id }}</text></view>
      <view class="block"><text class="label">平台充值地址</text><text class="block-value">{{ detail.depositAddress || '-' }}</text><wd-button plain size="small" @click="copy(detail.depositAddress)">复制地址</wd-button></view>
      <view class="block"><text class="label">转账备注</text><text class="block-value">{{ detail.memo || String(detail.id) }}</text><wd-button plain size="small" @click="copy(detail.memo || String(detail.id))">复制备注</wd-button></view>
      <view v-if="detail.txHash" class="block"><text class="label">交易哈希</text><text class="block-value">{{ detail.txHash }}</text><wd-button plain size="small" @click="copy(detail.txHash)">复制哈希</wd-button></view>
      <view class="row"><text class="label">创建时间</text><text>{{ formatTime(detail.createdAt) }}</text></view>
      <view class="row"><text class="label">到账时间</text><text>{{ formatTime(detail.confirmedAt) }}</text></view>
      <wd-button block plain :loading="loading" :disabled="canceling" class="cancel-btn" @click="load">刷新状态</wd-button>
      <wd-button v-if="detail.status === 'PENDING'" block plain type="error" :disabled="!canCancel" :loading="canceling" class="cancel-btn" @click="cancel">取消本次申报</wd-button>
    </view>
  </view>
  <view v-else-if="loading" class="loading"><wd-loading size="44rpx" /><text>正在加载充值详情</text></view>
  <EmptyState v-else-if="loadFailed" title="充值详情加载失败" description="请稍后重试" action-text="重试" @action="load" />
  <EmptyState v-else-if="!userStore.currentUser && id" title="请先登录查看充值详情" description="当前尚未读取账号充值记录" action-text="登录或重试" @action="load" />
  <EmptyState v-else title="充值记录不存在" description="请从充值记录列表重新进入" />
</template>

<style lang="scss" scoped>
.detail-page { min-height: 100%; padding: 20rpx 24rpx 32rpx; box-sizing: border-box; }
.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }
.summary, .section { margin-bottom: 20rpx; padding: 24rpx; border:1rpx solid var(--yb-border); border-radius: var(--yb-radius-lg); background: #fff; box-shadow:var(--yb-shadow-card); }
.summary { text-align: center; }
.status, .chain { display: block; color: #86909c; font-size: 23rpx; }
.amount { display: block; margin: 14rpx 0; color: #00b42a; font-size: 52rpx; font-weight: 700; font-family: ui-monospace, monospace; }
.row { display: flex; justify-content: space-between; gap: 20rpx; padding: 20rpx 0; border-bottom: 1rpx solid var(--yb-border); font-size: 23rpx; }
.row > text:last-child { min-width: 0; overflow-wrap: anywhere; text-align: right; }
.label { color: #86909c; }
.block { padding: 20rpx 0; border-bottom: 1rpx solid var(--yb-border); }
.block-value { display: block; margin: 10rpx 0; padding: 14rpx; border-radius: 12rpx; background: #f5f5f2; font-size: 21rpx; font-family: ui-monospace, monospace; word-break: break-all; }
.cancel-btn { margin-top: 20rpx; }
</style>

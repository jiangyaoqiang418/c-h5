<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { cancelRecharge, fetchRechargeDetail } from '@/service/api/wallet';
import { formatAmount } from '@/utils/format-bridge';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { requireLogin } from '@/utils/navigate';

const detail = ref<Api.RealWallet.RechargeVO>();
const canceling = ref(false);
const loading = ref(true);
const loadFailed = ref(false);
const userStore = useUserStore();

function copy(value?: string) {
  if (value) uni.setClipboardData({ data: value, success: () => uni.showToast({ title: '已复制', icon: 'none' }) });
}

function formatTime(value?: string | number): string {
  if (!value) return '-';
  const date = typeof value === 'number' ? new Date(value) : /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

async function load(id: string) {
  loading.value = true;
  loadFailed.value = false;
  try {
    detail.value = await fetchRechargeDetail(id);
  } catch (error) {
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '充值详情加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

onLoad(async query => {
  const id = String(query?.id || '');
  if (!id) {
    loading.value = false;
    return;
  }
  try {
    await userStore.init();
    if (!userStore.currentUser) {
      await requireLogin(`/pages/wallet/recharge-detail?id=${encodeURIComponent(id)}`);
      loading.value = false;
      return;
    }
    await load(id);
  } catch (error) {
    loadFailed.value = true;
    loading.value = false;
    uni.showToast({ title: error instanceof Error ? error.message : '充值详情加载失败', icon: 'none' });
  }
});

function cancel() {
  if (!detail.value || detail.value.status !== 'PENDING' || canceling.value) return;
  uni.showModal({ title: '取消充值申报？', content: '取消后本次申报记录将作废，已发生的链上转账仍可能自动到账。', success: async result => {
    if (!result.confirm || !detail.value || canceling.value) return;
    canceling.value = true;
    try { await cancelRecharge(detail.value.id); await load(String(detail.value.id)); uni.showToast({ title: '已取消申报', icon: 'success' }); }
    catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '取消申报失败', icon: 'none' }); }
    finally { canceling.value = false; }
  } });
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
      <view class="row"><text class="label">充值单 ID</text><text>{{ detail.id }}</text></view>
      <view class="block"><text class="label">平台充值地址</text><text class="block-value">{{ detail.depositAddress || '-' }}</text><wd-button plain size="small" @click="copy(detail.depositAddress)">复制地址</wd-button></view>
      <view class="block"><text class="label">转账备注</text><text class="block-value">{{ detail.memo || String(detail.id) }}</text><wd-button plain size="small" @click="copy(detail.memo || String(detail.id))">复制备注</wd-button></view>
      <view v-if="detail.txHash" class="block"><text class="label">交易哈希</text><text class="block-value">{{ detail.txHash }}</text><wd-button plain size="small" @click="copy(detail.txHash)">复制哈希</wd-button></view>
      <view class="row"><text class="label">创建时间</text><text>{{ formatTime(detail.createdAt) }}</text></view>
      <view class="row"><text class="label">到账时间</text><text>{{ formatTime(detail.confirmedAt) }}</text></view>
      <wd-button v-if="detail.status === 'PENDING'" block plain type="error" :loading="canceling" class="cancel-btn" @click="cancel">取消本次申报</wd-button>
    </view>
  </view>
  <view v-else-if="loading" class="loading"><wd-loading size="44rpx" /><text>正在加载充值详情</text></view>
  <EmptyState v-else-if="loadFailed" title="充值详情加载失败" description="请稍后重试" />
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

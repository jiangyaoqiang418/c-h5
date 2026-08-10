<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from 'vue';
import { createRecharge, fetchRechargeDetail } from '@/service/api/wallet';
import { go } from '@/utils/navigate';

const form = reactive<{ chain: 'TRON' | 'ETH' | 'BSC'; amount: number }>({ chain: 'TRON', amount: 100 });
const submitting = ref(false);
const detail = ref<Api.RealWallet.RechargeVO>();
let pollingTimer: ReturnType<typeof setInterval> | undefined;

const canSubmit = computed(() => Number(form.amount) > 0);

function copy(value?: string) {
  if (!value) return;
  uni.setClipboardData({ data: value, success: () => uni.showToast({ title: '已复制', icon: 'none' }) });
}

async function refreshDetail(showError = true) {
  if (!detail.value?.id) return;
  try {
    detail.value = await fetchRechargeDetail(detail.value.id);
    if (detail.value.status !== 'PENDING' && pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = undefined;
    }
  } catch (error) {
    if (showError) uni.showToast({ title: error instanceof Error ? error.message : '充值状态刷新失败', icon: 'none' });
  }
}

function startPolling() {
  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer = setInterval(() => refreshDetail(false), 5000);
}

async function submit() {
  if (!canSubmit.value) return uni.showToast({ title: '请输入有效充值金额', icon: 'none' });
  submitting.value = true;
  try {
    const id = await createRecharge({ chain: form.chain, amount: Number(form.amount) });
    detail.value = await fetchRechargeDetail(id);
    uni.showToast({ title: '充值单已创建', icon: 'success' });
    if (detail.value.status === 'PENDING') startPolling();
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '充值单创建失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

onUnmounted(() => {
  if (pollingTimer) clearInterval(pollingTimer);
});
</script>

<template>
  <view class="deposit-page">
    <view class="form-card">
      <text class="title">创建链上充值单</text>
      <text class="tip">选择链和申报金额后，按返回的平台地址及备注完成转账。</text>
      <wd-cell title="链选择">
        <wd-radio-group v-model="form.chain" inline>
          <wd-radio value="TRON">TRC20</wd-radio>
          <wd-radio value="ETH">ERC20</wd-radio>
          <wd-radio value="BSC">BSC</wd-radio>
        </wd-radio-group>
      </wd-cell>
      <wd-input v-model="form.amount" label="充值金额" type="digit" placeholder="USDT" />
      <wd-button type="primary" block :disabled="!canSubmit" :loading="submitting" class="submit-btn" @click="submit">创建充值单</wd-button>
    </view>

    <view v-if="detail" class="detail-card">
      <view class="detail-head">
        <text class="title">转账信息</text>
        <wd-tag :type="detail.status === 'CONFIRMED' ? 'success' : detail.status === 'CANCELED' ? 'danger' : 'warning'">
          {{ detail.statusText || detail.status }}
        </wd-tag>
      </view>
      <view class="row"><text class="label">充值单 ID</text><text class="value">{{ detail.id }}</text></view>
      <view class="row"><text class="label">链</text><text class="value">{{ detail.chain }}</text></view>
      <view class="row"><text class="label">金额</text><text class="value">U {{ detail.amount }}</text></view>
      <view class="block-row">
        <text class="label">平台充值地址</text>
        <text class="block-value">{{ detail.depositAddress || '-' }}</text>
        <wd-button plain size="small" @click="copy(detail.depositAddress)">复制地址</wd-button>
      </view>
      <view class="block-row">
        <text class="label">转账备注 Memo</text>
        <text class="block-value">{{ detail.memo || String(detail.id) }}</text>
        <wd-button plain size="small" @click="copy(detail.memo || String(detail.id))">复制备注</wd-button>
      </view>
      <text class="warning">请核对链、地址和备注。转错链或遗漏备注可能导致无法自动到账。</text>
      <wd-button v-if="detail.status === 'PENDING'" block plain class="refresh-btn" @click="refreshDetail()">刷新到账状态</wd-button>
      <wd-button block plain class="refresh-btn" @click="go('/pages/wallet/recharge-list')">查看充值记录</wd-button>
    </view>

    <view v-else class="record-entry" @click="go('/pages/wallet/recharge-list')">
      <text>查看充值记录</text><text>›</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.deposit-page { min-height: 100%; box-sizing: border-box; padding: 16rpx; background: #f7f8fa; }
.form-card, .detail-card, .record-entry { margin-bottom: 16rpx; padding: 24rpx; border-radius: 16rpx; background: #fff; }
.title { font-size: 28rpx; font-weight: 600; color: #1d2129; }
.tip { display: block; margin: 10rpx 0 20rpx; color: #86909c; font-size: 23rpx; line-height: 1.6; }
.submit-btn, .refresh-btn { margin-top: 20rpx; }
.detail-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12rpx; }
.row { display: flex; justify-content: space-between; gap: 20rpx; padding: 18rpx 0; border-bottom: 1rpx solid #f7f8fa; font-size: 24rpx; }
.label { color: #86909c; }
.value { color: #1d2129; font-family: ui-monospace, monospace; }
.block-row { padding: 20rpx 0; border-bottom: 1rpx solid #f7f8fa; }
.block-value { display: block; margin: 10rpx 0; padding: 16rpx; border-radius: 8rpx; background: #f7f8fa; color: #1d2129; font-family: ui-monospace, monospace; font-size: 22rpx; word-break: break-all; }
.warning { display: block; margin-top: 20rpx; color: #ff7d00; font-size: 22rpx; line-height: 1.6; }
.record-entry { display: flex; justify-content: space-between; color: #4e5969; font-size: 24rpx; }
</style>

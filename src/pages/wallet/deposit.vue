<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { walletApi } from '@shared';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const wallets = ref<Api.Wallet.ChainWallet[]>([]);
const amount = ref(100);
const chain = ref<'TRC20' | 'ERC20' | 'BSC'>('TRC20');
const submitting = ref(false);

const chainOptions: { value: 'TRC20' | 'ERC20' | 'BSC'; label: string }[] = [
  { value: 'TRC20', label: 'TRC20 (推荐)' },
  { value: 'ERC20', label: 'ERC20' },
  { value: 'BSC', label: 'BSC' }
];

onMounted(async () => {
  wallets.value = await walletApi.fetchPlatformChainWallets();
});

async function startOkx() {
  if (!userStore.currentUser) return;
  if (amount.value <= 0) {
    uni.showToast({ title: '请输链上充值额', icon: 'none' });
    return;
  }
  const chainMap: Record<'TRC20' | 'ERC20' | 'BSC', Api.Wallet.Chain> = { TRC20: 'TRON', ERC20: 'ETH', BSC: 'BSC' };
  const target = wallets.value.find(w => w.chain === chainMap[chain.value] && w.purpose === 'income');
  if (!target) {
    uni.showToast({ title: '暂无链上充值通道', icon: 'none' });
    return;
  }
  submitting.value = true;
  uni.showLoading({ title: 'OKX 钱包唤起中…' });
  try {
    await new Promise(r => setTimeout(r, 1200));
    const r = await walletApi.depositMock({
      userId: userStore.currentUser.id,
      amount: amount.value.toFixed(2),
      chain: chain.value,
      fromAddress: 'TOkxUser' + userStore.currentUser.id,
      chainWalletId: target.id
    });
    if (r.ok) {
      uni.hideLoading();
      uni.showToast({ title: `链上充值成功 +U ${amount.value}`, icon: 'success' });
    }
  } finally {
    submitting.value = false;
    uni.hideLoading();
  }
}

function copyAddr(addr: string) {
  uni.setClipboardData({ data: addr, success: () => uni.showToast({ title: '已复制', icon: 'none' }) });
}
</script>

<template>
  <view class="deposit-page">
    <view class="okx-card">
      <view class="okx-head">
        <view class="okx-logo">OKX</view>
        <view>
          <text class="title">OKX 钱包快速链上充值</text>
          <text class="sub">原型模拟，1.2s 后到账</text>
        </view>
      </view>
      <wd-input v-model="amount" label="链上充值金额" type="digit" placeholder="USDT" />
      <view class="chain-row">
        <text class="chain-label">链选择</text>
        <view class="chain-options">
          <view
            v-for="o in chainOptions"
            :key="o.value"
            class="chain-opt"
            :class="{ active: chain === o.value }"
            @click="chain = o.value"
          >
            <text>{{ o.label }}</text>
          </view>
        </view>
      </view>
      <wd-button type="primary" block :loading="submitting" @click="startOkx">打开 OKX 钱包链上充值 U {{ amount }}</wd-button>
    </view>

    <view class="addr-section">
      <text class="section-title">链上手动转入</text>
      <view v-for="w in wallets" :key="w.id" class="addr-card">
        <view class="addr-head">
          <wd-tag :type="w.chain === 'TRON' ? 'danger' : w.chain === 'ETH' ? 'primary' : 'warning'" plain size="small">USDT-{{ w.chain }}</wd-tag>
          <text class="addr-name">{{ w.name }}</text>
        </view>
        <text class="addr-text">{{ w.address }}</text>
        <wd-button plain size="small" @click="copyAddr(w.address)">复制地址</wd-button>
        <text class="warn">⚠️ 请仅向此地址转入 USDT-{{ w.chain }}，转错币种将丢失</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.deposit-page {
  min-height: 100vh;
  background: #f7f8fa;
}
.okx-card, .addr-section {
  background: #fff;
  padding: 32rpx;
  margin-bottom: 16rpx;
}
.okx-head {
  display: flex;
  gap: 16rpx;
  align-items: center;
  margin-bottom: 24rpx;
  padding: 24rpx;
  background: linear-gradient(135deg, #fff7e6 0%, #fff 60%);
  border-radius: 16rpx;
}
.okx-logo {
  width: 80rpx;
  height: 80rpx;
  background: #000;
  color: #fff;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-family: ui-monospace, monospace;
}
.title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
}
.sub {
  display: block;
  font-size: 22rpx;
  color: #86909c;
  margin-top: 4rpx;
}
.chain-row {
  padding: 24rpx 0;
}
.chain-label {
  font-size: 24rpx;
  color: #4e5969;
}
.chain-options {
  display: flex;
  gap: 12rpx;
  margin-top: 12rpx;
}
.chain-opt {
  flex: 1;
  text-align: center;
  padding: 16rpx;
  border: 2rpx solid #f2f3f5;
  border-radius: 8rpx;
  font-size: 24rpx;
}
.chain-opt.active {
  border-color: #4d80f0;
  color: #4d80f0;
  background: #f3f7ff;
}
.section-title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
}
.addr-card {
  background: #f7f8fa;
  border-radius: 12rpx;
  padding: 20rpx;
  margin-bottom: 16rpx;
}
.addr-head {
  display: flex;
  gap: 8rpx;
  align-items: center;
  margin-bottom: 8rpx;
}
.addr-name {
  font-size: 22rpx;
  color: #4e5969;
}
.addr-text {
  display: block;
  font-family: ui-monospace, monospace;
  font-size: 22rpx;
  background: #fff;
  padding: 12rpx;
  border-radius: 8rpx;
  word-break: break-all;
  margin: 8rpx 0;
}
.warn {
  font-size: 20rpx;
  color: #ff7d00;
  display: block;
  margin-top: 8rpx;
}
</style>

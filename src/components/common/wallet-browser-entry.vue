<script setup lang="ts">
import { computed } from 'vue';
import { openWalletBrowser, openWalletDownload, walletBrowserOptions, walletPageUrl, type MobileWallet } from '@/utils/wallet-browser';
const props = defineProps<{ chain: string; path: string }>();
const wallets = computed(() => walletBrowserOptions(props.chain));
function open(wallet: MobileWallet) {
  try { openWalletBrowser(wallet, props.path); }
  catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '钱包未能打开，请复制链接', icon: 'none' }); }
}
function copy() {
  try { uni.setClipboardData({ data: walletPageUrl(props.path) }); }
  catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '链接无法复制', icon: 'none' }); }
}
</script>
<template>
  <view class="wallet-entry">
    <text class="tip">当前浏览器未检测到钱包。可在钱包内打开本页，登录后继续原支付进度；打开页面不会自动转账。</text>
    <view v-for="wallet in wallets" :key="wallet.key" class="entry-row">
      <wd-button plain size="small" @click="open(wallet.key)">在 {{ wallet.label }} 中打开</wd-button>
      <wd-button plain size="small" @click="openWalletDownload(wallet.key)">下载钱包</wd-button>
    </view>
    <wd-button plain size="small" @click="copy">复制页面链接</wd-button>
    <text class="tip">未能打开时，可安装钱包后将链接粘贴到钱包的浏览器中。</text>
  </view>
</template>
<style scoped>
.wallet-entry { display: flex; flex-direction: column; gap: 16rpx; }.entry-row { display: flex; flex-wrap: wrap; gap: 12rpx; }.tip { font-size: 24rpx; color: var(--yb-muted); line-height: 1.6; }
</style>

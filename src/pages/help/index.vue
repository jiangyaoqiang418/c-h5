<script setup lang="ts">
import { ref } from 'vue';
import { cmsApi } from '@shared';
import { go } from '@/utils/navigate';

const popupOpen = ref(false);
const detail = ref<Api.Cms.Agreement>();

function returnFromPage() {
  if (getCurrentPages().length > 1) {
    uni.navigateBack();
    return;
  }
  go('/pages/my/index', true);
}

async function openAgreement(kind: Api.Cms.AgreementKind) {
  const r = await cmsApi.fetchAgreementCurrent(kind);
  if (r) {
    detail.value = r;
    popupOpen.value = true;
  }
}

const AGREEMENT_LINKS: { kind: Api.Cms.AgreementKind; label: string }[] = [
  { kind: 'user', label: '用户协议' },
  { kind: 'privacy', label: '隐私政策' },
  { kind: 'service', label: '服务条款' },
  { kind: 'kyc', label: 'KYC 说明' },
  { kind: 'aml', label: '反洗钱政策' }
];
</script>

<template>
  <view class="help-page yb-page">
    <wd-button plain size="small" @click="returnFromPage">返回</wd-button>

    <view class="agreements">
      <text class="ag-title">协议与政策</text>
      <text class="demo-notice">以下协议与政策为演示内容，不代表正式生效的规则。</text>
      <view v-for="a in AGREEMENT_LINKS" :key="a.kind" class="ag-row" @click="openAgreement(a.kind)">
        <text>{{ a.label }}</text>
        <wd-icon name="arrow-right" size="28rpx" color="#a2a7b4" />
      </view>
    </view>

    <wd-popup v-model="popupOpen" position="bottom" :safe-area-inset-bottom="true">
      <view v-if="detail" class="popup">
        <text class="popup-title">{{ detail.title }}</text>
        <text class="demo-notice">以下协议与政策为演示内容，不代表正式生效的规则。</text>
        <text class="popup-meta">版本 {{ detail.version }} · 生效 {{ new Date(detail.effectiveAt).toLocaleDateString() }}</text>
        <text class="popup-content">{{ detail.body }}</text>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
.help-page { min-height: 100%; padding: 20rpx 24rpx 32rpx; }
.agreements { background: #fff; margin-top: 20rpx; padding: 24rpx; border: 1rpx solid var(--yb-border); border-radius: var(--yb-radius-lg); box-shadow: var(--yb-shadow-card); }
.ag-title { display: block; font-size: 26rpx; font-weight: 600; margin-bottom: 16rpx; color: #4e5969; }
.demo-notice { display: block; margin: 16rpx 0; color: var(--yb-muted); font-size: 24rpx; line-height: 1.6; }
.ag-row { display: flex; align-items:center; justify-content: space-between; padding: 20rpx 0; border-bottom: 1rpx solid var(--yb-border); font-size: 26rpx; }
.popup { padding: 32rpx 28rpx calc(32rpx + env(safe-area-inset-bottom)); max-height: 80vh; overflow-y: auto; border-radius: 32rpx 32rpx 0 0; }
.popup-title { display: block; font-size: 32rpx; font-weight: 700; }
.popup-meta { display: block; font-size: 22rpx; color: #86909c; margin: 8rpx 0 24rpx; }
.popup-content { font-size: 26rpx; color: #4e5969; line-height: 1.7; white-space: pre-wrap; }
</style>

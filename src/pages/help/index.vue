<script setup lang="ts">
import { computed, ref } from 'vue';
import { cmsApi } from '@shared';
import { go } from '@/utils/navigate';

const popupOpen = ref(false);
const detail = ref<Api.Cms.Agreement>();
// Render headings and lists as native text nodes; do not inject agreement HTML.
const paragraphs = computed(() => (detail.value?.body || '').split(/\r?\n/).filter(line => line.trim()).map(line => {
  const heading = line.match(/^(#{1,6})\s+(.+)$/);
  const list = line.match(/^\s*(?:[-*+]\s+|\d+\.\s+)(.+)$/);
  const text = heading?.[2] || (list && !/^\s*\d+\.\s+/.test(line) ? `• ${list[1]}` : line);
  return { kind: heading ? 'heading' : list ? 'list' : 'paragraph', segments: text.split(/(\*\*[^*]+\*\*)/).map(value => ({ bold: value.startsWith('**') && value.endsWith('**'), text: value.startsWith('**') && value.endsWith('**') ? value.slice(2, -2) : value })) };
}));

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
    <view class="support-card">
      <text class="support-title">需要帮助？</text>
      <text class="support-note">订单、支付或账户问题，可进入现有会话联系平台客服。</text>
      <view class="support-actions"><wd-button @click="go('/pages/im/real-order-group?support=1')">联系平台客服</wd-button><wd-button plain @click="go('/pages/order/list')">查看我的订单</wd-button></view>
    </view>
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
        <view class="popup-header"><text class="popup-title">{{ detail.title }}</text><view class="popup-close" aria-label="关闭协议" @click="popupOpen = false"><wd-icon name="close" size="20px" /></view></view>
        <scroll-view scroll-y class="popup-body">
        <text class="demo-notice">以下协议与政策为演示内容，不代表正式生效的规则。</text>
        <text class="popup-meta">版本 {{ detail.version }} · 生效 {{ new Date(detail.effectiveAt).toLocaleDateString() }}</text>
        <view class="popup-content"><view v-for="(paragraph, index) in paragraphs" :key="index" :class="['agreement-line', paragraph.kind]"><text v-for="(segment, segmentIndex) in paragraph.segments" :key="segmentIndex" :class="{ bold: segment.bold }">{{ segment.text }}</text></view></view>
        </scroll-view>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
.help-page { min-height: 100%; padding: 20rpx 24rpx 32rpx; }
.support-card { padding: 28rpx; background: var(--yb-surface); border: 1rpx solid var(--yb-border); border-radius: var(--yb-radius-card); }
.support-title { display: block; color: var(--yb-ink); font-size: 32rpx; font-weight: 600; }
.support-note { display: block; margin-top: 12rpx; color: var(--yb-muted); font-size: 26rpx; line-height: 1.6; }
.support-actions { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 24rpx; }
.support-actions :deep(.wd-button) { flex:1; min-width:0; }
.agreements { background: #fff; margin-top: 20rpx; padding: 24rpx; border: 1rpx solid var(--yb-border); border-radius: var(--yb-radius-lg); box-shadow: var(--yb-shadow-card); }
.ag-title { display: block; font-size: 26rpx; font-weight: 600; margin-bottom: 16rpx; color: #4e5969; }
.demo-notice { display: block; margin: 16rpx 0; color: var(--yb-muted); font-size: 24rpx; line-height: 1.6; }
.ag-row { display: flex; align-items:center; justify-content: space-between; padding: 20rpx 0; border-bottom: 1rpx solid var(--yb-border); font-size: 26rpx; }
.popup { display: flex; flex-direction: column; height: 1100rpx; max-height: 80vh; padding: 0 28rpx; box-sizing: border-box; }
.popup-header { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; min-height: 104rpx; border-bottom: 1rpx solid var(--yb-border); gap: 16rpx; }
.popup-close { display: flex; align-items: center; justify-content: center; width: 88rpx; height: 88rpx; flex-shrink: 0; }
.popup-body { flex: 1; min-height: 0; width: 100%; }
.popup-title { display: block; flex:1; min-width:0; overflow-wrap:anywhere; font-size: 32rpx; font-weight: 700; }
.popup-meta { display: block; font-size: 24rpx; color: var(--yb-muted); margin: 8rpx 0 24rpx; }
.popup-content { font-size: 26rpx; color: #4e5969; line-height: 1.7; white-space: pre-wrap; }
.agreement-line { margin-bottom: 20rpx; overflow-wrap: anywhere; }
.heading { margin-top: 28rpx; color: var(--yb-ink); font-size: 30rpx; font-weight: 600; }
.bold { font-weight: 600; }
.popup-content { padding-bottom: 32rpx; }
</style>

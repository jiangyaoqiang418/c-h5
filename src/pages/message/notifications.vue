<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { fetchNotifications, markNotificationRead } from '@/service/api/notify';
import { go } from '@/utils/navigate';
import EmptyState from '@/components/common/empty-state.vue';

const list = ref<Api.RealNotify.Notification[]>([]);
const loading = ref(false);
async function load() { loading.value = true; try { list.value = (await fetchNotifications({ pageNo: 1, pageSize: 50 })).records; } finally { loading.value = false; } }
onShow(load);
function target(notification: Api.RealNotify.Notification): string | undefined {
  const type = notification.bizType || notification.templateCode || '';
  if (type === 'PRODUCT_REVIEW' || /REVIEW/.test(type)) return '/pages/review/list';
  if (/FINANCE|LOCKUP|REDEEM/.test(type)) return '/pages/finance/my-lockups';
  if (/RECHARGE|WITHDRAW|WALLET|FUND/.test(type)) return '/pages/wallet/history';
  if (/KYC/.test(type)) return '/pages/kyc/index';
  if (/BUYER/.test(type)) return '/pages/buyer/apply';
  if (/ORDER|REFUND/.test(type)) return '/pages/order/list';
  return undefined;
}
async function open(notification: Api.RealNotify.Notification) { if (!notification.readFlag) { await markNotificationRead(notification.id); notification.readFlag = true; } const path = target(notification); if (path) go(path); }
</script>

<template><view class="notification-page"><view v-if="list.length" class="list"><view v-for="item in list" :key="item.id" class="item" :class="{ unread: !item.readFlag }" @click="open(item)"><view class="dot" /><view class="body"><text class="title">{{ item.title || '系统通知' }}</text><text class="content">{{ item.content || '暂无内容' }}</text><text class="time">{{ item.createdAt ? new Date(Number(item.createdAt)).toLocaleString() : '' }}</text></view><text class="arrow">›</text></view></view><EmptyState v-else-if="!loading" title="暂无系统通知" /></view></template>
<style lang="scss" scoped>.notification-page { min-height:100%; padding:16rpx; background:#f7f8fa; }.list { background:#fff; border-radius:16rpx; overflow:hidden; }.item { display:flex; align-items:flex-start; padding:24rpx 20rpx; border-bottom:1rpx solid #f2f3f5; gap:14rpx; }.item:last-child { border:none; }.dot { width:12rpx; height:12rpx; margin-top:11rpx; border-radius:50%; background:transparent; flex-shrink:0; }.unread .dot { background:#f53f3f; }.body { flex:1; min-width:0; }.title,.content,.time { display:block; }.title { color:#1d2129; font-size:28rpx; font-weight:600; }.content { color:#4e5969; font-size:24rpx; line-height:1.5; margin-top:6rpx; }.time { color:#86909c; font-size:20rpx; margin-top:8rpx; }.arrow { color:#c9cdd4; font-size:32rpx; margin-top:12rpx; }</style>

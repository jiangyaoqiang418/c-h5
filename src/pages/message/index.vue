<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow, onUnload } from '@dcloudio/uni-app';
import { go } from '@/utils/navigate';
import { fetchConversations, fetchImUnreadCount, fetchNotificationUnreadCount, fetchNotifications } from '@/service/api/notify';
import { imSocket, type ImSocketState } from '@/service/im-socket';
import EmptyState from '@/components/common/empty-state.vue';

interface Category {
  key: string;
  icon: string;
  title: string;
  path: string;
  unread: number;
  latestText: string;
  latestTime: string;
  disabled?: boolean;
}

const categories = ref<Category[]>([]);
const loadFailed = ref(false);
const realtimeState = ref<ImSocketState>('idle');
let unsubscribeRealtime: (() => void) | undefined;
let unsubscribeRealtimeState: (() => void) | undefined;
let realtimeRefreshTimer: ReturnType<typeof setTimeout> | undefined;

function isTransactionNotification(notification: Api.RealNotify.Notification) {
  return /RECHARGE|WITHDRAW|WALLET|FUND|FINANCE|ORDER/.test(notification.bizType || notification.templateCode || '');
}

async function load() {
  loadFailed.value = false;
  try {
    const [notificationCount, imCount, notificationPage, conversationPage] = await Promise.all([
      fetchNotificationUnreadCount(),
      fetchImUnreadCount(),
      fetchNotifications({ pageNo: 1, pageSize: 50 }),
      fetchConversations({ pageNo: 1, pageSize: 1 })
    ]);
    const transactions = notificationPage.records.filter(isTransactionNotification);
    const transactionUnread = transactions.filter(item => !item.readFlag).length;
    const notification = notificationPage.records.find(item => !isTransactionNotification(item));
    const transaction = transactions[0];
    const conversation = conversationPage.records[0];
    categories.value = [
    {
      key: 'system',
      icon: '⚙',
      title: '系统通知',
      path: '/pages/message/notifications',
      unread: Math.max(0, notificationCount - transactionUnread),
      latestText: notification ? `${notification.title || '系统通知'}：${notification.content || ''}` : '暂无系统通知',
      latestTime: notification?.createdAt ? new Date(Number(notification.createdAt)).toLocaleDateString() : '',
      disabled: false
    },
    {
      key: 'txn',
      icon: '▤',
      title: '交易通知',
      path: '/pages/wallet/history',
      unread: transactionUnread,
      latestText: transaction ? `${transaction.title || '交易通知'}：${transaction.content || ''}` : '暂无交易通知',
      latestTime: transaction?.createdAt ? new Date(Number(transaction.createdAt)).toLocaleDateString() : '',
      disabled: false
    },
    {
      key: 'im',
      icon: '◌',
      title: '订单群聊',
      path: '/pages/im/order-list',
      unread: imCount,
      latestText: conversation?.lastMessagePreview || (realtimeState.value === 'ready' ? '订单群消息服务已连接' : realtimeState.value === 'connecting' ? '正在连接实时消息服务…' : '实时消息暂不可用，可手动刷新'),
      latestTime: conversation?.lastMessageAt ? new Date(Number(conversation.lastMessageAt)).toLocaleDateString() : ''
    }
  ];
  } catch (error) {
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '消息加载失败', icon: 'none' });
  }
}

function refreshFromRealtime() {
  if (realtimeRefreshTimer) return;
  realtimeRefreshTimer = setTimeout(() => {
    realtimeRefreshTimer = undefined;
    load();
  }, 80);
}

function ensureRealtimeSubscription() {
  if (!unsubscribeRealtime) {
    unsubscribeRealtime = imSocket.subscribe(event => {
      const type = String((event as { type?: unknown })?.type || '').toUpperCase();
      if (type === 'NOTIFICATION' || type === 'IM_MESSAGE' || type === 'IM_READ' || type === 'IM_RECALL') {
        refreshFromRealtime();
      }
    });
  }
  if (!unsubscribeRealtimeState) {
    unsubscribeRealtimeState = imSocket.subscribeState(state => {
      const changed = realtimeState.value !== state;
      realtimeState.value = state;
      if (changed) refreshFromRealtime();
    });
  }
}

onShow(() => {
  ensureRealtimeSubscription();
  imSocket.start().catch(() => undefined);
  load();
});
onUnload(() => {
  if (realtimeRefreshTimer) clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = undefined;
  unsubscribeRealtime?.();
  unsubscribeRealtime = undefined;
  unsubscribeRealtimeState?.();
  unsubscribeRealtimeState = undefined;
  imSocket.stop();
});

const totalUnread = computed(() =>
  categories.value.reduce((s, c) => s + c.unread, 0)
);

function open(c: Category) {
  if (c.disabled) {
    uni.showToast({ title: '功能开发中', icon: 'none' });
    return;
  }
  if (c.path) {
    go(c.path);
  } else {
    uni.showToast({ title: '功能开发中', icon: 'none' });
  }
}
</script>

<template>
  <view class="msg-page">
    <view class="summary" v-if="totalUnread > 0">
      <view>共 <text class="hl">{{ totalUnread }}</text> 条未读消息</view>
    </view>

    <EmptyState v-if="loadFailed && !categories.length" title="消息加载失败" description="请稍后重试" />
    <view v-else class="cat-list">
      <view
        v-for="c in categories"
        :key="c.key"
        class="cat-row"
        :class="{ disabled: c.disabled }"
        @click="open(c)"
      >
        <view class="cat-left">
          <view class="cat-icon-wrap">
            <text class="local-icon">{{ c.icon }}</text>
            <view v-if="c.unread > 0" class="unread-dot">{{ c.unread > 99 ? '99+' : c.unread }}</view>
          </view>
        </view>
        <view class="cat-middle">
          <text class="cat-title">{{ c.title }}</text>
          <text class="cat-preview">{{ c.latestText }}</text>
        </view>
        <view class="cat-right">
          <text v-if="c.latestTime" class="cat-time">{{ c.latestTime }}</text>
          <text class="cat-arrow">›</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.local-icon { font-size: 34rpx; line-height: 1; }
.msg-page {
  min-height: 100%;
  background: #FAFAF7;
  padding: 20rpx 24rpx;
}
.summary {
  padding: 20rpx 24rpx;
  font-size: 24rpx;
  color: #86909C;
  .hl {
    color: #F53F3F;
    font-weight: 700;
    font-family: ui-monospace, monospace;
  }
}
.cat-list {
  background: #FFFFFF;
  border: 1rpx solid #EDECE6;
  border-radius: 20rpx;
  overflow: hidden;
}
.cat-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 28rpx 24rpx;
  border-bottom: 1rpx solid #EDECE6;
  transition: background 0.15s;
}
.cat-row:last-child { border-bottom: none; }
.cat-row:active { background: #FAFAF7; }
.cat-row.disabled { opacity: 0.5; }

.cat-left {
  flex-shrink: 0;
}
.cat-icon-wrap {
  position: relative;
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  background: #FAFAF7;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #0F111A;
}
.unread-dot {
  position: absolute;
  top: -6rpx;
  right: -6rpx;
  min-width: 36rpx;
  height: 36rpx;
  border-radius: 18rpx;
  background: #F53F3F;
  color: #FFFFFF;
  font-size: 20rpx;
  font-weight: 700;
  padding: 0 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx solid #FFFFFF;
  box-sizing: border-box;
  line-height: 1;
}
.cat-middle {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.cat-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #0F111A;
  letter-spacing: -0.5rpx;
}
.cat-preview {
  font-size: 22rpx;
  color: #86909C;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 380rpx;
}
.cat-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4rpx;
  flex-shrink: 0;
}
.cat-time {
  font-size: 20rpx;
  color: #A8ADB8;
}
.cat-arrow {
  font-size: 32rpx;
  color: #C9CDD4;
  line-height: 1;
}
</style>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onHide, onShow, onUnload } from '@dcloudio/uni-app';
import { go, useNavigationGuards } from '@/utils/navigate';
import { fetchConversations, fetchImUnreadCount, fetchNotificationUnreadCount, fetchNotifications, fetchUnreadNotifications, isTransactionNotification } from '@/service/api/notify';
import { imSocket, type ImSocketState } from '@/service/im-socket';
import { getAccessToken } from '@/service/request/token';
import { useUserStore } from '@/stores';

const { requireLogin } = useNavigationGuards();

interface Category {
  key: string;
  icon: string;
  title: string;
  path: string;
  unread?: number;
  latestText: string;
  latestTime: string;
  disabled?: boolean;
}

function emptyCategories(): Category[] {
  return [
    { key: 'system', icon: 'setting', title: '系统通知', path: '/pages/message/notifications?category=system', latestText: '点击查看系统通知', latestTime: '' },
    { key: 'txn', icon: 'wallet', title: '交易通知', path: '/pages/message/notifications?category=transaction', latestText: '点击查看交易通知', latestTime: '' },
    { key: 'im', icon: 'chat', title: '订单群聊', path: '/pages/im/order-list', latestText: '点击查看订单群聊', latestTime: '' }
  ];
}
const categories = ref<Category[]>(emptyCategories());
const userStore = useUserStore();
const loadFailed = ref(false);
const loading = ref(false);
let refreshRequested = false;
const realtimeState = ref<ImSocketState>('idle');
let unsubscribeRealtime: (() => void) | undefined;
let unsubscribeRealtimeState: (() => void) | undefined;
let realtimeRefreshTimer: ReturnType<typeof setTimeout> | undefined;
let visible = false;
let pageVersion = 0;
let loadSequence = 0;
const authoritativeTotal = ref<number>();
watch(() => userStore.realUserId, () => {
  loadSequence++;
  categories.value = emptyCategories();
  authoritativeTotal.value = undefined;
  loading.value = false;
  refreshRequested = false;
}, { flush: 'sync' });

function formatDate(value?: string | number): string {
  if (value === undefined || value === null || value === '') return '';
  const date = typeof value === 'number' ? new Date(value) : /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
}

async function load() {
  const version = pageVersion;
  const token = getAccessToken();
  try { await userStore.init(); } catch {
    if (visible && version === pageVersion && token === getAccessToken()) loadFailed.value = true;
    return;
  }
  if (!visible || version !== pageVersion || token !== getAccessToken()) return;
  if (loading.value) { refreshRequested = true; return; }
  const sequence = ++loadSequence;
  loadFailed.value = false;
  loading.value = true;
  try {
    if (!userStore.currentUser) {
      categories.value = emptyCategories();
      loadFailed.value = !!getAccessToken();
      realtimeState.value = 'idle';
      return;
    }
    if (!unsubscribeRealtime) {
      ensureRealtimeSubscription();
      imSocket.start().catch(() => undefined);
    }
    const valid = () => sequence === loadSequence && visible;
    let notificationCount: number | undefined;
    let imCount: number | undefined;
    authoritativeTotal.value = undefined;
    const sum = () => {
      authoritativeTotal.value = notificationCount == null || imCount == null ? undefined : notificationCount + imCount;
    };
    const task = async <T,>(request: Promise<T>, apply: (value: T) => void, failed: () => void) => {
      try { const value = await request; if (valid()) apply(value); }
      catch { if (valid()) { loadFailed.value = true; failed(); } }
    };
    await Promise.all([
      task(fetchNotificationUnreadCount(), value => { notificationCount = value; sum(); }, () => { authoritativeTotal.value = undefined; }),
      task(fetchImUnreadCount(), value => { imCount = value; categories.value[2].unread = value; sum(); }, () => { categories.value[2].unread = undefined; }),
      task(fetchNotifications({ pageNo: 1, pageSize: 50 }), page => {
        categories.value.slice(0, 2).forEach((category, index) => {
          const record = page.records.find(item => isTransactionNotification(item) === (index === 1));
          category.latestText = record ? `${record.title || category.title}：${record.content || ''}` : `暂无近期${category.title}，点击查看全部`;
          category.latestTime = formatDate(record?.createdAt);
        });
      }, () => { categories.value.slice(0, 2).forEach(category => { category.latestText = '摘要暂不可用，仍可点击查看通知'; category.latestTime = ''; }); }),
      task(fetchConversations({ pageNo: 1, pageSize: 1 }), page => {
        const conversation = page.records[0];
        categories.value[2].latestText = conversation?.lastMessagePreview || (realtimeState.value === 'ready' ? '订单群消息服务已连接' : '点击查看订单群聊');
        categories.value[2].latestTime = formatDate(conversation?.lastMessageAt);
      }, () => { categories.value[2].latestText = '群聊摘要暂不可用，仍可点击进入'; categories.value[2].latestTime = ''; }),
      task(fetchUnreadNotifications(), unread => {
        categories.value[0].unread = unread.filter(item => !isTransactionNotification(item)).length;
        categories.value[1].unread = unread.filter(isTransactionNotification).length;
      }, () => { categories.value[0].unread = undefined; categories.value[1].unread = undefined; })
    ]);
  } catch (error) {
    if (sequence !== loadSequence || !visible) return;
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '消息加载失败', icon: 'none' });
  } finally {
    if (sequence === loadSequence) {
      loading.value = false;
      if (refreshRequested && visible) { refreshRequested = false; refreshFromRealtime(); }
    }
  }
}

function refreshFromRealtime() {
  if (!visible || realtimeRefreshTimer) return;
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

onShow(async () => {
  visible = true;
  const version = ++pageVersion;
  const token = getAccessToken();
  try {
    await userStore.init();
    if (!visible || version !== pageVersion || token !== getAccessToken()) return;
    if (!userStore.currentUser) {
      categories.value = emptyCategories();
      loadFailed.value = !!getAccessToken();
      return;
    }
  } catch (error) {
    if (!visible || version !== pageVersion || token !== getAccessToken()) return;
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '消息加载失败', icon: 'none' });
    return;
  }
  ensureRealtimeSubscription();
  imSocket.start().catch(() => undefined);
  load();
});
onHide(() => {
  visible = false;
  pageVersion++;
  loadSequence++;
  loading.value = false;
  refreshRequested = false;
  if (realtimeRefreshTimer) clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = undefined;
});
onUnload(() => {
  visible = false;
  pageVersion++;
  loadSequence++;
  if (realtimeRefreshTimer) clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = undefined;
  unsubscribeRealtime?.();
  unsubscribeRealtime = undefined;
  unsubscribeRealtimeState?.();
  unsubscribeRealtimeState = undefined;
  imSocket.stopIfUnused();
});

const totalUnread = computed(() => authoritativeTotal.value);

async function open(c: Category) {
  const version = pageVersion;
  const token = getAccessToken();
  if (c.disabled) {
    uni.showToast({ title: '功能开发中', icon: 'none' });
    return;
  }
  if (c.path) {
    if (await requireLogin(c.path) && visible && version === pageVersion && token === getAccessToken()) go(c.path);
  } else {
    uni.showToast({ title: '功能开发中', icon: 'none' });
  }
}
</script>

<template>
  <view class="msg-page">
    <view class="summary" v-if="totalUnread !== undefined && totalUnread > 0">
      <view>共 <text class="hl">{{ totalUnread }}</text> 条未读消息</view>
    </view>

    <wd-button v-if="loadFailed" block plain :loading="loading" @click="load">部分消息数据暂不可用，点击重试</wd-button>
    <view class="cat-list">
      <view
        v-for="c in categories"
        :key="c.key"
        class="cat-row"
        :class="{ disabled: c.disabled }"
        @click="open(c)"
      >
        <view class="cat-left">
          <view class="cat-icon-wrap">
            <wd-icon :name="c.icon" size="22px" />
            <view v-if="c.unread !== undefined && c.unread > 0" class="unread-dot">{{ c.unread > 99 ? '99+' : c.unread }}</view>
          </view>
        </view>
        <view class="cat-middle">
          <text class="cat-title">{{ c.title }}</text>
          <text class="cat-preview">{{ c.latestText }}</text>
          <text v-if="userStore.currentUser && c.unread === undefined" class="cat-preview">未读数暂不可用</text>
        </view>
        <view class="cat-right">
          <text v-if="c.latestTime" class="cat-time">{{ c.latestTime }}</text>
          <wd-icon name="arrow-right" size="16px" color="#a6a9b1" />
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
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

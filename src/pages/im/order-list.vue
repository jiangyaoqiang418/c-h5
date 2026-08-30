<script setup lang="ts">
import { computed } from 'vue';
import { usePrivatePagedList } from '@/utils/private-paged-list';
import { fetchConversations } from '@/service/api/notify';
import EmptyState from '@/components/common/empty-state.vue';
import { go } from '@/utils/navigate';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const { list, loading, loadFailed, hasMore, load, retry, login, canOpen } = usePrivatePagedList<Api.RealNotify.Conversation>({
  url: '/pages/im/order-list',
  key: item => item.id,
  fetch: (pageNo, pageSize) => fetchConversations({ pageNo, pageSize })
});
const groups = computed(() => list.value.filter(item => item.bizType === 'ORDER'));

function open(group: Api.RealNotify.Conversation) {
  if (!canOpen(group) || group.bizId == null) return;
  go(`/pages/im/real-order-group?orderId=${encodeURIComponent(String(group.bizId))}`);
}
</script>

<template>
  <view class="list-page yb-page">
    <view v-if="groups.length" class="list">
      <view v-for="g in groups" :key="g.id" class="conversation" @click="open(g)">
        <view class="avatar">{{ (g.productTitle || g.title || '订').slice(0, 1) }}</view>
        <view class="info">
          <text class="name">{{ g.productTitle || g.title || '订单群聊' }}</text>
          <text class="preview">{{ g.lastMessagePreview || '暂无消息' }}</text>
          <text class="meta">{{ g.peerName || '平台客服' }} · {{ g.orderStatusText || '订单' }}</text>
        </view>
        <view class="right"><wd-badge v-if="(g.unreadCount || 0) > 0" :value="g.unreadCount" /></view>
      </view>
    </view>
    <EmptyState v-else-if="loadFailed" title="订单群加载失败" description="请稍后重试" />
    <EmptyState v-else-if="!loading && !userStore.currentUser" title="请先登录查看订单群" action-text="登录" @action="login" />
    <EmptyState v-else-if="!loading" :title="hasMore ? '已加载记录中暂无订单群聊' : '暂无订单群聊'" description="下单后会自动创建 买手-顾客-平台 三方群" />
    <view v-else class="loading">订单群加载中…</view>
    <wd-button v-if="loadFailed" block plain :loading="loading" @click="retry">读取失败，点击重试{{ groups.length ? '（当前为上次记录）' : '' }}</wd-button>
    <wd-button v-else-if="userStore.currentUser && hasMore" block plain :loading="loading" @click="load(false)">加载更多</wd-button>
  </view>
</template>

<style lang="scss" scoped>
.list-page {
  min-height: 100%;
  padding: 20rpx 24rpx;
}
.loading { padding: 80rpx 0; text-align: center; color: var(--yb-muted); }
.conversation { display: flex; gap: 16rpx; padding: 24rpx; margin-bottom: 16rpx; background: #fff; border: 1rpx solid var(--yb-border); border-radius: var(--yb-radius-lg); box-shadow: var(--yb-shadow-card); }
.avatar { width: 80rpx; height: 80rpx; border-radius: 50%; background: #1d2027; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 32rpx; flex-shrink: 0; }
.info { flex: 1; min-width: 0; }
.name, .preview, .meta { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name { font-size: 28rpx; color: #1d2129; font-weight: 500; }
.preview { font-size: 24rpx; color: #86909c; margin-top: 4rpx; }
.meta { font-size: 20rpx; color: #c9cdd4; margin-top: 4rpx; }
.right { flex-shrink: 0; }
</style>

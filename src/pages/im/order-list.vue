<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { fetchConversations } from '@/service/api/notify';
import EmptyState from '@/components/common/empty-state.vue';
import { go } from '@/utils/navigate';
import { useUserStore } from '@/stores';

const groups = ref<Api.RealNotify.Conversation[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const userStore = useUserStore();

async function load() {
  loading.value = true;
  loadFailed.value = false;
  try {
    await userStore.init();
    if (!userStore.currentUser) {
      groups.value = [];
      return;
    }
    const page = await fetchConversations({ pageNo: 1, pageSize: 30 });
    groups.value = page.records.filter(item => item.bizType === 'ORDER');
  } catch (error) {
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '订单群加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

onShow(load);

function open(group: Api.RealNotify.Conversation) {
  if (!group.bizId) return;
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
    <EmptyState v-else-if="!loading" title="暂无订单群聊" description="下单后会自动创建 买手-顾客-平台 三方群" />
  </view>
</template>

<style lang="scss" scoped>
.list-page {
  min-height: 100%;
  padding: 20rpx 24rpx;
}
.conversation { display: flex; gap: 16rpx; padding: 24rpx; margin-bottom: 16rpx; background: #fff; border: 1rpx solid var(--yb-border); border-radius: var(--yb-radius-lg); box-shadow: var(--yb-shadow-card); }
.avatar { width: 80rpx; height: 80rpx; border-radius: 50%; background: #1d2027; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 32rpx; flex-shrink: 0; }
.info { flex: 1; min-width: 0; }
.name, .preview, .meta { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name { font-size: 28rpx; color: #1d2129; font-weight: 500; }
.preview { font-size: 24rpx; color: #86909c; margin-top: 4rpx; }
.meta { font-size: 20rpx; color: #c9cdd4; margin-top: 4rpx; }
.right { flex-shrink: 0; }
</style>

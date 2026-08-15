<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { fetchConversationByOrder, fetchMessages } from '@/service/api/notify';

const userStore = useUserStore();
const conversation = ref<Api.RealNotify.Conversation>();
const messages = ref<Api.RealNotify.Message[]>([]);
const scrollIntoView = ref('');

onLoad(async query => {
  const orderId = String(query?.orderId || '');
  if (!orderId) return;
  try {
    conversation.value = await fetchConversationByOrder(orderId);
    const page = await fetchMessages({ conversationId: conversation.value.id, pageNo: 1, pageSize: 50 });
    messages.value = [...page.records].reverse();
    await nextTick();
    const last = messages.value.at(-1);
    if (last) scrollIntoView.value = `message-${last.id}`;
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '订单群加载失败', icon: 'none' });
  }
});

function side(message: Api.RealNotify.Message) {
  if (message.msgType === 'SYSTEM' || message.msgType === 'ORDER_CARD') return 'center';
  return String(message.senderId) === String(userStore.currentUser?.id) ? 'right' : 'left';
}
</script>

<template>
  <view v-if="conversation" class="page">
    <view class="header"><text class="title">{{ conversation.productTitle || conversation.title || '订单群聊' }}</text><text class="meta">订单 {{ conversation.orderNo || conversation.bizId }} · {{ conversation.orderStatusText || '—' }}</text></view>
    <scroll-view scroll-y class="messages" :scroll-into-view="scrollIntoView">
      <view v-for="message in messages" :id="`message-${message.id}`" :key="message.id" class="row" :class="side(message)">
        <text v-if="side(message) === 'left'" class="sender">{{ message.senderName || '系统' }}</text>
        <view class="bubble" :class="side(message)"><text>{{ message.recalled ? '消息已撤回' : (message.content || (message.msgType === 'ORDER_CARD' ? '订单消息' : '系统消息')) }}</text></view>
      </view>
      <view v-if="!messages.length" class="empty">暂无历史消息</view>
    </scroll-view>
  </view>
  <EmptyState v-else title="三方群不存在" />
</template>

<style lang="scss" scoped>
.page { height: 100%; display: flex; flex-direction: column; background: #f7f8fa; }
.header { padding: 20rpx 32rpx; background: #fff; border-bottom: 1rpx solid #f2f3f5; }.title,.meta,.sender { display:block; }.title{font-size:30rpx;font-weight:600}.meta,.sender{font-size:22rpx;color:#86909c;margin-top:4rpx}.messages{flex:1;min-height:0;padding:16rpx}.row{display:flex;flex-direction:column;margin-bottom:20rpx}.row.right{align-items:flex-end}.row.center{align-items:center}.bubble{max-width:75%;padding:16rpx 20rpx;border-radius:16rpx;background:#fff;color:#1d2129;font-size:26rpx;word-break:break-word}.bubble.right{background:#4d80f0;color:#fff}.bubble.center{background:#f2f3f5;color:#86909c;font-size:22rpx}.empty{text-align:center;color:#86909c;padding:60rpx 0}
</style>

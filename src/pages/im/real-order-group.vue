<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { fetchConversationByOrder, fetchMessages } from '@/service/api/notify';
import { imSocket } from '@/service/im-socket';

const userStore = useUserStore();
const conversation = ref<Api.RealNotify.Conversation>();
const messages = ref<Api.RealNotify.Message[]>([]);
const scrollIntoView = ref('');
let unsubscribe: (() => void) | undefined;

interface OrderCardContent {
  productTitle?: string;
  orderNo?: string;
  statusText?: string;
  amount?: string | number;
}

function parseOrderCard(content?: string): OrderCardContent | undefined {
  try {
    const parsed = JSON.parse(content || '{}') as OrderCardContent;
    return Object.keys(parsed).length ? parsed : undefined;
  } catch {
    return undefined;
  }
}

const latestOrderCard = computed(() => {
  const message = messages.value.find(item => item.msgType === 'ORDER_CARD');
  return message ? parseOrderCard(message.content) : undefined;
});
const headerTitle = computed(() => latestOrderCard.value?.productTitle || conversation.value?.productTitle || conversation.value?.title || '订单群聊');
const headerMeta = computed(() => {
  const orderNo = latestOrderCard.value?.orderNo || conversation.value?.orderNo || conversation.value?.bizId;
  const status = latestOrderCard.value?.statusText || conversation.value?.orderStatusText || '—';
  return `订单 ${orderNo || '—'} · ${status}`;
});

function appendRealtimeMessage(event: unknown) {
  const wrapper = event as { data?: unknown; message?: unknown };
  const candidate = (wrapper?.data || wrapper?.message || event) as Partial<Api.RealNotify.Message>;
  if (!candidate || typeof candidate !== 'object' || String(candidate.conversationId) !== String(conversation.value?.id) || candidate.id == null) return;
  if (messages.value.some(item => String(item.id) === String(candidate.id))) return;
  messages.value.push(candidate as Api.RealNotify.Message);
  nextTick(() => { scrollIntoView.value = `message-${candidate.id}`; });
}

onLoad(async query => {
  const orderId = String(query?.orderId || '');
  if (!orderId) return;
  try {
    conversation.value = await fetchConversationByOrder(orderId);
    const page = await fetchMessages({ conversationId: conversation.value.id, pageNo: 1, pageSize: 50 });
    messages.value = [...page.records].reverse();
    unsubscribe = imSocket.subscribe(appendRealtimeMessage);
    imSocket.start().catch(() => undefined);
    await nextTick();
    const last = messages.value.at(-1);
    if (last) scrollIntoView.value = `message-${last.id}`;
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '订单群加载失败', icon: 'none' });
  }
});

onUnload(() => {
  unsubscribe?.();
  unsubscribe = undefined;
  imSocket.stop();
});

function side(message: Api.RealNotify.Message) {
  if (message.msgType === 'SYSTEM' || message.msgType === 'ORDER_CARD') return 'center';
  return String(message.senderId) === String(userStore.currentUser?.id) ? 'right' : 'left';
}

function messageText(message: Api.RealNotify.Message) {
  if (message.recalled) return '消息已撤回';
  if (message.msgType !== 'ORDER_CARD') return message.content || '系统消息';

  try {
    const card = parseOrderCard(message.content) || {};
    const title = card.productTitle || card.orderNo || '订单消息';
    const detail = card.statusText || (card.amount == null ? '' : `金额 ${card.amount} U`);
    return detail ? `${title} · ${detail}` : title;
  } catch {
    return message.content || '订单消息';
  }
}
</script>

<template>
  <view v-if="conversation" class="page">
    <view class="header"><text class="title">{{ headerTitle }}</text><text class="meta">{{ headerMeta }}</text></view>
    <scroll-view scroll-y class="messages" :scroll-into-view="scrollIntoView">
      <view v-for="message in messages" :id="`message-${message.id}`" :key="message.id" class="row" :class="side(message)">
        <text v-if="side(message) === 'left'" class="sender">{{ message.senderName || '系统' }}</text>
        <view class="bubble" :class="side(message)"><text>{{ messageText(message) }}</text></view>
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

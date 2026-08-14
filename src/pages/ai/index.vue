<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { aiApi } from '@shared';
import { go } from '@/utils/navigate';
import AiSuggestionList from '@/components/ai/ai-suggestion-list.vue';

interface BotMsg {
  role: 'bot';
  text: string;
  suggestions?: aiApi.AiSearchResult;
}
interface UserMsg {
  role: 'user';
  text: string;
}
interface LoadingMsg {
  role: 'loading';
}
type ChatMsg = BotMsg | UserMsg | LoadingMsg;

const PRESETS = ['iPhone 16 Pro', '北海道直邮草莓', '海蓝宝石原石', '日本电饭煲', 'LV 经典款', '法国红酒'];

const messages = ref<ChatMsg[]>([
  {
    role: 'bot',
    text: '你好呀 👋 我是油宝 AI 导购。想找什么可以直接告诉我，或者试试下面的推荐 —— 我会帮你在全球买手网络里找到最合适的选项。'
  }
]);
const input = ref('');
const scrollTop = ref(0);
const scrollTs = ref(0);

async function scrollToBottom() {
  await nextTick();
  scrollTs.value = Date.now();
  scrollTop.value = 999999;
}

async function send(text?: string) {
  const t = (text || input.value).trim();
  if (!t) return;
  input.value = '';
  messages.value.push({ role: 'user', text: t });
  messages.value.push({ role: 'loading' });
  await scrollToBottom();
  try {
    const result = await aiApi.aiSearchMock(t);
    const idx = messages.value.findIndex(m => m.role === 'loading');
    if (idx !== -1) messages.value.splice(idx, 1);
    messages.value.push({
      role: 'bot',
      text: result.suggestions.length
        ? `我为你找到 ${result.suggestions.length} 件相关商品，看看有没有心仪的：`
        : '暂时没找到完全匹配的商品，要不要发布一个求购？全球买手 24h 接单。',
      suggestions: result
    });
  } finally {
    await scrollToBottom();
  }
}

function inducePurchaseFrom(text: string) {
  go(`/pages/purchase/create?productHint=${encodeURIComponent(text)}`);
}
</script>

<template>
  <view class="chat-page">
    <scroll-view scroll-y class="msg-scroll" :scroll-top="scrollTop" :scroll-with-animation="true">
      <view class="msg-list">
        <view v-for="(m, i) in messages" :key="i" class="msg-row" :class="m.role">
          <view v-if="m.role === 'bot'" class="bubble bot">
            <view class="bot-avatar"><text>✦</text></view>
            <view class="bubble-body">
              <text class="bubble-text">{{ m.text }}</text>
              <AiSuggestionList
                v-if="m.suggestions"
                :result="m.suggestions"
                :loading="false"
              />
            </view>
          </view>
          <view v-else-if="m.role === 'user'" class="bubble user">
            <text class="bubble-text">{{ m.text }}</text>
          </view>
          <view v-else class="bubble bot loading">
            <view class="bot-avatar"><text>✦</text></view>
            <view class="dots"><text class="dot">·</text><text class="dot">·</text><text class="dot">·</text></view>
          </view>
        </view>

        <!-- 首屏推荐 chips -->
        <view v-if="messages.length === 1" class="preset-row">
          <text class="preset-label">试试这些：</text>
          <view class="preset-scroll">
            <view class="preset-chips">
              <view v-for="p in PRESETS" :key="p" class="preset-chip" @click="send(p)">
                <text>{{ p }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </scroll-view>

    <view class="input-bar">
      <view class="input-wrap">
        <input
          v-model="input"
          class="input"
          placeholder="有什么想要的，尽管说 ✨"
          confirm-type="send"
          @confirm="() => send()"
        />
        <view class="send-btn" :class="{ active: input.trim() }" @click="() => send()">
          <text>➤</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  /* 宿主已扣除原生导航栏；100vh 会使输入栏在 H5/App 向下溢出。 */
  height: 100%;
  min-height: 0;
  background: #FAFAF7;
}
.msg-scroll {
  flex: 1;
  min-height: 0;
}
.msg-list {
  padding: 32rpx 24rpx 32rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.msg-row {
  display: flex;
  &.user { justify-content: flex-end; }
  &.bot, &.loading { justify-content: flex-start; }
}
.bubble {
  max-width: 84%;
  display: flex;
  gap: 12rpx;
  align-items: flex-start;
}
.bubble.bot {
  align-items: flex-start;
}
.bubble.user {
  background: #4D80F0;
  color: #fff;
  padding: 20rpx 24rpx;
  border-radius: 28rpx;
  border-bottom-right-radius: 8rpx;
}
.bubble.user .bubble-text {
  color: #fff;
  font-size: 28rpx;
  line-height: 1.5;
}
.bot-avatar {
  width: 56rpx;
  height: 56rpx;
  min-width: 56rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #6B4EFF 0%, #4D80F0 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.bubble-body {
  background: #FFFFFF;
  border: 1rpx solid #EDECE6;
  padding: 20rpx 24rpx;
  border-radius: 28rpx;
  border-bottom-left-radius: 8rpx;
  min-width: 0;
  flex: 1;
}
.bubble-text {
  font-size: 28rpx;
  color: #0F111A;
  line-height: 1.5;
  display: block;
}
.bubble.loading {
  align-items: center;
}
.bubble.loading .dots {
  background: #FFFFFF;
  border: 1rpx solid #EDECE6;
  padding: 20rpx 24rpx;
  border-radius: 28rpx;
  border-bottom-left-radius: 8rpx;
  display: flex;
  gap: 4rpx;
}
.dot {
  color: #86909C;
  font-size: 40rpx;
  line-height: 1;
  animation: blink 1.4s infinite;
}
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink {
  0%, 60%, 100% { opacity: 0.3; }
  30% { opacity: 1; }
}

.preset-row {
  padding: 12rpx 0 0;
}
.preset-label {
  display: block;
  font-size: 22rpx;
  color: #86909C;
  margin-bottom: 12rpx;
  padding: 0 8rpx;
}
.preset-scroll {
  width: 100%;
}
.preset-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  padding: 0 8rpx 8rpx;
}
.preset-chip {
  display: inline-flex;
  flex-shrink: 0;
  padding: 14rpx 24rpx;
  background: #FFFFFF;
  border: 1rpx solid #EDECE6;
  border-radius: 999rpx;
  font-size: 24rpx;
  color: #0F111A;
  white-space: nowrap;
}
.preset-chip text {
  white-space: nowrap;
}

.input-bar {
  background: #FFFFFF;
  border-top: 1rpx solid #EDECE6;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
}
.input-wrap {
  display: flex;
  align-items: center;
  gap: 12rpx;
  background: #FAFAF7;
  border-radius: 40rpx;
  padding: 8rpx 8rpx 8rpx 24rpx;
}
.input {
  flex: 1;
  height: 72rpx;
  font-size: 28rpx;
  color: #0F111A;
  background: transparent;
}
.send-btn {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: #C9CDD4;
  color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}
.send-btn.active {
  background: #0F111A;
}
</style>

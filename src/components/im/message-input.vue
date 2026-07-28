<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  disabled?: boolean;
  disabledText?: string;
}
const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  disabledText: '当前会话已禁用发送'
});
const emit = defineEmits<{
  (e: 'send', payload: { type: Api.Im.MessageType; content?: string; mediaUrl?: string }): void;
}>();

const text = ref('');

function send() {
  const content = text.value.trim();
  if (!content) return;
  if (props.disabled) {
    uni.showToast({ title: props.disabledText, icon: 'none' });
    return;
  }
  emit('send', { type: 'text', content });
  text.value = '';
}

function sendImage() {
  if (props.disabled) return;
  const url = `https://picsum.photos/seed/im-${Date.now()}/360/360`;
  emit('send', { type: 'image', mediaUrl: url });
}
</script>

<template>
  <view class="msg-input">
    <view class="row">
      <view class="ic-btn" @click="sendImage">🖼</view>
      <input
        v-model="text"
        class="input"
        :placeholder="disabled ? disabledText : '输入消息…'"
        :disabled="disabled"
        confirm-type="send"
        @confirm="send"
      />
      <view class="send-btn" :class="{ disabled: !text.trim() || disabled }" @click="send">发送</view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.msg-input {
  background: #fff;
  border-top: 1rpx solid #f2f3f5;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
}
.row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.ic-btn {
  width: 64rpx;
  height: 64rpx;
  background: #f7f8fa;
  border-radius: 32rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
}
.input {
  flex: 1;
  background: #f7f8fa;
  border-radius: 32rpx;
  padding: 16rpx 24rpx;
  font-size: 26rpx;
  height: 64rpx;
  box-sizing: border-box;
}
.send-btn {
  background: #4d80f0;
  color: #fff;
  border-radius: 32rpx;
  padding: 16rpx 28rpx;
  font-size: 26rpx;
  font-weight: 600;
}
.send-btn.disabled {
  background: #c9cdd4;
}
</style>

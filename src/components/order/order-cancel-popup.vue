<script setup lang="ts">
import { ref } from 'vue';
import { onHide, onUnload } from '@dcloudio/uni-app';
import { onSessionChanged } from '@/service/request/token';
const visible = ref(false);
const reason = ref('');
let resolveRequest: ((value?: string) => void) | undefined;
function close() { visible.value = false; reason.value = ''; resolveRequest?.(); resolveRequest = undefined; }
function request(): Promise<string | undefined> {
  close(); visible.value = true;
  return new Promise(resolve => { resolveRequest = resolve; });
}
function confirm() {
  const value = reason.value.trim();
  if (!value) return uni.showToast({ title: '请填写取消原因', icon: 'none' });
  const resolve = resolveRequest; resolveRequest = undefined; close(); resolve?.(value);
}
const unsubscribe = onSessionChanged(close);
onHide(close);
onUnload(() => { close(); unsubscribe(); });
defineExpose({ request, close });
</script>
<template>
  <wd-popup v-model="visible" position="bottom" :safe-area-inset-bottom="true" @close="close">
    <view class="cancel-popup">
      <text class="title">取消订单</text>
      <wd-textarea v-model="reason" placeholder="请输入取消原因（必填）" :maxlength="200" show-word-limit />
      <view class="actions"><wd-button plain @click="close">暂不取消</wd-button><wd-button type="primary" @click="confirm">确认取消</wd-button></view>
    </view>
  </wd-popup>
</template>
<style scoped>
.cancel-popup { padding: 32rpx; }
.title { display: block; margin-bottom: 24rpx; font-size: 30rpx; font-weight: 600; }
.actions { display: flex; justify-content: flex-end; gap: 16rpx; margin-top: 24rpx; }
</style>

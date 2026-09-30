<script setup lang="ts">
import { ref } from 'vue';
import { onHide, onUnload } from '@dcloudio/uni-app';
import { fetchPayPasswordStatus } from '@/service/api/pay-password';
import { getAccessToken, onSessionChanged } from '@/service/request/token';
const visible = ref(false);
const value = ref('');
const title = ref('请输入支付密码');
let version = 0;
let resolveRequest: ((value?: string) => void) | undefined;
async function request(redirect = '', action = ''): Promise<string | undefined> {
  close();
  const current = ++version;
  const token = getAccessToken();
  const status = await fetchPayPasswordStatus();
  if (current !== version || token !== getAccessToken() || !token) return;
  if (status.hasSet === false) {
    uni.showToast({ title: '请先设置支付密码', icon: 'none' });
    uni.navigateTo({ url: `/pages/my/pay-password${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}` });
    return;
  }
  if (status.hasSet !== true || typeof status.locked !== 'boolean') throw new Error('支付密码状态暂未确认，请重试');
  if (status.locked) {
    const time = status.lockedUntil ? new Date(Number(status.lockedUntil)).toLocaleString() : '';
    uni.showToast({ title: time ? `支付密码锁定至 ${time}` : '支付密码已锁定，请稍后重试或重置', icon: 'none' });
    return;
  }
  title.value = action ? `${action}：请输入支付密码` : '请输入支付密码';
  value.value = ''; visible.value = true;
  return new Promise(resolve => { resolveRequest = resolve; });
}
function close() { version++; visible.value = false; value.value = ''; resolveRequest?.(); resolveRequest = undefined; }
function confirm() {
  if (!/^\d{6}$/.test(value.value)) return uni.showToast({ title: '请输入6位数字支付密码', icon: 'none' });
  const password = value.value, resolve = resolveRequest;
  resolveRequest = undefined; close(); resolve?.(password);
}
const unsubscribe = onSessionChanged(close);
onHide(close);
onUnload(() => { close(); unsubscribe(); });
defineExpose({ request, close });
</script>
<template><wd-popup v-model="visible" position="bottom" :safe-area-inset-bottom="true" @close="close"><view class="popup"><text class="title">{{ title }}</text><wd-input v-model="value" type="number" password :maxlength="6" placeholder="6位数字支付密码" /><view class="actions"><wd-button plain block @click="close">取消</wd-button><wd-button type="primary" block @click="confirm">确认</wd-button></view></view></wd-popup></template>
<style scoped>.popup{padding:32rpx}.title{display:block;font-size:30rpx;font-weight:600;margin-bottom:20rpx}.actions{display:flex;gap:16rpx;margin-top:24rpx}.actions>*{flex:1}</style>

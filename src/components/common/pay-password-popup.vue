<script setup lang="ts">
import { ref } from 'vue';
import { fetchPayPasswordStatus } from '@/service/api/pay-password';
const visible = ref(false); const value = ref(''); let resolveRequest: ((value?: string) => void) | undefined;
async function request(redirect = ''): Promise<string | undefined> {
  const status = await fetchPayPasswordStatus();
  if (!status.hasSet) {
    uni.showToast({ title: '请先设置支付密码', icon: 'none' });
    uni.navigateTo({ url: `/pages/my/pay-password${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}` });
    return;
  }
  if (status.locked) { uni.showToast({ title: '支付密码已锁定，请稍后重试或重置', icon: 'none' }); return; }
  value.value = ''; visible.value = true;
  return new Promise(resolve => { resolveRequest = resolve; });
}
function close() { visible.value = false; value.value = ''; resolveRequest?.(); resolveRequest = undefined; }
function confirm() {
  if (!/^\d{6}$/.test(value.value)) return uni.showToast({ title: '请输入6位数字支付密码', icon: 'none' });
  const password = value.value; visible.value = false; value.value = ''; resolveRequest?.(password); resolveRequest = undefined;
}
defineExpose({ request });
</script>
<template><wd-popup v-model="visible" position="bottom" :safe-area-inset-bottom="true" @close="close"><view class="popup"><text class="title">请输入支付密码</text><wd-input v-model="value" type="number" password :maxlength="6" placeholder="6位数字支付密码" /><view class="actions"><wd-button plain block @click="close">取消</wd-button><wd-button type="primary" block @click="confirm">确认</wd-button></view></view></wd-popup></template>
<style scoped>.popup{padding:32rpx}.title{display:block;font-size:30rpx;font-weight:600;margin-bottom:20rpx}.actions{display:flex;gap:16rpx;margin-top:24rpx}.actions>*{flex:1}</style>

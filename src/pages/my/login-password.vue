<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { setLoginPassword } from '@/service/api/auth';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const form = reactive({ email: '', password: '', confirmPassword: '' });
const loading = ref(false);
const saved = ref(false);
const redirect = ref('/pages/my/index');
const needsEmail = computed(() => userStore.currentUser?.email == null);
const valid = computed(() => {
  const emailOk = !needsEmail.value || /^\S+@\S+\.\S+$/.test(form.email.trim());
  return emailOk && form.password.length >= 6 && form.password.length <= 64 && form.password === form.confirmPassword;
});

function safeTarget(value: unknown) {
  const target = String(value || '');
  return /^\/pages\/[a-z0-9/-]+(?:\?|$)/i.test(target) && !target.startsWith('/pages/auth/') && !target.startsWith('/pages/my/login-password') ? target : '/pages/my/index';
}
function leave() {
  if (redirect.value.startsWith('/pages/my/index')) uni.switchTab({ url: '/pages/my/index' });
  else uni.redirectTo({ url: redirect.value });
}
onLoad(query => { try { redirect.value = safeTarget(query?.redirect ? decodeURIComponent(String(query.redirect)) : ''); } catch { redirect.value = '/pages/my/index'; } });
onShow(async () => {
  try { await userStore.refreshProfile(); } catch { return; }
  if (userStore.currentUser?.loginPasswordSet === true) leave();
});

async function submit() {
  if (!valid.value || loading.value || saved.value) return;
  loading.value = true;
  try {
    await setLoginPassword({ ...(needsEmail.value ? { email: form.email.trim() } : {}), password: form.password, confirmPassword: form.confirmPassword });
    saved.value = true;
    form.password = ''; form.confirmPassword = '';
    uni.showToast({ title: '登录密码设置成功', icon: 'success' });
    try { await userStore.refreshProfile(); } catch { uni.showToast({ title: '已保存，账户状态刷新失败，请返回后重试', icon: 'none' }); return; }
    leave();
  } catch (error) {
    const message = error instanceof Error ? error.message : '设置失败';
    if (message.includes('已设置')) { try { await userStore.refreshProfile(); } catch { /* 状态由下次进入刷新。 */ } leave(); return; }
    uni.showToast({ title: message, icon: 'none' });
  } finally { loading.value = false; }
}
</script>

<template>
  <view class="page yb-page"><view class="card">
    <text class="title">设置平台登录密码</text>
    <text class="desc">设置后可使用邮箱和密码登录，当前会话不会退出。</text>
    <wd-input v-if="needsEmail" v-model="form.email" label="邮箱" placeholder="请输入登录邮箱" />
    <wd-input v-else :model-value="userStore.currentUser?.email || ''" label="邮箱" readonly />
    <wd-input v-model="form.password" label="登录密码" type="password" placeholder="6-64位" />
    <wd-input v-model="form.confirmPassword" label="确认密码" type="password" />
    <wd-button type="primary" block :disabled="!valid || saved" :loading="loading" @click="submit">{{ saved ? '已保存' : '保存' }}</wd-button>
  </view></view>
</template>

<style scoped>.page{padding:24rpx}.card{background:#fff;border:1rpx solid var(--yb-border);border-radius:var(--yb-radius-lg);padding:28rpx}.title{display:block;font-size:34rpx;font-weight:700}.desc{display:block;color:#86909c;font-size:24rpx;line-height:1.5;margin:12rpx 0 20rpx}</style>

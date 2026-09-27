<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onHide, onLoad, onShow } from '@dcloudio/uni-app';
import { setLoginPassword } from '@/service/api/auth';
import { getAccessToken } from '@/service/request/token';
import { useUserStore } from '@/stores';
import { usePageOperation } from '@/utils/page-operation';

const userStore = useUserStore();
const form = reactive({ email: '', password: '', confirmPassword: '' });
const loading = ref(false);
const checking = ref(true);
const stateReady = ref(false);
const stateError = ref('');
const saved = ref(false);
const redirect = ref('/pages/my/index');
const needsEmail = computed(() => userStore.currentUser?.email == null);
const valid = computed(() => {
  const emailOk = !needsEmail.value || /^\S+@\S+\.\S+$/.test(form.email.trim());
  return emailOk && form.password.length >= 6 && form.password.length <= 64 && form.password === form.confirmPassword;
});
let pendingSubmit: { token: string; task: Promise<void> } | undefined;
let loadSequence = 0;

function clearForm() { form.email = ''; form.password = ''; form.confirmPassword = ''; }
const page = usePageOperation(() => {
  loadSequence++;
  clearForm();
  loading.value = false;
  checking.value = false;
  stateReady.value = false;
  stateError.value = '';
  saved.value = false;
});
const canSubmit = computed(() => page.visible.value && stateReady.value && userStore.currentUser?.loginPasswordSet === false
  && valid.value && !checking.value && !loading.value && !saved.value);
onHide(clearForm);

function safeTarget(value: unknown) {
  const target = String(value || '');
  return /^\/pages\/[a-z0-9/-]+(?:\?|$)/i.test(target) && !target.startsWith('/pages/auth/') && !target.startsWith('/pages/my/login-password') ? target : '/pages/my/index';
}
function leave() {
  if (redirect.value.startsWith('/pages/my/index')) uni.switchTab({ url: '/pages/my/index' });
  else uni.redirectTo({ url: redirect.value });
}
onLoad(query => { try { redirect.value = safeTarget(query?.redirect ? decodeURIComponent(String(query.redirect)) : ''); } catch { redirect.value = '/pages/my/index'; } });
async function loadState() {
  const sequence = ++loadSequence;
  const operation = page.capture();
  const token = getAccessToken();
  const userId = userStore.realUserId;
  const current = () => sequence === loadSequence && operation.isCurrent() && token === getAccessToken()
    && (userId === undefined || userId === userStore.realUserId);
  checking.value = true;
  stateReady.value = false;
  stateError.value = '';
  try {
    if (!token) { stateError.value = '请先登录，再读取账号状态'; return; }
    if (pendingSubmit?.token === token) await pendingSubmit.task;
    if (!current()) return;
    await userStore.refreshProfile();
    if (!current()) return;
    if (userStore.currentUser?.loginPasswordSet === true) { leave(); return; }
    if (userStore.currentUser?.loginPasswordSet !== false) {
      stateError.value = '未取得登录密码状态，请重新读取';
      return;
    }
    if (saved.value) {
      stateError.value = '密码已保存，但账号状态尚未更新，请重新读取';
      return;
    }
    stateReady.value = true;
  } catch {
    if (current()) stateError.value = '账号状态读取失败，请重新读取';
  } finally {
    if (current()) checking.value = false;
  }
}
onShow(() => { void loadState(); });

async function submit() {
  if (!canSubmit.value || pendingSubmit?.token === getAccessToken()) return;
  const operation = page.capture();
  const token = getAccessToken();
  const userId = userStore.realUserId;
  if (!token || !userId) return;
  const current = () => operation.isCurrent() && token === getAccessToken() && userId === userStore.realUserId;
  const params = { ...(needsEmail.value ? { email: form.email.trim() } : {}), password: form.password, confirmPassword: form.confirmPassword };
  loading.value = true;
  stateError.value = '';
  const task = (async () => {
    try {
      await setLoginPassword(params);
      if (!current()) return;
      saved.value = true;
      stateReady.value = false;
      clearForm();
      uni.showToast({ title: '登录密码设置成功', icon: 'success' });
      try { await userStore.refreshProfile(); } catch {
        if (current()) stateError.value = '密码已保存，账号状态读取失败，请重新读取';
        return;
      }
      if (!current()) return;
      if (userStore.currentUser?.loginPasswordSet === true) leave();
      else stateError.value = '密码已保存，但账号状态尚未更新，请重新读取';
    } catch (error) {
      if (!current()) return;
      const message = error instanceof Error ? error.message : '设置失败';
      if (message.includes('已设置')) {
        stateReady.value = false;
        try { await userStore.refreshProfile(); } catch {
          if (current()) stateError.value = '账号状态读取失败，请重新读取';
          return;
        }
        if (!current()) return;
        if (userStore.currentUser?.loginPasswordSet === true) leave();
        else stateError.value = '请重新读取登录密码状态';
        return;
      }
      stateError.value = message;
    } finally {
      if (operation.sameSession() && userId === userStore.realUserId) loading.value = false;
    }
  })();
  pendingSubmit = { token, task };
  try { await task; } finally { if (pendingSubmit?.task === task) pendingSubmit = undefined; }
}
</script>

<template>
  <view class="page yb-page"><view class="card">
    <text class="title">设置平台登录密码</text>
    <text class="desc">设置后可使用邮箱和密码登录，当前会话不会退出。</text>
    <text v-if="checking" class="desc">正在读取账号状态…</text>
    <text v-if="stateError" class="error">{{ stateError }}</text>
    <wd-button v-if="stateError" plain size="small" :disabled="checking" @click="loadState">重新读取状态</wd-button>
    <wd-input v-if="needsEmail" v-model="form.email" label="邮箱" placeholder="请输入登录邮箱" />
    <wd-input v-else :model-value="userStore.currentUser?.email || ''" label="邮箱" readonly />
    <wd-input v-model="form.password" label="登录密码" type="password" placeholder="6-64位" />
    <wd-input v-model="form.confirmPassword" label="确认密码" type="password" />
    <wd-button type="primary" block :disabled="!canSubmit" :loading="loading" @click="submit">{{ saved ? '已保存' : '保存' }}</wd-button>
  </view></view>
</template>

<style scoped>.page{padding:24rpx}.card{background:#fff;border:1rpx solid var(--yb-border);border-radius:var(--yb-radius-lg);padding:28rpx}.title{display:block;font-size:34rpx;font-weight:700}.desc{display:block;color:#86909c;font-size:24rpx;line-height:1.5;margin:12rpx 0 20rpx}.error{display:block;color:#cf1322;font-size:24rpx;margin-bottom:12rpx}</style>

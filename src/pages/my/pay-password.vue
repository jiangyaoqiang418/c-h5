<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onHide, onLoad, onShow } from '@dcloudio/uni-app';
import { fetchPayPasswordStatus, resetPayPassword, setPayPassword, updatePayPassword, type PayPasswordStatus } from '@/service/api/pay-password';
import { RequestError } from '@/service/request/type';
import { getAccessToken } from '@/service/request/token';
import { usePageOperation } from '@/utils/page-operation';
import { useUserStore } from '@/stores';

type Mode = 'set' | 'update' | 'reset';
const userStore = useUserStore();
const status = ref<PayPasswordStatus>();
const mode = ref<Mode>('set');
const preferredMode = ref<Mode>();
const loading = ref(false);
const checking = ref(true);
const stateReady = ref(false);
const stateError = ref('');
const pageError = ref('');
const redirect = ref('');
const form = reactive({ loginPassword:'', oldPayPassword:'', payPassword:'', confirmPayPassword:'' });
function safeTarget(value: unknown) { const target=String(value||''); return /^\/pages\/[a-z0-9/-]+(?:\?|$)/i.test(target)&&!target.startsWith('/pages/auth/')&&!target.startsWith('/pages/my/login-password')?target:''; }
function clearForm(){Object.assign(form,{loginPassword:'',oldPayPassword:'',payPassword:'',confirmPayPassword:''});}
let loadSequence = 0;
let pendingSave: { token: string; task: Promise<void> } | undefined;
const page = usePageOperation(() => {
  loadSequence++;
  status.value = undefined;
  stateReady.value = false;
  checking.value = false;
  loading.value = false;
  stateError.value = '';
  pageError.value = '';
  clearForm();
});
function loginPasswordUrl(){return `/pages/my/pay-password?mode=${mode.value}${redirect.value?`&redirect=${encodeURIComponent(redirect.value)}`:''}`;}
function requireLoginPassword(){clearForm();uni.navigateTo({url:`/pages/my/login-password?redirect=${encodeURIComponent(loginPasswordUrl())}`});}
async function load() {
  if (!page.visible.value) return;
  const operation = page.capture();
  const sequence = ++loadSequence;
  const token = getAccessToken();
  const current = () => operation.isCurrent() && sequence === loadSequence;
  checking.value = true;
  stateReady.value = false;
  stateError.value = '';
  pageError.value = '';
  try {
    if (pendingSave?.token === token) await pendingSave.task.catch(() => undefined);
    if (!current()) return;
    await userStore.refreshProfile();
    if (!current()) return;
    const result = await fetchPayPasswordStatus();
    if (!current()) return;
    if (!userStore.currentUser || typeof result.hasSet !== 'boolean') throw new Error('支付密码状态尚未确认，请重新读取');
    status.value = result;
    mode.value = result.hasSet ? (preferredMode.value === 'reset' ? 'reset' : 'update') : 'set';
    stateReady.value = true;
    if (mode.value !== 'update' && userStore.currentUser.loginPasswordSet === false) requireLoginPassword();
  } catch (error) {
    if (current()) {
      status.value = undefined;
      stateError.value = error instanceof Error ? error.message : '支付密码状态读取失败，请重试';
    }
  } finally { if (current()) checking.value = false; }
}
onLoad(query=>{try{redirect.value=safeTarget(query?.redirect?decodeURIComponent(String(query.redirect)):'');}catch{redirect.value='';}if(query?.mode==='reset'||query?.mode==='set')preferredMode.value=query.mode;});
onShow(load);
onHide(() => { loadSequence++; stateReady.value = false; checking.value = false; loading.value = false; status.value = undefined; clearForm(); });
const valid=computed(()=>/^\d{6}$/.test(form.payPassword)&&form.payPassword===form.confirmPayPassword&&(mode.value==='update'?/^\d{6}$/.test(form.oldPayPassword):!!form.loginPassword));
const canSubmit = computed(() => page.visible.value && stateReady.value && !checking.value && !loading.value && valid.value);
const submitHint = computed(() => {
  if (loading.value) return '正在保存，请勿重复操作';
  if (mode.value === 'update' && !/^\d{6}$/.test(form.oldPayPassword)) return '请填写原6位支付密码';
  if (mode.value !== 'update' && !form.loginPassword) return '请填写平台登录密码以验证身份';
  if (!/^\d{6}$/.test(form.payPassword)) return '请填写6位数字的新支付密码，支持0开头';
  if (form.payPassword !== form.confirmPayPassword) return '两次输入的支付密码需要一致';
  return '';
});
function selectMode(next: Mode) {
  if (!stateReady.value || checking.value || loading.value || !status.value?.hasSet) return;
  clearForm(); mode.value = next; pageError.value = '';
}
async function submit() {
  if (!canSubmit.value || pendingSave?.token === getAccessToken()) return;
  const operation = page.capture();
  const token = getAccessToken();
  const userId = userStore.realUserId;
  const requestMode = mode.value;
  if (!token || !userId) return;
  const current = () => operation.isCurrent() && token === getAccessToken() && userId === userStore.realUserId;
  const values = { ...form };
  loading.value = true; pageError.value = '';
  const task = requestMode === 'set'
    ? setPayPassword({ loginPassword: values.loginPassword, payPassword: values.payPassword, confirmPayPassword: values.confirmPayPassword })
    : requestMode === 'reset'
      ? resetPayPassword({ loginPassword: values.loginPassword, payPassword: values.payPassword, confirmPayPassword: values.confirmPayPassword })
      : updatePayPassword({ oldPayPassword: values.oldPayPassword, payPassword: values.payPassword, confirmPayPassword: values.confirmPayPassword });
  const saved = { token, task };
  pendingSave = saved;
  try {
    await task;
    if (!current()) return;
    clearForm();
    uni.showToast({ title: '保存成功', icon: 'success' });
    if (redirect.value) uni.redirectTo({ url: redirect.value });
    else await load();
  } catch (error) {
    if (!current()) return;
    if (error instanceof RequestError && String(error.code) === '-316' && requestMode !== 'update') {
      uni.showToast({ title: '请先设置平台登录密码', icon: 'none' }); requireLoginPassword();
    } else pageError.value = error instanceof Error ? error.message : '保存失败';
  } finally {
    if (pendingSave === saved) pendingSave = undefined;
    if (current()) loading.value = false;
  }
}
</script>
<template>
  <view class="page yb-page"><view class="card">
    <view v-if="checking" class="state"><wd-loading size="32rpx" /><text>正在核对支付密码状态</text></view>
    <view v-else-if="!stateReady" class="state-error"><text>{{ stateError || '支付密码状态尚未确认，暂不能操作' }}</text><wd-button block plain @click="load">重新读取状态</wd-button></view>
    <template v-else>
      <text class="intro">{{ mode === 'set' ? '设置6位支付密码，用于确认涉及资金的操作。' : mode === 'reset' ? '使用平台登录密码验证身份，重设支付密码。' : '验证原支付密码后，设置新的6位支付密码。' }}</text>
      <text v-if="pageError" class="error">{{ pageError }}</text>
      <view v-if="status?.hasSet" class="modes"><view class="mode-tab" :class="{ active: mode === 'update', disabled: loading }" @click="selectMode('update')">修改密码</view><view class="mode-tab" :class="{ active: mode === 'reset', disabled: loading }" @click="selectMode('reset')">忘记支付密码</view></view>
      <wd-input v-if="mode !== 'update'" v-model="form.loginPassword" label="平台登录密码" type="password" :disabled="loading" />
      <wd-input v-else v-model="form.oldPayPassword" label="原支付密码" type="number" password :maxlength="6" :disabled="loading" />
      <wd-input v-model="form.payPassword" :label="mode === 'update' ? '新支付密码' : '支付密码'" type="number" password :maxlength="6" :disabled="loading" placeholder="6位数字，支持0开头" />
      <wd-input v-model="form.confirmPayPassword" label="确认支付密码" type="number" password :maxlength="6" :disabled="loading" />
      <text v-if="submitHint" class="form-hint">{{ submitHint }}</text>
      <wd-button type="primary" block :disabled="!canSubmit" :loading="loading" @click="submit">保存</wd-button>
    </template>
  </view></view>
</template>
<style scoped>
.page{padding:24rpx}.card{background:#fff;border:1rpx solid var(--yb-border);border-radius:var(--yb-radius-lg);padding:28rpx;--wot-input-padding:0}
.intro,.form-hint{display:block;font-size:26rpx;color:var(--yb-muted);line-height:1.6;margin-bottom:24rpx}.form-hint{margin-top:20rpx}
.state{display:flex;align-items:center;justify-content:center;gap:16rpx;padding:60rpx 0;color:var(--yb-muted);font-size:26rpx}
.state-error{display:flex;flex-direction:column;gap:24rpx;color:var(--yb-muted);font-size:26rpx;line-height:1.6}
.error{display:block;background:#fff2f0;color:#cf1322;padding:16rpx;border-radius:8rpx;margin-bottom:18rpx;font-size:24rpx}
.modes{display:flex;gap:8rpx;margin-bottom:24rpx;padding:6rpx;background:var(--yb-bg);border-radius:16rpx}.mode-tab{display:flex;align-items:center;justify-content:center;flex:1;min-height:88rpx;font-size:26rpx;color:var(--yb-muted);border-radius:12rpx}.mode-tab.active{background:#fff;color:var(--yb-brand);font-weight:600}.mode-tab.disabled{opacity:.6}
.card :deep(.wd-input__label){width:176rpx!important}
</style>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { fetchPayPasswordStatus, resetPayPassword, setPayPassword, updatePayPassword, type PayPasswordStatus } from '@/service/api/pay-password';
const status = ref<PayPasswordStatus>(); const mode = ref<'set'|'update'|'reset'>('set'); const loading = ref(false); const redirect = ref('');
const form = reactive({ loginPassword:'', oldPayPassword:'', payPassword:'', confirmPayPassword:'' });
onLoad(query => { redirect.value = decodeURIComponent(String(query?.redirect || '')); });
onShow(async () => { status.value = await fetchPayPasswordStatus(); mode.value = status.value.hasSet ? 'update' : 'set'; });
const valid = computed(() => /^\d{6}$/.test(form.payPassword) && form.payPassword === form.confirmPayPassword && (mode.value === 'update' ? /^\d{6}$/.test(form.oldPayPassword) : !!form.loginPassword));
async function submit() {
  if (!valid.value || loading.value) return; loading.value = true;
  try {
    if (mode.value === 'set') await setPayPassword({ loginPassword:form.loginPassword,payPassword:form.payPassword,confirmPayPassword:form.confirmPayPassword });
    else if (mode.value === 'reset') await resetPayPassword({ loginPassword:form.loginPassword,payPassword:form.payPassword,confirmPayPassword:form.confirmPayPassword });
    else await updatePayPassword({ oldPayPassword:form.oldPayPassword,payPassword:form.payPassword,confirmPayPassword:form.confirmPayPassword });
    Object.assign(form,{loginPassword:'',oldPayPassword:'',payPassword:'',confirmPayPassword:''}); uni.showToast({title:'保存成功',icon:'success'});
    if (redirect.value.startsWith('/pages/')) uni.redirectTo({ url: redirect.value }); else status.value = await fetchPayPasswordStatus();
  } finally { loading.value=false; }
}
</script>
<template><view class="page yb-page"><view class="card"><text class="title">支付密码</text><view v-if="status?.hasSet" class="modes"><wd-button size="small" :plain="mode!=='update'" @click="mode='update'">修改密码</wd-button><wd-button size="small" :plain="mode!=='reset'" @click="mode='reset'">忘记密码</wd-button></view><wd-input v-if="mode!=='update'" v-model="form.loginPassword" label="平台登录密码" password /><wd-input v-else v-model="form.oldPayPassword" label="原支付密码" type="number" password :maxlength="6" /><wd-input v-model="form.payPassword" label="新支付密码" type="number" password :maxlength="6" placeholder="6位数字，支持0开头" /><wd-input v-model="form.confirmPayPassword" label="确认支付密码" type="number" password :maxlength="6" /><wd-button type="primary" block :disabled="!valid" :loading="loading" @click="submit">保存</wd-button></view></view></template>
<style scoped>.page{padding:24rpx}.card{background:#fff;border:1rpx solid var(--yb-border);border-radius:var(--yb-radius-lg);padding:28rpx}.title{display:block;font-size:34rpx;font-weight:700;margin-bottom:24rpx}.modes{display:flex;gap:16rpx;margin-bottom:20rpx}</style>

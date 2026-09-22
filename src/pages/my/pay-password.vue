<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { fetchPayPasswordStatus, resetPayPassword, setPayPassword, updatePayPassword, type PayPasswordStatus } from '@/service/api/pay-password';
import { RequestError } from '@/service/request/type';
import { useUserStore } from '@/stores';

type Mode = 'set' | 'update' | 'reset';
const userStore = useUserStore();
const status = ref<PayPasswordStatus>();
const mode = ref<Mode>('set');
const preferredMode = ref<Mode>();
const loading = ref(false);
const pageError = ref('');
const redirect = ref('');
const form = reactive({ loginPassword:'', oldPayPassword:'', payPassword:'', confirmPayPassword:'' });
function safeTarget(value: unknown) { const target=String(value||''); return /^\/pages\/[a-z0-9/-]+(?:\?|$)/i.test(target)&&!target.startsWith('/pages/auth/')&&!target.startsWith('/pages/my/login-password')?target:''; }
function clearForm(){Object.assign(form,{loginPassword:'',oldPayPassword:'',payPassword:'',confirmPayPassword:''});}
function loginPasswordUrl(){return `/pages/my/pay-password?mode=${mode.value}${redirect.value?`&redirect=${encodeURIComponent(redirect.value)}`:''}`;}
function requireLoginPassword(){clearForm();uni.navigateTo({url:`/pages/my/login-password?redirect=${encodeURIComponent(loginPasswordUrl())}`});}
async function load(){pageError.value='';try{await userStore.refreshProfile();status.value=await fetchPayPasswordStatus();mode.value=status.value.hasSet?(preferredMode.value==='reset'?'reset':'update'):'set';if(mode.value!=='update'&&userStore.currentUser?.loginPasswordSet===false)requireLoginPassword();}catch(error){pageError.value=error instanceof Error?error.message:'状态加载失败';}}
onLoad(query=>{try{redirect.value=safeTarget(query?.redirect?decodeURIComponent(String(query.redirect)):'');}catch{redirect.value='';}if(query?.mode==='reset'||query?.mode==='set')preferredMode.value=query.mode;});
onShow(load);
const valid=computed(()=>/^\d{6}$/.test(form.payPassword)&&form.payPassword===form.confirmPayPassword&&(mode.value==='update'?/^\d{6}$/.test(form.oldPayPassword):!!form.loginPassword));
function selectMode(next:Mode){clearForm();mode.value=next;pageError.value='';}
async function submit(){if(!valid.value||loading.value)return;loading.value=true;pageError.value='';try{if(mode.value==='set')await setPayPassword({loginPassword:form.loginPassword,payPassword:form.payPassword,confirmPayPassword:form.confirmPayPassword});else if(mode.value==='reset')await resetPayPassword({loginPassword:form.loginPassword,payPassword:form.payPassword,confirmPayPassword:form.confirmPayPassword});else await updatePayPassword({oldPayPassword:form.oldPayPassword,payPassword:form.payPassword,confirmPayPassword:form.confirmPayPassword});clearForm();uni.showToast({title:'保存成功',icon:'success'});if(redirect.value)uni.redirectTo({url:redirect.value});else await load();}catch(error){if(error instanceof RequestError&&String(error.code)==='-316'&&mode.value!=='update'){uni.showToast({title:'请先设置平台登录密码',icon:'none'});requireLoginPassword();}else pageError.value=error instanceof Error?error.message:'保存失败';}finally{loading.value=false;}}
</script>
<template><view class="page yb-page"><view class="card"><text class="title">支付密码</text><text v-if="pageError" class="error">{{ pageError }}</text><view v-if="status?.hasSet" class="modes"><wd-button size="small" :plain="mode!=='update'" @click="selectMode('update')">修改密码</wd-button><wd-button size="small" :plain="mode!=='reset'" @click="selectMode('reset')">忘记密码</wd-button></view><wd-input v-if="mode!=='update'" v-model="form.loginPassword" label="平台登录密码" type="password" /><wd-input v-else v-model="form.oldPayPassword" label="原支付密码" type="number" password :maxlength="6" /><wd-input v-model="form.payPassword" label="新支付密码" type="number" password :maxlength="6" placeholder="6位数字，支持0开头" /><wd-input v-model="form.confirmPayPassword" label="确认支付密码" type="number" password :maxlength="6" /><wd-button type="primary" block :disabled="!valid" :loading="loading" @click="submit">保存</wd-button></view></view></template>
<style scoped>.page{padding:24rpx}.card{background:#fff;border:1rpx solid var(--yb-border);border-radius:var(--yb-radius-lg);padding:28rpx}.title{display:block;font-size:34rpx;font-weight:700;margin-bottom:24rpx}.error{display:block;background:#fff2f0;color:#cf1322;padding:16rpx;border-radius:8rpx;margin-bottom:18rpx;font-size:24rpx}.modes{display:flex;gap:16rpx;margin-bottom:20rpx}</style>

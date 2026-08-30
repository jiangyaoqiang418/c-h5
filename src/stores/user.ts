import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { type Audience, STORAGE_KEY } from '@shared';
import { storage } from '@/utils/storage';
import { getAccessToken } from '@/service/request';
import { onSessionChanged } from '@/service/request/token';
import * as realAuthApi from '@/service/api/auth';
import { fetchBuyerApplication } from '@/service/api/buyer';

export const useUserStore = defineStore('bw-user', () => {
  const currentUser = ref<realAuthApi.CurrentUser | undefined>();
  const realUserId = ref<string>();
  const currentAudience = ref<Audience>('customer');
  const buyerApplication = ref<Api.RealUser.BuyerApplicationDTO | null>();
  const buyerApplicationLoadFailed = ref(false);
  const initialized = ref(false);
  let initTask: Promise<void> | undefined;
  let profileTask: Promise<void> | undefined;

  function clearSessionState() {
    currentUser.value = undefined;
    realUserId.value = undefined;
    currentAudience.value = 'customer';
    buyerApplication.value = undefined;
    buyerApplicationLoadFailed.value = false;
    initialized.value = false;
    profileTask = undefined;
    initTask = undefined;
    storage.remove(STORAGE_KEY.currentUserId);
    storage.remove(STORAGE_KEY.currentAudience);
  }
  onSessionChanged(clearSessionState);

  async function refreshProfile() {
    const token = getAccessToken();
    if (!token) return;
    if (profileTask) return profileTask;
    const task = (async () => {
      const result = await realAuthApi.fetchCurrentUser();
      if (getAccessToken() !== token) return;
      currentUser.value = result;
      realUserId.value = result.remoteId;
      currentAudience.value = result.isBuyer && result.kycStatus === 'approved' ? loadAudienceFromStorage() : 'customer';
      initialized.value = true;
    })();
    profileTask = task;
    try { await task; } finally { if (profileTask === task) profileTask = undefined; }
  }

  function loadAudienceFromStorage(): Audience {
    const raw = storage.get<string>(STORAGE_KEY.currentAudience);
    return raw === 'buyer' ? 'buyer' : 'customer';
  }

  async function refreshBuyerApplication() {
    const token = getAccessToken();
    if (!token) return;
    try {
      const application = await fetchBuyerApplication();
      if (getAccessToken() !== token) return;
      buyerApplication.value = application;
      buyerApplicationLoadFailed.value = false;

      if (buyerApplication.value?.status === 'APPROVED' && !currentUser.value?.isBuyer) {
        try {
          await refreshProfile();
        } catch {
          // 网络失败不改写已确认的身份。
        }
      }

      return buyerApplication.value;
    } catch {
      if (getAccessToken() !== token) return;
      buyerApplicationLoadFailed.value = true;
      return undefined;
    }
  }

  async function initialize() {
    if (getAccessToken()) {
      try {
        await refreshProfile();
        await refreshBuyerApplication();
      } catch {
        // 只有请求层确认会话失效才清理凭据；断网保留会话并允许下次重试。
        return;
      }
    }
    initialized.value = true;
  }

  async function init() {
    if (initialized.value) return;
    if (!initTask) initTask = initialize();
    const task = initTask;
    try {
      await task;
    } finally {
      if (initTask === task) initTask = undefined;
    }
  }

  async function login(params: { email: string; password: string }, accept: () => boolean = () => true) {
    const session = await realAuthApi.login(params, accept);
    if (session.token !== getAccessToken()) throw new Error('会话已切换，本次登录资料已忽略');
    const result = session.profile;
    const token = session.token;
    currentUser.value = result;
    realUserId.value = result.remoteId;
    currentAudience.value = 'customer';
    storage.set(STORAGE_KEY.currentAudience, 'customer');
    initialized.value = true;
    await refreshBuyerApplication();
    return { userId: result.remoteId, token };
  }

  function logout() {
    currentUser.value = undefined;
    realUserId.value = undefined;
    currentAudience.value = 'customer';
    buyerApplication.value = undefined;
    buyerApplicationLoadFailed.value = false;
    realAuthApi.logoutLocal();
    storage.remove(STORAGE_KEY.currentUserId);
    storage.remove(STORAGE_KEY.currentAudience);
  }

  function setAudience(a: Audience) {
    if (a === 'buyer' && !canSwitchToBuyer.value) return false;
    currentAudience.value = a;
    storage.set(STORAGE_KEY.currentAudience, a);
    return true;
  }

  const isLoggedIn = computed(() => !!currentUser.value);
  const displayName = computed(
    () => currentUser.value?.nickname || currentUser.value?.email?.split('@')[0] || ''
  );
  const canSwitchToBuyer = computed(
    () => !!currentUser.value?.isBuyer && currentUser.value?.kycStatus === 'approved'
  );
  const isBuyerActive = computed(() => currentAudience.value === 'buyer');
  return {
    currentUser,
    realUserId,
    currentAudience,
    buyerApplication,
    buyerApplicationLoadFailed,
    isLoggedIn,
    displayName,
    canSwitchToBuyer,
    isBuyerActive,
    init,
    login,
    logout,
    setAudience,
    refreshBuyerApplication,
    refreshProfile
  };
});

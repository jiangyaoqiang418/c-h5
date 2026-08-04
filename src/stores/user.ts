import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { type Audience, STORAGE_KEY } from '@shared';
import { storage } from '@/utils/storage';
import { getAccessToken } from '@/service/request';
import * as realAuthApi from '@/service/api/auth';
import { fetchBuyerApplication } from '@/service/api/buyer';

export const useUserStore = defineStore('bw-user', () => {
  const currentUser = ref<Api.User.UserRecord | undefined>();
  const realUserId = ref<string>();
  const currentAudience = ref<Audience>('customer');
  const buyerApplication = ref<Api.RealUser.BuyerApplicationDTO | null>();
  const buyerApplicationLoadFailed = ref(false);
  const initialized = ref(false);
  let initTask: Promise<void> | undefined;

  function loadAudienceFromStorage(): Audience {
    const raw = storage.get<string>(STORAGE_KEY.currentAudience);
    return raw === 'buyer' ? 'buyer' : 'customer';
  }

  async function loadBuyerApplication() {
    try {
      buyerApplication.value = await fetchBuyerApplication();
      buyerApplicationLoadFailed.value = false;
    } catch {
      buyerApplication.value = undefined;
      buyerApplicationLoadFailed.value = true;
    }
  }

  async function initialize() {
    if (getAccessToken()) {
      try {
        const result = await realAuthApi.fetchCurrentUser();
        currentUser.value = result;
        realUserId.value = result.remoteId;
        currentAudience.value = result.isBuyer && result.kycStatus === 'approved' ? loadAudienceFromStorage() : 'customer';
        await loadBuyerApplication();
      } catch {
        realAuthApi.logoutLocal();
        storage.remove(STORAGE_KEY.currentUserId);
      }
    }
    initialized.value = true;
  }

  async function init() {
    if (initialized.value) return;
    if (!initTask) initTask = initialize();
    try {
      await initTask;
    } finally {
      initTask = undefined;
    }
  }

  async function login(params: { email: string; password: string }) {
    const result = await realAuthApi.login(params);
    currentUser.value = result;
    realUserId.value = result.remoteId;
    currentAudience.value = 'customer';
    storage.set(STORAGE_KEY.currentAudience, 'customer');
    await loadBuyerApplication();
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
    setAudience
  };
});

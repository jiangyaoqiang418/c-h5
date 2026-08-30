import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { enums } from '@shared';
import type { BucketKey } from '@shared/enums/wallet';
import { useUserStore } from './user';
import { fetchWalletOverview } from '@/service/api/wallet';
import { getAccessToken, onSessionChanged } from '@/service/request/token';

export interface BucketView {
  key: BucketKey;
  label: string;
  color: string;
  hint: string;
  icon: string;
  value: string;
}

export const useWalletStore = defineStore('bw-wallet', () => {
  const summary = ref<Api.User.WalletSummary | undefined>();
  const buyerWallet = ref<Api.Buyer.Wallet | undefined>();
  const totalAssets = ref<string>('0');
  const account = ref<Api.Wallet.InternalAccount | undefined>();
  const loading = ref(false);
  const lastFetchedAt = ref<number>(0);
  let sequence = 0;

  async function fetchWallet(_legacyUserId?: number) {
    const userStore = useUserStore();
    if (!userStore.realUserId) { clear(); return; }
    const token = getAccessToken();
    const requestSequence = ++sequence;
    loading.value = true;
    try {
      const result = await fetchWalletOverview();
      if (token !== getAccessToken() || sequence !== requestSequence) return;
      summary.value = result.summary;
      buyerWallet.value = undefined;
      totalAssets.value = result.total;
      account.value = result.account;
      lastFetchedAt.value = Date.now();
    } finally {
      if (sequence === requestSequence) loading.value = false;
    }
  }

  async function refetch() {
    const userStore = useUserStore();
    if (userStore.currentUser) await fetchWallet();
  }

  function clear() {
    sequence++;
    loading.value = false;
    summary.value = undefined;
    buyerWallet.value = undefined;
    totalAssets.value = '0';
    account.value = undefined;
    lastFetchedAt.value = 0;
  }
  onSessionChanged(clear);

  const bucketsArray = computed<BucketView[]>(() => {
    if (!account.value) return [];
    const acc = account.value;
    const userStore = useUserStore();
    const list: BucketView[] = [];
    const baseKeys: BucketKey[] = ['available', 'nonWithdrawable', 'lockedFinance', 'frozenOrder', 'frozenRisk'];
    baseKeys.forEach(k => {
      const meta = enums.BUCKET_META[k];
      list.push({
        key: k,
        label: meta.label,
        color: meta.color,
        hint: meta.hint,
        icon: meta.icon,
        value: acc[k] || '0'
      });
    });
    if (userStore.currentUser?.isBuyer) {
      const buyerKeys: BucketKey[] = ['depositAvailable', 'depositGuaranteed'];
      buyerKeys.forEach(k => {
        const meta = enums.BUCKET_META[k];
        list.push({
          key: k,
          label: meta.label,
          color: meta.color,
          hint: meta.hint,
          icon: meta.icon,
          value: acc[k] || '0'
        });
      });
    }
    return list;
  });

  const compositionBreakdown = computed(() => {
    const total = Number(totalAssets.value) || 0;
    return bucketsArray.value
      .filter(b => Number(b.value) > 0)
      .map(b => {
        const value = Number(b.value);
        return {
          label: b.label,
          color: b.color,
          value: b.value,
          pct: total > 0 ? value / total : 0
        };
      });
  });

  return {
    summary,
    buyerWallet,
    totalAssets,
    account,
    loading,
    lastFetchedAt,
    bucketsArray,
    compositionBreakdown,
    fetchWallet,
    refetch,
    clear
  };
});

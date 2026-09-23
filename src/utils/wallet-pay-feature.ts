let enabled = false;
// #ifdef H5
enabled = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_WALLET_PAY_ENTRY_ENABLED === 'true';
// #endif
export const walletPayEntryEnabled = enabled;

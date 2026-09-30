export type MobileWallet = 'metamask' | 'okx' | 'tronlink';
export function walletBrowserOptions(chain: string): Array<{ key: MobileWallet; label: string }> {
  if (chain === 'TRON') return [{ key: 'tronlink', label: 'TronLink' }];
  if (chain === 'ETH' || chain === 'BSC') return [{ key: 'metamask', label: 'MetaMask' }, { key: 'okx', label: 'OKX Wallet' }];
  return [];
}
const downloads: Record<MobileWallet, string> = {
  metamask: 'https://metamask.io/download', okx: 'https://web3.okx.com/download', tronlink: 'https://www.tronlink.org/dlDetails/'
};
/** 重建业务页链接，只携带原订单组号；不复制当前 URL 中的登录参数或凭据。 */
export function walletPageUrl(path: string): string {
  if (!/^\/pages\/checkout\/wallet-pay\?orderGroupNo=[^&]+$/.test(path) && path !== '/pages/wallet/deposit') throw new Error('钱包页面地址无效');
  // #ifdef H5
  const current = new URL(window.location.href);
  if (current.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(current.hostname)) throw new Error('请用手机可访问的HTTPS商城地址打开钱包');
  current.username = ''; current.password = ''; current.search = '';
  if (window.location.hash.startsWith('#/')) current.hash = path;
  else { current.pathname = current.pathname.split('/pages/')[0].replace(/\/$/, '') + path.split('?')[0]; current.search = path.includes('?') ? path.slice(path.indexOf('?')) : ''; current.hash = ''; }
  return current.toString();
  // #endif
  // #ifndef H5
  throw new Error('请在手机浏览器中使用钱包打开入口');
  // #endif
}
export function openWalletBrowser(wallet: MobileWallet, path: string) {
  const url = walletPageUrl(path);
  const links: Record<MobileWallet, string> = {
    metamask: `https://metamask.app.link/dapp/${url.replace(/^https:\/\//, '')}`,
    okx: `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`,
    tronlink: `tronlinkoutside://pull.activity?param=${encodeURIComponent(JSON.stringify({ url, action: 'open', protocol: 'TronLink', version: '1.0' }))}`
  };
  // 由点击同步触发，避免 iOS 在异步操作后拦截钱包唤起。
  // #ifdef H5
  window.location.assign(links[wallet]);
  // #endif
}
export function openWalletDownload(wallet: MobileWallet) {
  // #ifdef H5
  window.location.assign(downloads[wallet]);
  // #endif
}

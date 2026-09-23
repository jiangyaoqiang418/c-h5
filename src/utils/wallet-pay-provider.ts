import type { WalletPayOrder } from '@/service/api/wallet-pay';

interface EvmProvider {
  isMetaMask?: boolean;
  isOkxWallet?: boolean;
  providers?: EvmProvider[];
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}
interface TronWeb {
  ready?: boolean;
  fullNode?: { host?: string };
  defaultAddress?: { base58?: string };
  isAddress?(address: string): boolean;
  contract(): { at(address: string): Promise<{ transfer(to: string, amount: string): { send(options: { feeLimit: number }): Promise<unknown> } }> };
}
interface TronProvider {
  isTronLink?: boolean;
  tronWeb?: TronWeb | false;
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}
type InjectedWindow = Window & { ethereum?: EvmProvider; okxwallet?: { ethereum?: EvmProvider }; tron?: TronProvider; tronLink?: TronProvider };
export interface WalletOption { key: string; label: string }
export interface ConnectedWallet { account: string; sendTransfer(): Promise<string> }

function injected(): InjectedWindow | undefined {
  return typeof window === 'undefined' ? undefined : window as InjectedWindow;
}
function evmProviders() {
  const source = injected();
  const candidates = [...(source?.ethereum?.providers || []), source?.okxwallet?.ethereum, source?.ethereum];
  const seen = new Set<EvmProvider>();
  return candidates.filter((provider): provider is EvmProvider => !!provider && typeof provider.request === 'function')
    .filter(provider => { if (seen.has(provider)) return false; seen.add(provider); return true; })
    .map((provider, index) => ({ key: `evm-${index}`,
      label: provider.isOkxWallet ? 'OKX Wallet' : provider.isMetaMask ? 'MetaMask' : '浏览器 EVM 钱包', provider }));
}
function tronProvider() {
  const source = injected();
  const provider = source?.tron?.isTronLink ? source.tron : source?.tronLink;
  return provider && typeof provider.request === 'function' ? provider : undefined;
}
export function availableWallets(chain: string): WalletOption[] {
  if (chain === 'TRON') return tronProvider() ? [{ key: 'tronlink', label: 'TronLink' }] : [];
  if (chain === 'ETH' || chain === 'BSC') return evmProviders().map(({ key, label }) => ({ key, label }));
  return [];
}
function validateRawAmount(pay: WalletPayOrder) {
  if (!/^\d+$/.test(pay.rawAmount) || BigInt(pay.rawAmount) <= 0n || BigInt(pay.rawAmount) >= (1n << 256n)) {
    throw new Error('链上转账金额无效，请返回订单核对');
  }
}
function evmChainMatches(value: unknown, chainId: bigint) {
  return typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value) && BigInt(value) === chainId;
}
async function connectEvm(pay: WalletPayOrder, key: string): Promise<ConnectedWallet> {
  const provider = evmProviders().find(item => item.key === key)?.provider;
  if (!provider) throw new Error('当前浏览器没有所选钱包，请在钱包内置浏览器打开');
  if (!/^0x[0-9a-fA-F]{40}$/.test(pay.toAddress) || !/^0x[0-9a-fA-F]{40}$/.test(pay.tokenContract)) throw new Error('收款地址或合约地址无效');
  if (!/^\d+$/.test(pay.network) || BigInt(pay.network) <= 0n) throw new Error('支付网络配置无效');
  validateRawAmount(pay);
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const account = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof account !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(account)) throw new Error('未取得有效的钱包账户');
  const chainId = BigInt(pay.network);
  if (!evmChainMatches(await provider.request({ method: 'eth_chainId' }), chainId)) {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${chainId.toString(16)}` }] });
  }
  if (!evmChainMatches(await provider.request({ method: 'eth_chainId' }), chainId)) throw new Error('钱包网络与支付单不一致');
  return { account, async sendTransfer() {
    const current = await provider.request({ method: 'eth_accounts' });
    if (!Array.isArray(current) || typeof current[0] !== 'string' || current[0].toLowerCase() !== account.toLowerCase()
      || !evmChainMatches(await provider.request({ method: 'eth_chainId' }), chainId)) throw new Error('钱包账户或网络已变化，请重新核对');
    const address = pay.toAddress.slice(2).toLowerCase().padStart(64, '0');
    const amount = BigInt(pay.rawAmount).toString(16).padStart(64, '0');
    const hash = await provider.request({ method: 'eth_sendTransaction', params: [{
      from: account, to: pay.tokenContract, value: '0x0', data: `0xa9059cbb${address}${amount}`
    }] });
    if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('钱包未返回有效交易哈希，请先核对钱包记录，勿重复转账');
    return hash;
  } };
}
const tronIds: Record<string, string> = { mainnet: '0x2b6653dc', shasta: '0x94a9059e', nile: '0xcd8690dc' };
function tronNetwork(web: TronWeb): string | undefined {
  try {
    const hostname = new URL(web.fullNode?.host || '').hostname.toLowerCase();
    if (hostname === 'api.trongrid.io') return 'mainnet';
    if (hostname === 'api.shasta.trongrid.io') return 'shasta';
    if (hostname === 'nile.trongrid.io') return 'nile';
  } catch { /* 未知节点不推断为目标网络。 */ }
}
async function connectTron(pay: WalletPayOrder): Promise<ConnectedWallet> {
  const provider = tronProvider();
  if (!provider) throw new Error('当前浏览器未检测到 TronLink，请在 TronLink 内置浏览器打开');
  const network = pay.network.toLowerCase();
  if (!tronIds[network]) throw new Error('TRON 支付网络未识别');
  validateRawAmount(pay);
  let accounts: unknown;
  try { accounts = await provider.request({ method: 'eth_requestAccounts' }); }
  catch (error) {
    if ((error as { code?: number })?.code !== 4200) throw error;
    const legacy = await provider.request({ method: 'tron_requestAccounts' });
    if ((legacy as { code?: number })?.code !== 200) throw new Error('TronLink 未授权当前页面');
  }
  let web = provider.tronWeb || undefined;
  const account = Array.isArray(accounts) ? accounts[0] : web?.defaultAddress?.base58;
  if (!web?.ready || typeof account !== 'string' || !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(account)) throw new Error('TronLink 尚未连接有效账户');
  if (!web.isAddress?.(pay.toAddress) || !web.isAddress(pay.tokenContract)) throw new Error('TRON 收款地址或合约地址无效');
  if (tronNetwork(web) !== network) {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: tronIds[network] }] });
    web = provider.tronWeb || undefined;
  }
  if (!web?.ready || tronNetwork(web) !== network) throw new Error('无法确认 TronLink 当前网络，请手动切换官方网络');
  return { account, async sendTransfer() {
    const active = provider.tronWeb || undefined;
    if (!active?.ready || active.defaultAddress?.base58 !== account || tronNetwork(active) !== network) throw new Error('TronLink 账户或网络已变化，请重新核对');
    const contract = await active.contract().at(pay.tokenContract);
    const hash = await contract.transfer(pay.toAddress, pay.rawAmount).send({ feeLimit: 100_000_000 });
    if (typeof hash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(hash)) throw new Error('TronLink 未返回有效交易哈希，请先核对钱包记录，勿重复转账');
    return hash;
  } };
}
export function connectPaymentWallet(pay: WalletPayOrder, key: string): Promise<ConnectedWallet> {
  if (pay.chain === 'TRON') return connectTron(pay);
  if (pay.chain === 'ETH' || pay.chain === 'BSC') return connectEvm(pay, key);
  throw new Error('当前链暂不支持浏览器钱包转账');
}
export function walletRequestRejected(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 4001;
}

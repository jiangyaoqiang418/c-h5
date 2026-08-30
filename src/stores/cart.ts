import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { STORAGE_KEY } from '@shared';
import { PRODUCTS } from '@shared/mock/data/products';
import { storage } from '@/utils/storage';
import { fetchStorefrontProductDetail } from '@/service/api/product';
import { getAccessToken, onSessionChanged } from '@/service/request/token';
import { useUserStore } from './user';

export interface CartItem {
  productId: string | number;
  source: 'mock' | 'real';
  qty: number;
  addedAt: string;
  selected: boolean;
  snapshot?: CartProductSnapshot;
}

export interface CartProductSnapshot {
  id: string | number;
  title: string;
  sellerId: string | number;
  sellerName: string;
  cover?: string;
  price: string | number;
  shippingFee: string | number;
  tax: string | number;
  stock: number;
  status?: Api.RealProduct.ProductDTO['status'];
  aftersaleType: Api.Product.AftersaleType;
  overseasCustoms?: boolean;
}

export interface EnrichedCartItem extends CartItem {
  key: string;
  product?: CartProductSnapshot;
  available: boolean;
  subtotal: string;
  shippingFee: string;
  tax: string;
  lineTotal: string;
}

interface BuyNowContext {
  id: string;
  item: CartItem;
  createdAt: string;
}

const registryKey = 'bw_h5_cart_scopes_v2';

interface CartScope { items: CartItem[]; buyNow?: BuyNowContext }
interface CartTransfer { items: CartItem[]; owner?: string }
interface CartRegistry {
  scopes: Record<string, CartScope>;
  transfers: Record<string, CartTransfer>;
  legacyOwner?: string;
}

function readRegistry(): CartRegistry {
  const raw = uni.getStorageSync(registryKey);
  if (!raw) return { scopes: {}, transfers: {} };
  const value = JSON.parse(raw) as CartRegistry;
  if (!value || !value.scopes || !value.transfers) throw new Error('购物车存储异常，原数据已保留');
  return value;
}

function saveRegistry(value: CartRegistry) {
  const raw = JSON.stringify(value);
  uni.setStorageSync(registryKey, raw);
  if (uni.getStorageSync(registryKey) !== raw) throw new Error('购物车未保存，请检查本机存储');
}

function readItems(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || (typeof item.productId !== 'string' && typeof item.productId !== 'number')) return [];
    const source = item.source === 'real' ? 'real' : 'mock';
    if (source === 'real' && !item.snapshot) return [];
    return [{ productId: item.productId, source, qty: Number.isSafeInteger(Number(item.qty)) && Number(item.qty) > 0 ? Number(item.qty) : 1,
      addedAt: item.addedAt || new Date().toISOString(), selected: item.selected !== false, snapshot: source === 'real' ? item.snapshot : undefined } as CartItem];
  });
}

function itemKey(source: CartItem['source'], productId: CartItem['productId']): string {
  return `${source}:${String(productId)}`;
}

function createBuyNowContextId(): string {
  return `buy-now-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function mockSnapshot(product: Api.Product.ProductRecord): CartProductSnapshot {
  return {
    id: product.id,
    title: product.title,
    sellerId: product.sellerId,
    sellerName: product.sellerName,
    cover: product.images?.[0]?.url,
    price: product.price,
    shippingFee: product.shippingFee,
    tax: product.tax,
    stock: product.stock,
    aftersaleType: product.aftersaleType,
    overseasCustoms: product.overseasCustoms
  };
}

function enrich(item: CartItem): EnrichedCartItem {
  const mockProduct = item.source === 'mock' && typeof item.productId === 'number'
    ? PRODUCTS.find(product => product.id === item.productId)
    : undefined;
  const product = item.source === 'real' ? item.snapshot : mockProduct ? mockSnapshot(mockProduct) : undefined;
  const available = item.source === 'real'
    ? !!product && product.stock > 0 && (!product.status || product.status === 'ON_SALE')
    : !!mockProduct && mockProduct.status === 'NORMAL' && mockProduct.shelfStatus === 'on-shelf' && mockProduct.stock > 0;
  const price = product ? Number(product.price) : 0;
  const shipping = product ? Number(product.shippingFee) : 0;
  const tax = product ? Number(product.tax) : 0;
  const subtotal = (price * item.qty).toFixed(2);
  const lineTotal = (price * item.qty + shipping + tax).toFixed(2);
  return {
    ...item,
    key: itemKey(item.source, item.productId),
    product,
    available,
    subtotal,
    shippingFee: shipping.toFixed(2),
    tax: tax.toFixed(2),
    lineTotal
  };
}

export const useCartStore = defineStore('bw-cart', () => {
  const userStore = useUserStore();
  const items = ref<CartItem[]>([]);
  const buyNowContext = ref<BuyNowContext>();
  const initialized = ref(false);
  const scope = ref('');
  const legacyItems = ref<CartItem[]>([]);
  const legacyAvailable = computed(() => scope.value.startsWith('user:') && legacyItems.value.length > 0);
  let scopeVersion = 0;

  function currentScope() {
    if (!getAccessToken()) return 'guest';
    return userStore.realUserId ? `user:${userStore.realUserId}` : 'pending';
  }

  function persist() {
    try {
      if (scope.value !== currentScope() || scope.value === 'pending') throw new Error('账户资料尚未确认，请稍后重试');
      const registry = readRegistry();
      registry.scopes[scope.value] = { items: items.value, buyNow: buyNowContext.value };
      saveRegistry(registry);
      return true;
    } catch (error) {
      initialized.value = false;
      init();
      uni.showToast({ title: error instanceof Error ? error.message : '购物车保存失败', icon: 'none' });
      return false;
    }
  }

  function persistBuyNow() {
    if (!persist()) throw new Error('立即购买信息未保存，请重试');
  }

  function init() {
    const nextScope = currentScope();
    if (initialized.value && scope.value === nextScope) return;
    scopeVersion++;
    scope.value = nextScope;
    items.value = [];
    buyNowContext.value = undefined;
    legacyItems.value = [];
    try {
      if (nextScope === 'pending') return;
      const registry = readRegistry();
      const saved = registry.scopes[nextScope];
      items.value = readItems(saved?.items);
      if (saved?.buyNow?.id && saved.buyNow.item) {
        const item = readItems([saved.buyNow.item])[0];
        if (item) buyNowContext.value = { ...saved.buyNow, item };
      }
      // 旧版数据没有账号归属，不自动分配；原始存储保留供用户明确恢复。
      if (!registry.legacyOwner && nextScope.startsWith('user:')) {
        const raw = storage.get<string>(STORAGE_KEY.cart);
        if (raw) legacyItems.value = readItems(JSON.parse(raw));
      }
    } catch {
      uni.showToast({ title: '购物车数据暂不可读取，原存储已保留', icon: 'none' });
    } finally {
      initialized.value = true;
    }
  }

  onSessionChanged(() => { initialized.value = false; init(); });
  watch(() => userStore.realUserId, () => init(), { flush: 'sync' });

  function createGuestTransfer() {
    init();
    if (scope.value !== 'guest') return undefined;
    const selected = items.value.filter(item => item.selected);
    if (!selected.length) return undefined;
    const id = createBuyNowContextId();
    const registry = readRegistry();
    registry.transfers[id] = { items: selected };
    saveRegistry(registry);
    return id;
  }

  function acceptGuestTransfer(id: string) {
    init();
    if (!scope.value.startsWith('user:')) throw new Error('请先登录');
    const registry = readRegistry();
    const transfer = registry.transfers[id];
    if (!transfer || (transfer.owner && transfer.owner !== scope.value)) throw new Error('游客结算信息已失效，请重新选择商品');
    if (transfer.owner === scope.value) return;
    const transferred = readItems(transfer.items);
    const keys = new Set(transferred.map(item => itemKey(item.source, item.productId)));
    const saved = registry.scopes[scope.value] || { items: [] };
    // 仅勾选本次游客结算商品，不把账号原有选中商品混入本单。
    saved.items = [...transferred.map(item => ({ ...item, selected: true })), ...readItems(saved.items).filter(item => !keys.has(itemKey(item.source, item.productId))).map(item => ({ ...item, selected: false }))];
    registry.scopes[scope.value] = saved;
    const guest = registry.scopes.guest;
    if (guest) guest.items = readItems(guest.items).filter(item => !transferred.some(line => itemKey(line.source, line.productId) === itemKey(item.source, item.productId) && line.qty === item.qty));
    transfer.owner = scope.value;
    saveRegistry(registry);
    initialized.value = false;
    init();
  }

  function acceptGuestBuyNow(id: string) {
    init();
    if (!id || !scope.value.startsWith('user:') || buyNowContext.value?.id === id) return;
    const registry = readRegistry();
    const guest = registry.scopes.guest;
    if (guest?.buyNow?.id !== id) return;
    const saved = registry.scopes[scope.value] || { items: [] };
    saved.buyNow = guest.buyNow;
    guest.buyNow = undefined;
    registry.scopes[scope.value] = saved;
    saveRegistry(registry);
    initialized.value = false;
    init();
  }

  function restoreLegacy(expectedScope: string) {
    init();
    if (scope.value !== expectedScope || !legacyAvailable.value) throw new Error('账号或旧版购物车状态已变化');
    const registry = readRegistry();
    if (registry.legacyOwner) throw new Error('旧版购物车已恢复，不重复导入');
    const existing = new Set(items.value.map(item => itemKey(item.source, item.productId)));
    registry.scopes[scope.value] = { items: [...items.value, ...legacyItems.value.filter(item => !existing.has(itemKey(item.source, item.productId))).map(item => ({ ...item, selected: false }))], buyNow: buyNowContext.value };
    registry.legacyOwner = scope.value;
    saveRegistry(registry);
    initialized.value = false;
    init();
  }

  function add(productId: number, qty = 1) {
    init();
    const key = itemKey('mock', productId);
    const exist = items.value.find(item => itemKey(item.source, item.productId) === key);
    if (exist) {
      exist.qty += qty;
      exist.selected = true;
    } else {
      items.value.unshift({ productId, source: 'mock', qty, addedAt: new Date().toISOString(), selected: true });
    }
    return persist();
  }

  function addReal(snapshot: CartProductSnapshot, qty = 1) {
    init();
    const productId = snapshot.id;
    const key = itemKey('real', productId);
    const exist = items.value.find(item => itemKey(item.source, item.productId) === key);
    if (exist) {
      exist.qty = boundedQuantity(exist.qty + qty, snapshot.stock);
      exist.selected = true;
      exist.snapshot = snapshot;
    } else {
      items.value.unshift({ productId, source: 'real', qty: boundedQuantity(qty, snapshot.stock), addedAt: new Date().toISOString(), selected: true, snapshot });
    }
    return persist();
  }

  function setBuyNow(productId: number, qty = 1) {
    init();
    const now = new Date().toISOString();
    const contextId = createBuyNowContextId();
    buyNowContext.value = {
      id: contextId,
      createdAt: now,
      item: {
        productId,
        source: 'mock',
        qty: Math.max(1, qty),
        addedAt: now,
        selected: true
      }
    };
    persistBuyNow();
    return contextId;
  }

  function setBuyNowReal(snapshot: CartProductSnapshot, qty = 1) {
    init();
    const now = new Date().toISOString();
    const contextId = createBuyNowContextId();
    buyNowContext.value = {
      id: contextId,
      createdAt: now,
      item: {
        productId: snapshot.id,
        source: 'real',
        qty: Math.max(1, qty),
        addedAt: now,
        selected: true,
        snapshot
      }
    };
    persistBuyNow();
    return contextId;
  }

  function clearBuyNow(contextId: string) {
    init();
    if (buyNowContext.value?.id !== contextId) return;
    buyNowContext.value = undefined;
    persistBuyNow();
  }

  function getBuyNowItem(contextId: string): EnrichedCartItem | undefined {
    if (!contextId || buyNowContext.value?.id !== contextId) return undefined;
    const item = enrich(buyNowContext.value.item);
    return item;
  }

  function boundedQuantity(qty: number, stock: number) {
    const next = Math.min(Math.max(1, Math.floor(Number(qty) || 1)), Math.max(1, stock));
    if (next !== qty) uni.showToast({ title: '数量已调整至可购买范围', icon: 'none' });
    return next;
  }

  async function refreshRealItems(selected: EnrichedCartItem[], contextId?: string) {
    init();
    const version = scopeVersion;
    const records = await Promise.all(selected.map(item => fetchStorefrontProductDetail(item.productId)));
    init();
    if (version !== scopeVersion) throw new Error('购物车账号已变化，请重新确认');
    const failures: string[] = [];
    records.forEach((record, index) => {
      const item = selected[index];
      const stored = contextId
        ? (buyNowContext.value?.id === contextId ? buyNowContext.value.item : undefined)
        : items.value.find(value => itemKey(value.source, value.productId) === item.key);
      if (stored) {
        stored.snapshot = {
          ...stored.snapshot!, id: record.id, title: record.title, sellerId: record.sellerId,
          sellerName: record.sellerName || stored.snapshot?.sellerName || '认证买手',
          cover: record.images?.[0], price: record.price, shippingFee: record.shippingFee ?? 0,
          tax: record.taxFee ?? 0, stock: record.stock, status: record.status
        };
      }
      if (record.status !== 'ON_SALE' || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > record.stock) {
        failures.push(record.title);
      }
    });
    if (contextId) persistBuyNow();
    else if (!persist()) throw new Error('购物车刷新未保存，请重试');
    if (failures.length) throw new Error(`商品已下架或库存不足：${failures.join('、')}，请返回调整`);
  }

  function update(key: string, qty: number) {
    init();
    const exist = items.value.find(item => itemKey(item.source, item.productId) === key);
    if (exist) {
      exist.qty = exist.source === 'real'
        ? boundedQuantity(qty, exist.snapshot?.stock ?? 0)
        : Math.max(1, Math.floor(qty));
      persist();
    }
  }

  function remove(key: string) {
    init();
    items.value = items.value.filter(item => itemKey(item.source, item.productId) !== key);
    return persist();
  }

  function setSelected(key: string, selected: boolean) {
    init();
    const exist = items.value.find(item => itemKey(item.source, item.productId) === key);
    if (exist) {
      exist.selected = selected;
      persist();
    }
  }

  function setAllSelected(selected: boolean) {
    init();
    items.value.forEach(i => {
      i.selected = selected;
    });
    persist();
  }

  function clear() {
    init();
    items.value = [];
    persist();
  }

  const enrichedItems = computed<EnrichedCartItem[]>(() => items.value.map(enrich));
  const validItems = computed(() => enrichedItems.value.filter(i => i.available));
  const selectedItems = computed(() => enrichedItems.value.filter(i => i.selected && i.available));

  const count = computed(() => items.value.length);
  const totalQty = computed(() => items.value.reduce((s, i) => s + i.qty, 0));
  const selectedQty = computed(() => selectedItems.value.reduce((s, i) => s + i.qty, 0));
  const allSelected = computed(
    () => validItems.value.length > 0 && validItems.value.every(i => i.selected)
  );

  const subTotal = computed(() =>
    selectedItems.value.reduce((s, i) => s + Number(i.subtotal), 0).toFixed(2)
  );
  const shippingFeeTotal = computed(() =>
    selectedItems.value.reduce((s, i) => s + Number(i.shippingFee), 0).toFixed(2)
  );
  const taxTotal = computed(() =>
    selectedItems.value.reduce((s, i) => s + Number(i.tax), 0).toFixed(2)
  );
  const grandTotal = computed(() =>
    (Number(subTotal.value) + Number(shippingFeeTotal.value) + Number(taxTotal.value)).toFixed(2)
  );

  return {
    scope,
    legacyItems,
    legacyAvailable,
    restoreLegacy,
    createGuestTransfer,
    acceptGuestTransfer,
    acceptGuestBuyNow,
    items,
    enrichedItems,
    validItems,
    selectedItems,
    count,
    totalQty,
    selectedQty,
    allSelected,
    subTotal,
    shippingFeeTotal,
    taxTotal,
    grandTotal,
    init,
    add,
    addReal,
    setBuyNow,
    setBuyNowReal,
    clearBuyNow,
    getBuyNowItem,
    refreshRealItems,
    update,
    remove,
    setSelected,
    setAllSelected,
    clear
  };
});

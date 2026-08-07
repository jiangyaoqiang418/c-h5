import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { STORAGE_KEY } from '@shared';
import { PRODUCTS } from '@shared/mock/data/products';
import { storage } from '@/utils/storage';

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

function itemKey(source: CartItem['source'], productId: CartItem['productId']): string {
  return `${source}:${String(productId)}`;
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
    ? !!product && product.stock > 0
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
  const items = ref<CartItem[]>([]);
  const initialized = ref(false);

  function persist() {
    storage.set(STORAGE_KEY.cart, JSON.stringify(items.value));
  }

  function init() {
    if (initialized.value) return;
    try {
      const raw = storage.get<string>(STORAGE_KEY.cart);
      if (raw) {
        const parsed = JSON.parse(raw) as Array<Partial<CartItem> & { productId?: unknown }>;
        items.value = parsed.flatMap(item => {
          if (typeof item.productId !== 'string' && typeof item.productId !== 'number') return [];
          const source: CartItem['source'] = item.source === 'real' ? 'real' : 'mock';
          if (source === 'real' && !item.snapshot) return [];
          return [{
            productId: item.productId,
            source,
            qty: Math.max(1, Number(item.qty) || 1),
            addedAt: item.addedAt || new Date().toISOString(),
            selected: item.selected !== false,
            snapshot: source === 'real' ? item.snapshot : undefined
          }];
        });
      }
    } catch {
      items.value = [];
    }
    initialized.value = true;
  }

  function add(productId: number, qty = 1) {
    const key = itemKey('mock', productId);
    const exist = items.value.find(item => itemKey(item.source, item.productId) === key);
    if (exist) {
      exist.qty += qty;
      exist.selected = true;
    } else {
      items.value.unshift({ productId, source: 'mock', qty, addedAt: new Date().toISOString(), selected: true });
    }
    persist();
  }

  function addReal(snapshot: CartProductSnapshot, qty = 1) {
    const productId = snapshot.id;
    const key = itemKey('real', productId);
    const exist = items.value.find(item => itemKey(item.source, item.productId) === key);
    if (exist) {
      exist.qty += qty;
      exist.selected = true;
      exist.snapshot = snapshot;
    } else {
      items.value.unshift({ productId, source: 'real', qty, addedAt: new Date().toISOString(), selected: true, snapshot });
    }
    persist();
  }

  function update(key: string, qty: number) {
    const exist = items.value.find(item => itemKey(item.source, item.productId) === key);
    if (exist) {
      exist.qty = Math.max(1, qty);
      persist();
    }
  }

  function remove(key: string) {
    items.value = items.value.filter(item => itemKey(item.source, item.productId) !== key);
    persist();
  }

  function setSelected(key: string, selected: boolean) {
    const exist = items.value.find(item => itemKey(item.source, item.productId) === key);
    if (exist) {
      exist.selected = selected;
      persist();
    }
  }

  function setAllSelected(selected: boolean) {
    items.value.forEach(i => {
      i.selected = selected;
    });
    persist();
  }

  function clear() {
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
    update,
    remove,
    setSelected,
    setAllSelected,
    clear
  };
});

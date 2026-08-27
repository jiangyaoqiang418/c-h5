/**
 * 本地图片资源 helper。
 *
 * Mock 仅用于补齐无真实图片字段时的视觉占位；线上真实图片始终优先。
 * 所有静态 fallback 均使用随包资源，避免 H5 与 App 依赖第三方图片服务。
 */
const PRODUCT = '/static/new-ui/placeholders/placeholder-product.png';
const AVATAR = '/static/new-ui/placeholders/placeholder-avatar.png';
const UPLOAD = '/static/new-ui/placeholders/placeholder-upload.png';

const HERO_IMAGES = {
  fashion: '/static/new-ui/backgrounds/bg-home-luxury-hero.png',
  electronics: '/static/new-ui/backgrounds/bg-ai-technology.png',
  cosmetics: '/static/new-ui/backgrounds/bg-vip-gold-red.png',
  travel: '/static/new-ui/backgrounds/bg-purchase-globe.png',
  luxury: '/static/new-ui/backgrounds/bg-home-luxury-hero.png',
  home: '/static/new-ui/backgrounds/bg-account-globe.png'
} as const;

export type HeroTheme = keyof typeof HERO_IMAGES;

/** 商品图 fallback：保留参数以兼容既有 mock 调用。 */
export function productImageUrl(_productId: number, _size = 720, _categoryPath?: string): string {
  return PRODUCT;
}

/** 商品多图 fallback：仅在 mock 场景展示同一受控占位资源。 */
export function productImageUrls(productId: number, count = 5, size = 720, categoryPath?: string): string[] {
  return Array.from({ length: count }, () => productImageUrl(productId, size, categoryPath));
}

/** 用户头像 fallback：style 参数保留兼容既有调用。 */
export function avatarUrl(_userId: number, _style: 'personas' | 'avataaars' | 'bottts' | 'notionists' = 'notionists'): string {
  return AVATAR;
}

export function heroBrandImage(theme: HeroTheme = 'luxury', _width = 1600): string {
  return HERO_IMAGES[theme];
}

export function bannerImage(index: number, width = 1200): string {
  const keys = Object.keys(HERO_IMAGES) as HeroTheme[];
  return heroBrandImage(keys[index % keys.length], width);
}

export function uploadPlaceholderUrl(_seed: string | number, _size = 400): string {
  return UPLOAD;
}

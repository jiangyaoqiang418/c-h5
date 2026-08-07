import { realOrderRequest, realOrderUpload } from '../request';

export function fetchMyProducts(query: Api.RealProduct.ProductPageQuery = {}) {
  return realOrderRequest<Api.RealProduct.ProductPage, Api.RealProduct.ProductPageQuery>({
    url: '/products/my/page',
    method: 'POST',
    data: {
      pageNo: query.pageNo || 1,
      pageSize: query.pageSize || 50,
      keyword: query.keyword,
      status: query.status,
      categoryId: query.categoryId
    }
  });
}

export function fetchStorefrontProducts(query: Api.RealProduct.PublicProductPageQuery = {}) {
  return realOrderRequest<Api.RealProduct.PublicProductPage, Api.RealProduct.PublicProductPageQuery>({
    url: '/storefront/products/page',
    method: 'POST',
    data: {
      pageNo: query.pageNo || 1,
      pageSize: query.pageSize || 20,
      keyword: query.keyword,
      categoryId: query.categoryId,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      afterSaleType: query.afterSaleType,
      overseasClearance: query.overseasClearance,
      sortBy: query.sortBy || 'DEFAULT'
    }
  });
}

export function fetchBuyerProductDetail(id: string | number) {
  return realOrderRequest<Api.RealProduct.ProductDTO>({
    url: '/products/detail',
    params: { id }
  });
}

export function createProduct(params: Api.RealProduct.ProductCreateParams): Promise<string | number> {
  return realOrderRequest<string | number, Api.RealProduct.ProductCreateParams>({
    url: '/products/create',
    method: 'POST',
    data: params
  });
}

export function setProductShelf(id: string | number, onShelf: boolean): Promise<string | number> {
  return realOrderRequest<string | number, { id: string | number; onShelf: boolean }>({
    url: '/products/shelf',
    method: 'PUT',
    data: { id, onShelf }
  });
}

export function uploadProductImage(filePath: string) {
  return realOrderUpload<Api.RealProduct.FileUploadResult>({
    url: '/files/upload',
    filePath,
    name: 'file',
    params: { dir: 'product' }
  });
}

export function fetchStorefrontRecommend(limit = 6) {
  return realOrderRequest<Api.RealProduct.ProductDTO[]>({
    url: '/storefront/recommend',
    params: { limit }
  });
}

export function fetchBestSellers(pageNo = 1, pageSize = 6) {
  return realOrderRequest<Api.RealProduct.ProductPage, { pageNo: number; pageSize: number }>({
    url: '/storefront/best-sellers/page',
    method: 'POST',
    data: { pageNo, pageSize }
  });
}

export function fetchNewArrivals(pageNo = 1, pageSize = 6) {
  return realOrderRequest<Api.RealProduct.ProductPage, { pageNo: number; pageSize: number }>({
    url: '/storefront/new-arrivals/page',
    method: 'POST',
    data: { pageNo, pageSize }
  });
}

export function fetchFlashSale(limit = 4) {
  return realOrderRequest<Api.RealProduct.FlashSaleItemVO[]>({
    url: '/storefront/flash-sale',
    params: { limit }
  });
}

export function fetchBanners() {
  return realOrderRequest<Api.RealProduct.BannerDTO[]>({
    url: '/banners/list'
  });
}

export function fetchStorefrontProductDetail(id: string | number) {
  return realOrderRequest<Api.RealProduct.ProductDTO>({
    url: '/storefront/product/detail',
    params: { id }
  });
}

export function recordProductBrowse(id: string | number): Promise<boolean> {
  return realOrderRequest<boolean, { id: string | number }>({
    url: '/storefront/browse',
    method: 'POST',
    data: { id }
  });
}

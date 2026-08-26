declare namespace Api {
  namespace RealProduct {
    type ProductStatus = 'REVIEWING' | 'REJECTED' | 'ON_SALE' | 'OFF_SHELF' | 'FROZEN';
    type ProductQueryStatus = 'PENDING' | 'ON_SALE' | 'REJECTED' | 'OFF_SHELF';
    type AfterSaleType = 'SEVEN_DAY_NO_REASON' | 'NONE' | 'SHOP_WARRANTY' | 'NATIONAL_WARRANTY';

    interface ProductImageParam {
      bucket: string;
      filePath: string;
    }

    interface FileUploadResult extends ProductImageParam {
      id: string | number;
      scene?: string;
      url: string;
      privateAccess?: boolean;
      expireAt?: string | number;
      originalName?: string;
      contentType?: string;
      size?: string | number;
      duration?: number;
      bizType?: string;
      bizId?: string | number;
    }

    interface ProductDTO {
      id: string | number;
      sellerId: string | number;
      sellerName?: string;
      title: string;
      categoryId: string | number;
      categoryName?: string;
      price: number;
      shippingFee?: number;
      taxFee?: number;
      stock: number;
      afterSaleType: AfterSaleType;
      overseasClearance?: boolean;
      brief?: string;
      description?: string;
      status: ProductStatus;
      statusText?: string;
      reviewComment?: string;
      reviewerId?: string | number;
      reviewedAt?: string | number;
      salesCount?: string | number;
      viewCount?: string | number;
      favoriteCount?: string | number;
      images?: string[];
      createdAt?: string | number;
      updatedAt?: string | number;
    }

    interface ProductPage {
      pageNo?: number;
      pageSize?: number;
      current?: number;
      size?: number;
      total: number;
      records: ProductDTO[];
    }

    interface ProductPageQuery {
      pageNo?: number;
      pageSize?: number;
      keyword?: string;
      status?: ProductQueryStatus;
      categoryId?: string | number;
    }

    interface FavoritePageQuery {
      pageNo?: number;
      pageSize?: number;
    }

    type PublicProductSort = 'DEFAULT' | 'SALES' | 'NEW' | 'PRICE_ASC' | 'PRICE_DESC';

    interface PublicProductPageQuery {
      pageNo?: number;
      pageSize?: number;
      keyword?: string;
      categoryId?: string | number;
      minPrice?: number;
      maxPrice?: number;
      afterSaleType?: AfterSaleType;
      overseasClearance?: boolean;
      sortBy?: PublicProductSort;
    }

    interface ProductListVO {
      id: string | number;
      title: string;
      coverImage?: string;
      price: number;
      salesCount?: string | number;
      stock: number;
      categoryId: string | number;
      categoryName?: string;
      afterSaleType: AfterSaleType;
      afterSaleTypeText?: string;
      overseasClearance?: boolean;
      sellerId: string | number;
      sellerName?: string;
    }

    interface PublicProductPage {
      pageNo?: number;
      pageSize?: number;
      total: number;
      records: ProductListVO[];
    }

    interface ProductCreateParams {
      title: string;
      categoryId: string | number;
      price: number;
      shippingFee?: number;
      taxFee?: number;
      stock: number;
      afterSaleType: AfterSaleType;
      overseasClearance?: boolean;
      brief?: string;
      description?: string;
      images: ProductImageParam[];
    }

    interface FlashSaleItemVO {
      productId: string | number;
      title: string;
      image?: string;
      price: number;
      flashPrice: number;
      flashStock?: number;
      stock: number;
      salesCount?: string | number;
      sessionId: string | number;
      sessionEndTime: string | number;
    }

    interface BannerDTO {
      id: string | number;
      image: string;
      title?: string;
      subtitle?: string;
      tag?: string;
      pathTo?: string;
      sortOrder?: number;
      enabled?: boolean;
      createdAt?: string | number;
      updatedAt?: string | number;
    }
  }
}

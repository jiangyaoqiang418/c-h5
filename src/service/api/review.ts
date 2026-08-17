import { realOrderRequest, realOrderUpload } from '../request';

export function fetchReviewableOrders(query: Api.RealReview.PageQuery = {}) {
  return realOrderRequest<Api.RealReview.Page<Api.RealReview.ReviewableOrderVO>, Api.RealReview.PageQuery>({ url: '/reviews/reviewable/page', method: 'POST', data: { pageNo: query.pageNo || 1, pageSize: query.pageSize || 20 } });
}
export function fetchMyReviews(query: Api.RealReview.ReviewQuery = {}) {
  return realOrderRequest<Api.RealReview.Page<Api.RealReview.ReviewDTO>, Api.RealReview.ReviewQuery>({ url: '/reviews/mine/page', method: 'POST', data: { pageNo: query.pageNo || 1, pageSize: query.pageSize || 20, status: query.status, hasImage: query.hasImage } });
}
export function fetchReceivedReviews(query: Api.RealReview.ReviewQuery = {}) {
  return realOrderRequest<Api.RealReview.Page<Api.RealReview.ReviewDTO>, Api.RealReview.ReviewQuery>({ url: '/reviews/received/page', method: 'POST', data: { pageNo: query.pageNo || 1, pageSize: query.pageSize || 20, status: query.status, hasImage: query.hasImage } });
}
export function fetchReviewDetail(id: Api.RealReview.Id) { return realOrderRequest<Api.RealReview.ReviewDTO>({ url: '/reviews/detail', params: { id } }); }
export function createReview(params: Api.RealReview.ReviewSubmitParams) { return realOrderRequest<Api.RealReview.Id, Api.RealReview.ReviewSubmitParams>({ url: '/reviews/create', method: 'POST', data: params }); }
export function deleteReview(id: Api.RealReview.Id) { return realOrderRequest<Api.RealReview.Id>({ url: '/reviews/delete', method: 'DELETE', params: { id } }); }
export function replyReview(params: Api.RealReview.ReviewReplyParams) { return realOrderRequest<Api.RealReview.Id, Api.RealReview.ReviewReplyParams>({ url: '/reviews/reply', method: 'PUT', data: params }); }
export function createReviewAppeal(params: Api.RealReview.ReviewAppealParams) { return realOrderRequest<Api.RealReview.Id, Api.RealReview.ReviewAppealParams>({ url: '/reviews/appeals/create', method: 'POST', data: params }); }
export function fetchStorefrontReviews(query: Api.RealReview.ProductReviewQuery) { return realOrderRequest<Api.RealReview.Page<Api.RealReview.ReviewDTO>, Api.RealReview.ProductReviewQuery>({ url: '/storefront/reviews/page', method: 'POST', data: { ...query, pageNo: query.pageNo || 1, pageSize: query.pageSize || 20 } }); }
export function fetchReviewSummary(productId: Api.RealReview.Id) { return realOrderRequest<Api.RealReview.ReviewSummaryDTO>({ url: '/storefront/reviews/summary', params: { productId } }); }
export function fetchSellerRating(sellerId: Api.RealReview.Id) { return realOrderRequest<Api.RealReview.SellerRatingDTO>({ url: '/storefront/reviews/seller-rating', params: { sellerId } }); }
export function uploadReviewImage(filePath: string) { return realOrderUpload<{ url?: string; path?: string; fullUrl?: string }>({ url: '/files/upload', filePath, name: 'file', params: { dir: 'review' } }); }

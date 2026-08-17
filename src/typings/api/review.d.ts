declare namespace Api.RealReview {
  type Id = string | number;
  type ReviewStatus = 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'HIDDEN';

  interface Page<T> { pageNo?: number; pageSize?: number; current?: number; size?: number; total: number; records: T[]; }
  interface PageQuery { pageNo?: number; pageSize?: number; }
  interface ReviewQuery extends PageQuery { status?: ReviewStatus; hasImage?: boolean; }
  interface ProductReviewQuery extends ReviewQuery { productId: Id; productScore?: 1 | 2 | 3 | 4 | 5; }
  interface ReviewSubmitParams { orderId: Id; productScore: 1 | 2 | 3 | 4 | 5; sellerScore: 1 | 2 | 3 | 4 | 5; content?: string; images?: string[]; anonymous?: boolean; }
  interface ReviewReplyParams { reviewId: Id; content: string; }
  interface ReviewAppealParams { reviewId: Id; reason: string; evidenceImages?: string[]; }

  interface ReviewDTO {
    reviewId: Id; orderId: Id; orderNo?: string; productId?: Id; productTitle?: string; productImage?: string;
    sellerId?: Id; sellerName?: string; userId?: Id; userName?: string; anonymous?: boolean;
    productScore: number; sellerScore: number; content?: string; images?: string[]; hasImage?: boolean;
    status: ReviewStatus; statusText?: string; rejectReason?: string; replyContent?: string; repliedAt?: Id;
    appealId?: Id; appealStatus?: 'PENDING' | 'APPROVED' | 'REJECTED'; createdAt: Id;
  }

  interface ReviewableOrderVO {
    orderId: Id; orderNo?: string; productId?: Id; productTitle?: string; productImage?: string;
    sellerId?: Id; sellerName?: string; quantity?: number; totalAmount?: string | number;
    completedAt?: Id; reviewDeadline?: Id;
  }

  interface ReviewSummaryDTO { total?: number; totalCount?: number; averageScore?: number; avgScore?: number; goodRate?: string | number; score1Count?: number; score2Count?: number; score3Count?: number; score4Count?: number; score5Count?: number; }
  interface SellerRatingDTO { sellerId?: Id; averageScore?: number; avgScore?: number; total?: number; totalCount?: number; }
}

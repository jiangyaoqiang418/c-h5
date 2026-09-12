export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RequestOptions<TData = unknown> {
  url: string;
  method?: HttpMethod;
  data?: TData;
  params?: Record<string, string | number | boolean | undefined | null>;
  header?: Record<string, string>;
  requireToken?: boolean;
  timeout?: number;
  /** 幂等回查必须区分真实 data:null 与缺失/损坏响应。 */
  requireDataEnvelope?: boolean;
}

export interface UploadOptions {
  url: string;
  filePath: string;
  name: string;
  params?: Record<string, string | number | boolean | undefined | null>;
  formData?: Record<string, string | number | boolean>;
  header?: Record<string, string>;
  requireToken?: boolean;
  timeout?: number;
}

export interface ServiceEnvelope<T> {
  code?: number | string;
  message?: string;
  msg?: string;
  data?: T;
  success?: boolean;
}

export type RequestErrorKind = 'config' | 'network' | 'http' | 'business' | 'unauthorized';

export class RequestError extends Error {
  readonly kind: RequestErrorKind;
  readonly statusCode?: number;
  readonly code?: number | string;
  readonly traceId?: string;

  constructor(options: {
    kind: RequestErrorKind;
    message: string;
    statusCode?: number;
    code?: number | string;
    traceId?: string;
  }) {
    // 仅收敛明确的部署诊断，不改变错误种类、状态码和业务码。
    super(options.kind === 'config' || /chain\.callback\.base_url|swagger|nacos|(?:java|org\.springframework)\.|SQLSyntax|127\.0\.0\.1|localhost|未接入.*接口|缺少.*配置/i.test(options.message)
      ? '服务暂不可用，请稍后重试'
      : options.message);
    this.name = 'RequestError';
    this.kind = options.kind;
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.traceId = options.traceId;
  }
}

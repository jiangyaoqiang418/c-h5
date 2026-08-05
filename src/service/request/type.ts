export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RequestOptions<TData = unknown> {
  url: string;
  method?: HttpMethod;
  data?: TData;
  params?: Record<string, string | number | boolean | undefined | null>;
  header?: Record<string, string>;
  requireToken?: boolean;
  timeout?: number;
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

  constructor(options: {
    kind: RequestErrorKind;
    message: string;
    statusCode?: number;
    code?: number | string;
  }) {
    super(options.message);
    this.name = 'RequestError';
    this.kind = options.kind;
    this.statusCode = options.statusCode;
    this.code = options.code;
  }
}

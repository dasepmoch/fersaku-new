export type ApiRequestMeta = {
  requestId: string;
  timestamp: string;
};

export type ApiEnvelope<T> = {
  data: T;
  meta: ApiRequestMeta;
};

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
  previousCursor: string | null;
  hasMore: boolean;
};

export type ApiProblem = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
};

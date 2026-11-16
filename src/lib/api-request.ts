export interface ApiRequest {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  token?: string;
  body?: unknown;
  timeoutMs?: number;
}

interface ApiErrorOptions {
  status?: number;
  body?: unknown;
  context: { url: string; method: string; timeoutMs: number };
  cause?: unknown;
}

/** A failed call to the Long Tail API: a non-2xx status, a timeout or a network error. */
export class ApiRequestError extends Error {
  readonly status?: number;
  readonly body?: unknown;
  readonly context: ApiErrorOptions['context'];

  constructor(message: string, options: ApiErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'ApiRequestError';
    this.status = options.status;
    this.body = options.body;
    this.context = options.context;
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** One JSON call to the Long Tail API. Throws ApiRequestError unless the status is 2xx. */
export async function requestApi<T>(baseUrl: string, request: ApiRequest): Promise<T> {
  const url = `${baseUrl}${request.path}`;
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const context = { url, method: request.method, timeoutMs };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  let text: string;
  try {
    res = await fetch(url, {
      method: request.method,
      headers: {
        'content-type': 'application/json',
        ...(request.token ? { authorization: `Bearer ${request.token}` } : {}),
      },
      ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
      signal: controller.signal,
    });
    text = await res.text();
  } catch (err) {
    const what = controller.signal.aborted ? `timed out after ${timeoutMs}ms` : 'failed';
    throw new ApiRequestError(`${request.method} ${url} ${what}`, { context, cause: err });
  } finally {
    clearTimeout(timer);
  }
  const body = parseBody(text, res.headers.get('content-type'));
  if (!res.ok) throw new ApiRequestError(`${request.method} ${url} returned ${res.status}`, { status: res.status, body, context });
  return body as T;
}

function parseBody(text: string, contentType: string | null): unknown {
  if (!text) return undefined;
  return contentType?.includes('json') ? JSON.parse(text) : text;
}

import { ApiRequestError, requestApi } from '../../../src/lib/api-request';
import { stubFetch } from '../../helpers/fetch-stub';

const URL_BASE = 'http://lt.test';

afterEach(() => vi.unstubAllGlobals());

describe('requestApi', () => {
  it('sends JSON with the bearer token and parses the JSON reply', async () => {
    const { calls } = stubFetch({ 'POST /api/x': { body: { ok: true } } });
    const reply = await requestApi<{ ok: boolean }>(URL_BASE, { method: 'POST', path: '/api/x', token: 't1', body: { a: 1 } });
    expect(reply).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({ method: 'POST', body: { a: 1 }, authorization: 'Bearer t1' });
  });

  it('returns a non-JSON body as a string', async () => {
    stubFetch({ 'GET /health': { text: 'ok', contentType: 'text/plain' } });
    expect(await requestApi<string>(URL_BASE, { method: 'GET', path: '/health' })).toBe('ok');
  });

  it('returns undefined for an empty body', async () => {
    stubFetch({ 'DELETE /api/x': { status: 204 } });
    expect(await requestApi(URL_BASE, { method: 'DELETE', path: '/api/x' })).toBeUndefined();
  });

  it('throws a typed error with status, body and context on a non-2xx', async () => {
    stubFetch({ 'GET /api/x': { status: 409, body: { error: 'taken' } } });
    const err = await requestApi(URL_BASE, { method: 'GET', path: '/api/x' }).catch((e: ApiRequestError) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 409, body: { error: 'taken' }, context: { url: `${URL_BASE}/api/x`, method: 'GET' } });
  });

  it('keeps the network error as the cause, with no status', async () => {
    const cause = new TypeError('fetch failed');
    stubFetch({ 'GET /api/x': cause });
    const err = await requestApi<never>(URL_BASE, { method: 'GET', path: '/api/x' }).catch((e: ApiRequestError) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.status).toBeUndefined();
    expect(err.cause).toBe(cause);
  });

  it('aborts the request at the timeout', async () => {
    let aborted = false;
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => { aborted = true; reject(new DOMException('aborted', 'AbortError')); });
    }));
    const err = await requestApi<never>(URL_BASE, { method: 'GET', path: '/slow', timeoutMs: 20 }).catch((e: ApiRequestError) => e);
    expect(aborted).toBe(true);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.message).toContain('timed out after 20ms');
    expect(err.context.timeoutMs).toBe(20);
  });
});

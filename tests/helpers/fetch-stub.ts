import { vi } from 'vitest';

export interface StubbedCall { method: string; url: string; body?: unknown; authorization?: string }
type Reply = { status?: number; body?: unknown; text?: string; contentType?: string } | Error;

/** Replace global fetch with a route table keyed by "METHOD path"; records every call. */
export function stubFetch(routes: Record<string, Reply | Reply[] | ((call: StubbedCall) => Reply)>) {
  const calls: StubbedCall[] = [];
  const queues = new Map<string, Reply[]>();
  const mock = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    const { pathname, search } = new URL(url);
    const call: StubbedCall = {
      method, url,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      authorization: (init.headers as Record<string, string> | undefined)?.authorization,
    };
    calls.push(call);
    const key = [`${method} ${pathname}${search}`, `${method} ${pathname}`].find((k) => k in routes);
    if (!key) throw new Error(`unstubbed ${method} ${pathname}`);
    const route = routes[key];
    let reply: Reply;
    if (typeof route === 'function') reply = route(call);
    else if (Array.isArray(route)) {
      if (!queues.has(key)) queues.set(key, [...route]);
      const queue = queues.get(key)!;
      reply = queue.length > 1 ? queue.shift()! : queue[0];
    } else reply = route;
    if (reply instanceof Error) throw reply;
    const text = reply.text ?? (reply.body === undefined ? '' : JSON.stringify(reply.body));
    return new Response(text || null, {
      status: reply.status ?? 200,
      headers: { 'content-type': reply.contentType ?? 'application/json' },
    });
  });
  vi.stubGlobal('fetch', mock);
  return { calls, mock };
}

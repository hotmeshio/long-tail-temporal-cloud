// Plain values only: the Temporal workflow sandbox imports this file.

export const APP_ROLE = { API: 'api', WORKER: 'worker', BOTH: 'both' } as const;
export type AppRole = typeof APP_ROLE[keyof typeof APP_ROLE];

export const ROLE = { FABRICATION: 'fabrication' } as const;
export const ROLE_TYPE = { MEMBER: 'member' } as const;

export const TASK_QUEUE = 'fabrication-orders';
export const WORKFLOW = { FABRICATION_ORDER_REQUEST: 'fabricationOrderRequest' } as const;
export const ESCALATION_TYPE = { FABRICATION: 'fabrication' } as const;

export const ORDER_STATUS = {
  FABRICATED: 'fabricated',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;
export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];

export const ASSET = { MODEL: 'model', TICKET: 'ticket' } as const;
export const CONTENT_TYPE = { GCODE: 'text/x.gcode', JSON: 'application/json' } as const;

/** The workflow side's bot, the factory site's bot, and the bot a smoke run resolves with. */
export const BOT = { WORKFLOWS: 'temporal-workflows', SITE: 'fabrication-site', SMOKE: 'handoff-smoke' } as const;

export const DEFAULT_WAIT_TIMEOUT = '7d';
export const DEFAULT_QUANTITY = 1;

/** The signal key a site resolves an order's wait by. */
export function fabricationKey(orderId: string): string {
  return `fab-${orderId}`;
}

export const LOG_EVENTS = {
  API_STARTED: 'cloud.api.started',
  WORKER_STARTED: 'cloud.worker.started',
  WORKER_KEY_ISSUED: 'cloud.worker.key_issued',
  SHUTDOWN: 'cloud.shutdown',
  FATAL: 'cloud.fatal',
} as const;
export type LogEvent = typeof LOG_EVENTS[keyof typeof LOG_EVENTS];

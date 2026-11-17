// Plain values only: the Temporal workflow sandbox imports this file.

export const APP_ROLE = { API: 'api', WORKER: 'worker', BOTH: 'both' } as const;
export type AppRole = typeof APP_ROLE[keyof typeof APP_ROLE];

export const ROLE = {
  PRESCRIPTION_REVIEW: 'prescription-review',
  CUSTOMER_CARE: 'customer-care',
  ORDER_DESK: 'order-desk',
  PRODUCTION: 'production',
  CARRIER_PICKUP: 'carrier-pickup',
  SHIPPING_DESK: 'shipping-desk',
} as const;
export type Role = typeof ROLE[keyof typeof ROLE];
export const ROLE_TYPE = { MEMBER: 'member' } as const;

export const TASK_QUEUE = 'eyeglass-orders';
export const WORKFLOW = { EYEGLASS_ORDER_REQUEST: 'eyeglassOrderRequest' } as const;

export const ESCALATION_TYPE = {
  PRESCRIPTION_REVIEW: 'prescription-review',
  NEW_COPY: 'new-copy',
  MISSING_BLANK: 'missing-blank',
  PRODUCTION: 'production',
  SHIPPING: 'shipping',
} as const;
export const ESCALATION_SUBTYPE = { AWAITING_SITE: 'awaiting-site', AWAITING_PICKUP: 'awaiting-pickup' } as const;

export const ORDER_STATUS = {
  SHIPPED: 'shipped',
  REFUSED: 'refused',
  HELD: 'held',
  CLEARER_COPY: 'clearer-copy',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;
export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];

export const REVIEW_DECISION = { APPROVE: 'approve', REJECT: 'reject' } as const;
export const CARRIER_STATUS = { PICKED_UP: 'picked-up', REFUSED: 'refused' } as const;
export const CHASE_OUTCOME = { REBOOKED: 'rebooked', CANCELLED: 'cancelled' } as const;
export const CHASE_REASON = 'pickup-overdue';

/** The names a site reads the order's files by. */
export const ASSET = { FRAME: 'frame', PRESCRIPTION: 'prescription' } as const;
export type AssetName = typeof ASSET[keyof typeof ASSET];

export const ORDER_FILE = {
  PRESCRIPTION_PDF: 'prescription.pdf',
  PRESCRIPTION_JSON: 'prescription.json',
  FRAME_SUFFIX: '.gcode.3mf',
} as const;

/** The workflow side's bot, the factory site's bot, and the bot a smoke run resolves with. */
export const BOT = { WORKFLOWS: 'temporal-workflows', SITE: 'site-1', SMOKE: 'handoff-smoke' } as const;

export const ORDER_DEFAULTS = {
  FRAME_STYLE: 'round-48',
  LENS_MATERIAL: 'polycarbonate',
  COATING: 'anti-glare',
  CARRIER: 'Acme Freight',
} as const;

/** A parse at or above this confidence skips the review. */
export const CONFIDENCE_THRESHOLD = 0.85;
/** The role form version a review row is pinned to. */
export const REVIEW_SCHEMA_VERSION = 1;
export const REVIEW_PRIORITY = 2;
export const CHASE_PRIORITY = 1;

export const WAIT_TIMEOUT = {
  REVIEW: '72h',
  ORDER_DESK: '48h',
  PRODUCTION: '7d',
  PICKUP: '48h',
  CHASE: '24h',
} as const;
export const CHASE_AFTER = '48 hours';

/** A rebooked pickup gets one more wait. */
export const MAX_PICKUP_ROUNDS = 2;

export function workflowIdFor(orderId: string): string {
  return `order-${orderId}`;
}

export function orderFilePath(orderId: string, name: string): string {
  return `orders/${orderId}/${name}`;
}

export function reviewKey(workflowId: string): string {
  return `review-${workflowId}`;
}

export function newCopyKey(workflowId: string): string {
  return `copy-${workflowId}`;
}

export function blankKey(orderId: string): string {
  return `blank-${orderId}`;
}

/** The signal key a site resolves an order's wait by. */
export function productionKey(orderId: string): string {
  return `production-${orderId}`;
}

/** The signal key a carrier scan resolves by. A rebooked pickup waits under a numbered key. */
export function pickupKey(orderId: string, round = 1): string {
  return round === 1 ? `carrier-pickup-${orderId}` : `carrier-pickup-${orderId}-${round}`;
}

export function chaseKey(orderId: string): string {
  return `carrier-chase-${orderId}`;
}

export const LOG_EVENTS = {
  API_STARTED: 'cloud.api.started',
  WORKER_STARTED: 'cloud.worker.started',
  DEMO_PEOPLE_SEEDED: 'cloud.demo_people.seeded',
  SHUTDOWN: 'cloud.shutdown',
  FATAL: 'cloud.fatal',
} as const;
export type LogEvent = typeof LOG_EVENTS[keyof typeof LOG_EVENTS];

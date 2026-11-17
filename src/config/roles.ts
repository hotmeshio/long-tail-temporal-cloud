import type { LTRoleConfig } from '@hotmeshio/long-tail';

import { ASSET, CARRIER_STATUS, CHASE_OUTCOME, REVIEW_DECISION, ROLE } from '../modules/constants';

const num = (title: string, bind: string) => ({ type: 'number', title, 'x-lt-bind': bind });

export const PRESCRIPTION_REVIEW_FORM = {
  title: 'Review this prescription',
  'x-lt-layout': 'split',
  'x-lt-confidence': {
    tranches: [
      { below: 0.6, label: 'Low', tone: 'error' },
      { below: 0.85, label: 'Check', tone: 'warning' },
    ],
    facets: true,
  },
  'x-lt-order': [
    'prescription', 'orderId', 'confidence', 'summary',
    'rightSphere', 'leftSphere', 'rightCylinder', 'leftCylinder',
    'rightAxis', 'leftAxis', 'rightAdd', 'leftAdd',
    'pd', 'decision', 'reason', 'notes',
  ],
  required: ['decision', 'reason'],
  properties: {
    prescription: {
      type: 'string',
      title: 'Prescription',
      description: 'The prescription as received.',
      'x-lt-widget': 'document',
      'x-lt-source': `file.${ASSET.PRESCRIPTION}`,
    },
    orderId: { type: 'string', title: 'Order', readOnly: true },
    confidence: { type: 'number', title: 'Parse confidence', readOnly: true },
    summary: { type: 'string', title: "Model's note", readOnly: true, 'x-lt-span': 2 },
    rightSphere: num('Right sphere', 'right.sphere'),
    leftSphere: num('Left sphere', 'left.sphere'),
    rightCylinder: num('Right cylinder', 'right.cylinder'),
    leftCylinder: num('Left cylinder', 'left.cylinder'),
    rightAxis: num('Right axis', 'right.axis'),
    leftAxis: num('Left axis', 'left.axis'),
    rightAdd: num('Right add', 'right.add'),
    leftAdd: num('Left add', 'left.add'),
    pd: { type: 'number', title: 'PD' },
    decision: {
      type: 'string',
      title: 'Decision',
      'x-lt-options': [
        { value: REVIEW_DECISION.APPROVE, label: 'Confirm' },
        { value: REVIEW_DECISION.REJECT, label: 'Ask for a clearer copy' },
      ],
    },
    reason: {
      type: 'string',
      format: 'textarea',
      title: 'What is unreadable',
      'x-lt-showIf': `resolver.decision=${REVIEW_DECISION.REJECT}`,
      'x-lt-span': 2,
    },
    notes: { type: 'string', format: 'textarea', title: 'Notes', 'x-lt-span': 2 },
  },
};

export const PRESCRIPTION_REVIEW_LIST = {
  'x-lt-layout': 'facet-table',
  'x-lt-columns': [
    { label: 'Order', value: '{{metadata.orderId}}', priority: 1 },
    { label: 'Confidence', value: '{{metadata.confidence}}', priority: 2 },
    { label: 'Claimed by', value: '{{escalation.assigned_to}}', format: 'user', priority: 2 },
    { label: 'Waiting', value: '{{escalation.created_at}}', format: 'age' },
  ],
};

export const CUSTOMER_CARE_FORM = {
  title: 'Ask for a new copy',
  required: ['reply'],
  'x-lt-order': ['orderId', 'reply'],
  properties: {
    orderId: { type: 'string', title: 'Order', readOnly: true },
    reply: { type: 'string', format: 'textarea', title: 'What the customer said' },
  },
};

export const ORDER_DESK_FORM = {
  title: 'Which lens blank lot fills this order?',
  description: 'Name a substitute lot or the restock lot that covers this prescription.',
  required: ['lotNumber'],
  'x-lt-order': ['lotNumber', 'note'],
  properties: {
    lotNumber: { type: 'string', title: 'Lens blank lot', description: 'The lot number, for example LOT-4417' },
    note: { type: 'string', format: 'textarea', title: 'Note' },
  },
};

export const PRODUCTION_FORM = {
  title: 'Report production',
  required: ['completed', 'site'],
  'x-lt-order': ['completed', 'site', 'binKey', 'destination', 'notes'],
  properties: {
    completed: { type: 'boolean', title: 'Completed', default: true },
    site: { type: 'string', title: 'Site' },
    binKey: { type: 'string', title: 'Bin' },
    destination: { type: 'string', title: 'Destination' },
    notes: { type: 'string', format: 'textarea', title: 'Notes' },
  },
};

export const PRODUCTION_LIST = {
  'x-lt-layout': 'facet-table',
  'x-lt-columns': [
    { label: 'Order', value: '{{metadata.orderId}}', priority: 1 },
    { label: 'Frame', value: '{{metadata.frameStyle}}', priority: 2 },
    { label: 'Lens blank lot', value: '{{metadata.lotNumber}}', priority: 2 },
    { label: 'Claimed by', value: '{{escalation.assigned_to}}', format: 'user', priority: 2 },
    { label: 'Waiting', value: '{{escalation.created_at}}', format: 'age' },
  ],
};

export const CARRIER_PICKUP_FORM = {
  title: 'Confirm the carrier pickup',
  required: ['carrierStatus', 'scannedAt'],
  'x-lt-order': ['carrierStatus', 'scannedAt', 'refusalNote'],
  properties: {
    carrierStatus: {
      type: 'string',
      title: 'Carrier status',
      'x-lt-options': [
        { value: CARRIER_STATUS.PICKED_UP, label: 'Picked up' },
        { value: CARRIER_STATUS.REFUSED, label: 'Refused' },
      ],
    },
    scannedAt: { type: 'string', format: 'date-time', title: 'Scanned at' },
    refusalNote: {
      type: 'string',
      format: 'textarea',
      title: 'Why the carrier refused it',
      'x-lt-showIf': `resolver.carrierStatus=${CARRIER_STATUS.REFUSED}`,
    },
  },
};

export const CARRIER_PICKUP_LIST = {
  'x-lt-layout': 'facet-table',
  'x-lt-columns': [
    { label: 'Order', value: '{{metadata.orderId}}', priority: 1 },
    { label: 'Carrier', value: '{{metadata.carrier}}', priority: 2 },
    { label: 'Booking', value: '{{metadata.bookingRef}}', priority: 2 },
    { label: 'Waiting', value: '{{escalation.created_at}}', format: 'age' },
  ],
};

export const SHIPPING_DESK_FORM = {
  title: 'Chase the carrier',
  required: ['outcome', 'pickupAt'],
  'x-lt-order': ['outcome', 'pickupAt', 'note'],
  properties: {
    outcome: {
      type: 'string',
      title: 'Outcome',
      'x-lt-options': [
        { value: CHASE_OUTCOME.REBOOKED, label: 'Rebooked the pickup' },
        { value: CHASE_OUTCOME.CANCELLED, label: 'Cancel the shipment' },
      ],
    },
    pickupAt: {
      type: 'string',
      format: 'date-time',
      title: 'New pickup time',
      'x-lt-showIf': `resolver.outcome=${CHASE_OUTCOME.REBOOKED}`,
    },
    note: { type: 'string', format: 'textarea', title: 'Note' },
  },
};

/** The queues an order moves through. Each role owns the form its rows are closed with. */
export const roles: LTRoleConfig[] = [
  {
    role: ROLE.PRESCRIPTION_REVIEW,
    title: 'Prescription review',
    form_schema: PRESCRIPTION_REVIEW_FORM,
    list_schema: PRESCRIPTION_REVIEW_LIST,
    enforce_schema: true,
    properties: {
      on_cancel: 'The order goes to customer care to ask the customer for a new copy.',
      on_timeout: 'The order stays on hold.',
      worked_by: 'both',
    },
  },
  {
    role: ROLE.CUSTOMER_CARE,
    title: 'Customer care',
    form_schema: CUSTOMER_CARE_FORM,
  },
  {
    role: ROLE.ORDER_DESK,
    title: 'Order desk',
    form_schema: ORDER_DESK_FORM,
    enforce_schema: true,
  },
  {
    role: ROLE.PRODUCTION,
    title: 'Production',
    description: 'Orders waiting for a factory site to make them',
    form_schema: PRODUCTION_FORM,
    list_schema: PRODUCTION_LIST,
  },
  {
    role: ROLE.CARRIER_PICKUP,
    title: 'Carrier pickups',
    form_schema: CARRIER_PICKUP_FORM,
    list_schema: CARRIER_PICKUP_LIST,
  },
  {
    role: ROLE.SHIPPING_DESK,
    title: 'Shipping desk',
    form_schema: SHIPPING_DESK_FORM,
  },
];

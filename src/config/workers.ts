import type { LTStartConfig } from '@hotmeshio/long-tail';

import { DEFAULT_QUANTITY, DEFAULT_WAIT_TIMEOUT, ROLE, TASK_QUEUE, WORKFLOW } from '../modules/constants';

/** The Temporal workflows Long Tail can invoke. The Temporal worker runs them; Long Tail starts them by name. */
export const workers: NonNullable<LTStartConfig['workers']> = [
  {
    taskQueue: TASK_QUEUE,
    workflow: WORKFLOW.FABRICATION_ORDER_REQUEST,
    config: {
      invocable: true,
      description: 'Send an order to a factory site and wait for it to be built',
      invocationRoles: [ROLE.FABRICATION],
      inputSchema: {
        type: 'object',
        properties: {
          orderId: { type: 'string', title: 'Order id' },
          product: { type: 'string', title: 'Product' },
          quantity: { type: 'integer', title: 'Quantity', minimum: 1, default: DEFAULT_QUANTITY },
          timeout: { type: 'string', title: 'Deadline, such as 7d', default: DEFAULT_WAIT_TIMEOUT },
        },
        required: ['orderId', 'product'],
      },
    },
  },
];

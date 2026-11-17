import type { LTStartConfig } from '@hotmeshio/long-tail';

import { ORDER_DEFAULTS, ROLE, TASK_QUEUE, WAIT_TIMEOUT, WORKFLOW } from '../modules/constants';

/** The Temporal workflows Long Tail can invoke. The Temporal worker runs them; Long Tail starts them by name. */
export const workers: NonNullable<LTStartConfig['workers']> = [
  {
    taskQueue: TASK_QUEUE,
    workflow: WORKFLOW.EYEGLASS_ORDER_REQUEST,
    config: {
      invocable: true,
      description: 'Take an eyeglass order from its prescription through production at a site to the carrier pickup',
      invocationRoles: [ROLE.ORDER_DESK],
      inputSchema: {
        type: 'object',
        properties: {
          orderId: { type: 'string', title: 'Order id' },
          frameStyle: { type: 'string', title: 'Frame style', default: ORDER_DEFAULTS.FRAME_STYLE },
          lensMaterial: { type: 'string', title: 'Lens material', default: ORDER_DEFAULTS.LENS_MATERIAL },
          coating: { type: 'string', title: 'Coating', default: ORDER_DEFAULTS.COATING },
          carrier: { type: 'string', title: 'Carrier', default: ORDER_DEFAULTS.CARRIER },
          timeout: { type: 'string', title: 'Site deadline, such as 7d', default: WAIT_TIMEOUT.PRODUCTION },
        },
        required: ['orderId'],
      },
    },
  },
];

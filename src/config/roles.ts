import type { LTRoleConfig } from '@hotmeshio/long-tail';

import { ROLE } from '../modules/constants';

/** The queue a factory site pulls from. Its form is what a person fills in when they close an order by hand. */
export const roles: LTRoleConfig[] = [
  {
    role: ROLE.FABRICATION,
    title: 'Fabrication',
    description: 'Orders waiting for a factory site to build them',
    form_schema: {
      type: 'object',
      properties: {
        completed: { type: 'boolean', title: 'Completed', default: true },
        units: { type: 'integer', title: 'Units built', minimum: 0 },
        site: { type: 'string', title: 'Site' },
        notes: { type: 'string', title: 'Notes' },
      },
      required: ['completed'],
    },
  },
];

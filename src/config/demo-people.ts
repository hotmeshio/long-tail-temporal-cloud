import { api } from '@hotmeshio/long-tail';

import { ROLE, ROLE_TYPE, type Role } from '../modules/constants';

export interface DemoPerson {
  externalId: string;
  displayName: string;
  role: Role;
}

const STATUS_CREATED = 201;
const STATUS_EXISTS = 409;

/** One member for each role a person works. The production role is worked by the site's bot. */
export const DEMO_PEOPLE: DemoPerson[] = [
  { externalId: 'riley', displayName: 'Riley Chen', role: ROLE.PRESCRIPTION_REVIEW },
  { externalId: 'morgan', displayName: 'Morgan Diaz', role: ROLE.CUSTOMER_CARE },
  { externalId: 'sam', displayName: 'Sam Okafor', role: ROLE.ORDER_DESK },
  { externalId: 'casey', displayName: 'Casey Lund', role: ROLE.CARRIER_PICKUP },
  { externalId: 'devon', displayName: 'Devon Park', role: ROLE.SHIPPING_DESK },
];

/** Create the demo people who are not there yet. A person who exists is left as they are. */
export async function seedDemoPeople(password?: string): Promise<{ created: number; existing: number }> {
  let created = 0;
  let existing = 0;
  for (const person of DEMO_PEOPLE) {
    const result = await api.users.createUser({
      external_id: person.externalId,
      display_name: person.displayName,
      ...(password ? { password } : {}),
      roles: [{ role: person.role, type: ROLE_TYPE.MEMBER }],
    });
    if (result.status === STATUS_CREATED) created++;
    else if (result.status === STATUS_EXISTS) existing++;
    else throw new Error(`create demo person ${person.externalId}: ${result.error ?? result.status}`);
  }
  return { created, existing };
}

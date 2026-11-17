const createUser = vi.hoisted(() => vi.fn());
vi.mock('@hotmeshio/long-tail', () => ({ api: { users: { createUser } } }));

import { DEMO_PEOPLE, seedDemoPeople } from '../../../src/config/demo-people';
import { ROLE, ROLE_TYPE } from '../../../src/modules/constants';

beforeEach(() => {
  createUser.mockReset();
  createUser.mockResolvedValue({ status: 201, data: {} });
});

describe('DEMO_PEOPLE', () => {
  it('has one member for each role a person works', () => {
    expect(DEMO_PEOPLE.map((p) => p.role).sort()).toEqual(Object.values(ROLE).filter((r) => r !== ROLE.PRODUCTION).sort());
    expect(new Set(DEMO_PEOPLE.map((p) => p.externalId)).size).toBe(DEMO_PEOPLE.length);
  });
});

describe('seedDemoPeople', () => {
  it('creates each person as a member of their role', async () => {
    expect(await seedDemoPeople('pw')).toEqual({ created: DEMO_PEOPLE.length, existing: 0 });
    expect(createUser).toHaveBeenCalledWith({
      external_id: 'riley', display_name: 'Riley Chen', password: 'pw',
      roles: [{ role: ROLE.PRESCRIPTION_REVIEW, type: ROLE_TYPE.MEMBER }],
    });
  });

  it('creates them without a password when none is set', async () => {
    await seedDemoPeople();
    for (const [input] of createUser.mock.calls) expect(input).not.toHaveProperty('password');
  });

  it('counts a person who is already there', async () => {
    createUser.mockResolvedValueOnce({ status: 409, error: 'exists' });
    expect(await seedDemoPeople('pw')).toEqual({ created: DEMO_PEOPLE.length - 1, existing: 1 });
  });

  it('throws when a person cannot be created', async () => {
    createUser.mockResolvedValueOnce({ status: 500, error: 'database is down' });
    await expect(seedDemoPeople('pw')).rejects.toThrow('create demo person riley: database is down');
  });

  it('names the status when no error is given', async () => {
    createUser.mockResolvedValueOnce({ status: 400 });
    await expect(seedDemoPeople()).rejects.toThrow('create demo person riley: 400');
  });
});

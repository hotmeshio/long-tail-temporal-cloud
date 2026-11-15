import { roles } from '../../../src/config/roles';
import { ROLE } from '../../../src/modules/constants';

describe('roles', () => {
  it('declares the fabrication queue with its form on the role', () => {
    const role = roles.find((r) => r.role === ROLE.FABRICATION)!;
    expect(role.title).toBe('Fabrication');
    expect((role.form_schema as { required: string[] }).required).toEqual(['completed']);
  });

  it('declares each role once', () => {
    expect(new Set(roles.map((r) => r.role)).size).toBe(roles.length);
  });
});

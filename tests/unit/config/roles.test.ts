import { roles } from '../../../src/config/roles';
import { CARRIER_STATUS, CHASE_OUTCOME, REVIEW_DECISION, ROLE } from '../../../src/modules/constants';

type Schema = { title?: string; required?: string[]; properties: Record<string, Record<string, any>>; [key: string]: unknown };
const roleOf = (name: string) => roles.find((r) => r.role === name)!;
const formOf = (name: string) => roleOf(name).form_schema as Schema;
const optionsOf = (field: Record<string, any>) => field['x-lt-options'].map((o: { value: string }) => o.value);

describe('roles', () => {
  it('declares the six queues an order moves through, each once', () => {
    expect(roles.map((r) => r.role)).toEqual(Object.values(ROLE));
    expect(new Set(roles.map((r) => r.role)).size).toBe(roles.length);
  });

  it('lists every field of every form in the order it shows', () => {
    for (const role of roles) {
      const form = role.form_schema as Schema;
      expect(form['x-lt-order']).toEqual(Object.keys(form.properties));
    }
  });

  it('gives every role a title and its own form', () => {
    for (const role of roles) {
      expect(role.title).toBeTruthy();
      expect((role.form_schema as Schema).title).toBeTruthy();
    }
  });

  it('shows the reviewer each parsed field bound to the answer the workflow reads', () => {
    const form = formOf(ROLE.PRESCRIPTION_REVIEW);
    expect(form.required).toEqual(['decision', 'reason']);
    expect(form['x-lt-confidence']).toMatchObject({ facets: true });
    expect(form['x-lt-layout']).toBe('split');
    expect(form.properties.prescription).toMatchObject({ 'x-lt-widget': 'document', 'x-lt-source': 'file.prescription' });
    expect(form.properties.leftAxis['x-lt-bind']).toBe('left.axis');
    expect(form.properties.rightSphere['x-lt-bind']).toBe('right.sphere');
    expect(optionsOf(form.properties.decision)).toEqual(Object.values(REVIEW_DECISION));
    expect(form.properties.reason['x-lt-showIf']).toBe('resolver.decision=reject');
  });

  it('enforces the review and order desk forms', () => {
    expect(roleOf(ROLE.PRESCRIPTION_REVIEW).enforce_schema).toBe(true);
    expect(roleOf(ROLE.ORDER_DESK).enforce_schema).toBe(true);
    expect(formOf(ROLE.ORDER_DESK).required).toEqual(['lotNumber']);
  });

  it('asks a site for what the production outcome carries', () => {
    const form = formOf(ROLE.PRODUCTION);
    expect(form.required).toEqual(['completed', 'site']);
    expect(Object.keys(form.properties)).toEqual(['completed', 'site', 'binKey', 'destination', 'notes']);
  });

  it('offers the carrier and shipping desk the answers the workflow branches on', () => {
    expect(optionsOf(formOf(ROLE.CARRIER_PICKUP).properties.carrierStatus)).toEqual(Object.values(CARRIER_STATUS));
    expect(optionsOf(formOf(ROLE.SHIPPING_DESK).properties.outcome)).toEqual(Object.values(CHASE_OUTCOME));
    expect(formOf(ROLE.CUSTOMER_CARE).required).toEqual(['reply']);
  });

  it('lists review, production and pickup rows by order', () => {
    for (const name of [ROLE.PRESCRIPTION_REVIEW, ROLE.PRODUCTION, ROLE.CARRIER_PICKUP]) {
      const list = roleOf(name).list_schema as { 'x-lt-columns': { value: string }[] };
      expect(list['x-lt-columns'][0].value).toBe('{{metadata.orderId}}');
    }
  });
});

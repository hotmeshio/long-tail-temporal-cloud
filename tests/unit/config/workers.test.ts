import { workers } from '../../../src/config/workers';
import { ROLE, TASK_QUEUE, WORKFLOW } from '../../../src/modules/constants';
import * as workflows from '../../../src/workflows/fabrication-order';

vi.mock('@temporalio/workflow', () => ({ proxyActivities: () => ({}) }));
vi.mock('@hotmeshio/long-tail-temporal/workflow', () => ({ conditional: vi.fn() }));

describe('workers', () => {
  it('registers the order workflow as invocable by the fabrication role', () => {
    const entry = workers.find((w) => w.workflow === WORKFLOW.FABRICATION_ORDER_REQUEST)!;
    expect(entry.taskQueue).toBe(TASK_QUEUE);
    expect(entry.config).toMatchObject({ invocable: true, invocationRoles: [ROLE.FABRICATION] });
    expect((entry.config!.inputSchema as { required: string[] }).required).toEqual(['orderId', 'product']);
  });

  it('names workflows the worker exports', () => {
    for (const entry of workers) expect(workflows).toHaveProperty(String(entry.workflow));
  });
});

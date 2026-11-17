import { workers } from '../../../src/config/workers';
import { ORDER_DEFAULTS, ROLE, TASK_QUEUE, WORKFLOW } from '../../../src/modules/constants';
import * as workflows from '../../../src/workflows';

vi.mock('@temporalio/workflow', () => ({ proxyActivities: () => ({}), workflowInfo: vi.fn() }));
vi.mock('@hotmeshio/long-tail-temporal/workflow', () => ({ conditional: vi.fn() }));

describe('workers', () => {
  const entry = workers.find((w) => w.workflow === WORKFLOW.EYEGLASS_ORDER_REQUEST)!;
  const schema = entry.config!.inputSchema as { required: string[]; properties: Record<string, { default?: string }> };

  it('registers the order workflow as invocable by the order desk', () => {
    expect(entry.taskQueue).toBe(TASK_QUEUE);
    expect(entry.config).toMatchObject({ invocable: true, invocationRoles: [ROLE.ORDER_DESK] });
  });

  it('asks only for the order id and defaults the rest', () => {
    expect(schema.required).toEqual(['orderId']);
    expect(schema.properties.frameStyle.default).toBe(ORDER_DEFAULTS.FRAME_STYLE);
    expect(schema.properties.carrier.default).toBe(ORDER_DEFAULTS.CARRIER);
  });

  it('names workflows the worker exports', () => {
    for (const worker of workers) expect(workflows).toHaveProperty(String(worker.workflow));
  });
});

vi.mock('@temporalio/workflow', () => ({ proxyActivities: () => ({}), workflowInfo: vi.fn() }));
vi.mock('@hotmeshio/long-tail-temporal/workflow', () => ({ conditional: vi.fn() }));

import { WORKFLOW } from '../../../src/modules/constants';
import * as workflows from '../../../src/workflows';

describe('workflows', () => {
  it('exports the order workflow and its invocable entry', () => {
    expect(Object.keys(workflows).sort()).toEqual(['eyeglassOrder', WORKFLOW.EYEGLASS_ORDER_REQUEST].sort());
  });
});

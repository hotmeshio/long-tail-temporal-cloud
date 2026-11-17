vi.mock('@hotmeshio/long-tail', () => ({ getStorageBackend: vi.fn() }));

import * as activities from '../../../src/activities';

describe('activities', () => {
  it('exports only the activity functions the worker registers', () => {
    expect(Object.keys(activities).sort()).toEqual(['bookCarrier', 'findLensBlank', 'parsePrescription', 'savePrescription', 'stageOrderFiles']);
    for (const activity of Object.values(activities)) expect(activity).toBeTypeOf('function');
  });
});

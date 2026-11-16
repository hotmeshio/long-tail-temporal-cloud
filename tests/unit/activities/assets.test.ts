import { createHash } from 'crypto';

const { written, write } = vi.hoisted(() => {
  const written = new Map<string, { data: Buffer; sha256?: string }>();
  const write = vi.fn(async (key: string, data: Buffer, options?: { sha256?: string }) => {
    written.set(key, { data, sha256: options?.sha256 });
    return { ref: key, size: data.length };
  });
  return { written, write };
});
vi.mock('@hotmeshio/long-tail', () => ({ getStorageBackend: () => ({ write }) }));

import { draftAssets, stageAssets } from '../../../src/activities/assets';
import { ASSET } from '../../../src/modules/constants';

const ORDER = { orderId: 'A-100', product: 'bracket', quantity: 2 };

beforeEach(() => written.clear());

describe('draftAssets', () => {
  it('drafts a machine program with one move per unit and a ticket', () => {
    const [model, ticket] = draftAssets(ORDER);
    expect(model.as).toBe(ASSET.MODEL);
    expect(model.body.match(/; unit \d+/g)).toHaveLength(2);
    expect(JSON.parse(ticket.body)).toEqual(ORDER);
  });

  it('is the same for the same order', () => {
    expect(draftAssets(ORDER)).toEqual(draftAssets(ORDER));
  });
});

describe('stageAssets', () => {
  it('writes each file under the order and returns its checksum and size', async () => {
    const staged = await stageAssets(ORDER);
    expect(staged.map((a) => a.path)).toEqual(['orders/A-100/model.gcode', 'orders/A-100/ticket.json']);
    for (const asset of staged) {
      const stored = written.get(asset.path)!;
      expect(asset.sha256).toBe(createHash('sha256').update(stored.data).digest('hex'));
      expect(stored.sha256).toBe(asset.sha256);
      expect(asset.size).toBe(stored.data.length);
    }
  });

  it('surfaces a storage failure', async () => {
    write.mockRejectedValueOnce(new Error('bucket unreachable'));
    await expect(stageAssets(ORDER)).rejects.toThrow('bucket unreachable');
  });
});

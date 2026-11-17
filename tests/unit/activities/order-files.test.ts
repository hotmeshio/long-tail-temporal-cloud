import { createHash } from 'crypto';
import { readFileSync } from 'fs';

const write = vi.hoisted(() => vi.fn(async (ref: string, data: Buffer, _meta?: { sha256: string }) => ({ ref, size: data.length })));
vi.mock('@hotmeshio/long-tail', () => ({ getStorageBackend: () => ({ write }) }));

import { PRESCRIPTION_PDF, savePrescription, stageOrderFiles } from '../../../src/activities/order-files';
import { SAMPLE_PRESCRIPTION } from '../../../src/modules/order-fixtures';

const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const written = (path: string) => write.mock.calls.find((call) => call[0] === path)![1];

beforeEach(() => { write.mockClear(); });

describe('stageOrderFiles', () => {
  it('writes the prescription PDF and the frame print file under the order', async () => {
    const files = await stageOrderFiles({ orderId: 'A-1', frameStyle: 'round-48' });
    expect(files.prescription.path).toBe('orders/A-1/prescription.pdf');
    expect(files.frame.path).toBe('orders/A-1/round-48.gcode.3mf');
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('stages the sample PDF byte for byte', async () => {
    const files = await stageOrderFiles({ orderId: 'A-1', frameStyle: 'round-48' });
    const pdf = readFileSync(PRESCRIPTION_PDF);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(files.prescription).toMatchObject({ sha256: sha(pdf), size: pdf.length });
  });

  it('returns the checksum and size of what it wrote', async () => {
    const files = await stageOrderFiles({ orderId: 'A-1', frameStyle: 'aviator-52' });
    const frame = written(files.frame.path);
    expect(frame.toString()).toContain('aviator-52');
    expect(files.frame).toMatchObject({ sha256: sha(frame), size: frame.length });
    expect(write.mock.calls[1][2]).toEqual({ sha256: files.frame.sha256 });
  });

  it('fails when storage rejects the write', async () => {
    write.mockRejectedValueOnce(new Error('bucket is gone'));
    await expect(stageOrderFiles({ orderId: 'A-1', frameStyle: 'round-48' })).rejects.toThrow('bucket is gone');
  });
});

describe('savePrescription', () => {
  it('writes the confirmed prescription as JSON with who reviewed it', async () => {
    const saved = await savePrescription({ orderId: 'A-1', prescription: SAMPLE_PRESCRIPTION, reviewedBy: 'user-9' });
    expect(saved.path).toBe('orders/A-1/prescription.json');
    expect(JSON.parse(written(saved.path).toString())).toEqual({ orderId: 'A-1', prescription: SAMPLE_PRESCRIPTION, reviewedBy: 'user-9' });
    expect(saved.sha256).toBe(sha(written(saved.path)));
  });

  it('leaves the reviewer out when no one reviewed it', async () => {
    const saved = await savePrescription({ orderId: 'A-2', prescription: SAMPLE_PRESCRIPTION });
    expect(JSON.parse(written(saved.path).toString())).not.toHaveProperty('reviewedBy');
  });
});

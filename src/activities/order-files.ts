import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getStorageBackend } from '@hotmeshio/long-tail';

import { ORDER_FILE, orderFilePath } from '../modules/constants';
import { frameFileBody } from '../modules/order-fixtures';
import type { OrderFiles, Prescription, StoredFile } from '../types/order';

/** The sample prescription every order is staged with. */
export const PRESCRIPTION_PDF = join(__dirname, '../../assets/prescription-sample.pdf');

async function storeFile(path: string, data: Buffer): Promise<StoredFile> {
  const sha256 = createHash('sha256').update(data).digest('hex');
  const { size } = await getStorageBackend().write(path, data, { sha256 });
  return { path, sha256, size };
}

/** Write the order's prescription PDF and frame print file to storage. */
export async function stageOrderFiles(order: { orderId: string; frameStyle: string }): Promise<OrderFiles> {
  const prescription = await storeFile(
    orderFilePath(order.orderId, ORDER_FILE.PRESCRIPTION_PDF),
    await readFile(PRESCRIPTION_PDF),
  );
  const frame = await storeFile(
    orderFilePath(order.orderId, `${order.frameStyle}${ORDER_FILE.FRAME_SUFFIX}`),
    Buffer.from(frameFileBody(order.frameStyle), 'utf-8'),
  );
  return { prescription, frame };
}

/** Write the confirmed prescription as the JSON a site reads. */
export async function savePrescription(order: { orderId: string; prescription: Prescription; reviewedBy?: string }): Promise<StoredFile> {
  const body = JSON.stringify(order, null, 2);
  return storeFile(orderFilePath(order.orderId, ORDER_FILE.PRESCRIPTION_JSON), Buffer.from(body, 'utf-8'));
}

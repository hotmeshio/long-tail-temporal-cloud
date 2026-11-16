import { createHash } from 'crypto';
import { getStorageBackend } from '@hotmeshio/long-tail';

import { ASSET, CONTENT_TYPE } from '../modules/constants';

export interface OrderSpec {
  orderId: string;
  product: string;
  quantity: number;
}

/** A stored file the site downloads, with the checksum it verifies. */
export interface StagedAsset {
  as: string;
  path: string;
  name: string;
  contentType: string;
  sha256: string;
  size: number;
}

interface AssetDraft { as: string; name: string; contentType: string; body: string }

/** Write the order's fabrication files to storage and return where they are. */
export async function stageAssets(order: OrderSpec): Promise<StagedAsset[]> {
  const storage = getStorageBackend();
  const staged: StagedAsset[] = [];
  for (const draft of draftAssets(order)) {
    const data = Buffer.from(draft.body, 'utf-8');
    const sha256 = createHash('sha256').update(data).digest('hex');
    const path = `orders/${order.orderId}/${draft.name}`;
    const { size } = await storage.write(path, data, { sha256 });
    staged.push({ as: draft.as, path, name: draft.name, contentType: draft.contentType, sha256, size });
  }
  return staged;
}

/** The files for an order: the machine program and the job ticket. A real order reads these from its design system. */
export function draftAssets(order: OrderSpec): AssetDraft[] {
  const gcode = [
    `; order ${order.orderId}`,
    `; product ${order.product} x${order.quantity}`,
    'G28',
    'M104 S215',
    'M140 S60',
    ...Array.from({ length: order.quantity }, (_, unit) => `G1 X${10 + unit * 40} Y10 E12 F1800 ; unit ${unit + 1}`),
    'M104 S0',
    'M140 S0',
    'M84',
    '',
  ].join('\n');
  const ticket = JSON.stringify({ orderId: order.orderId, product: order.product, quantity: order.quantity }, null, 2);
  return [
    { as: ASSET.MODEL, name: 'model.gcode', contentType: CONTENT_TYPE.GCODE, body: gcode },
    { as: ASSET.TICKET, name: 'ticket.json', contentType: CONTENT_TYPE.JSON, body: ticket },
  ];
}

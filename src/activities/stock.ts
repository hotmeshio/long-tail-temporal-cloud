import { LENS_STOCK, ORDERS_WITHOUT_BLANK } from '../modules/order-fixtures';
import type { LensBlank } from '../types/order';

/** Find a stocked lens blank that covers the order, or null when the order desk must name one. */
export async function findLensBlank(order: { orderId: string; lensMaterial: string; coating: string }): Promise<LensBlank | null> {
  if (ORDERS_WITHOUT_BLANK.includes(order.orderId)) return null;
  return LENS_STOCK.find((blank) => blank.lensMaterial === order.lensMaterial && blank.coating === order.coating) ?? null;
}

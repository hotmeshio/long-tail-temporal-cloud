import { proxyActivities } from '@temporalio/workflow';
import { conditional, type LTEnvelope } from '@hotmeshio/long-tail-temporal/workflow';

import type * as activities from '../activities';
import {
  ASSET, CONFIDENCE_THRESHOLD, ESCALATION_SUBTYPE, ESCALATION_TYPE, ORDER_DEFAULTS, ORDER_FILE, ORDER_STATUS, ROLE,
  WAIT_TIMEOUT, blankKey, productionKey,
} from '../modules/constants';
import type { EyeglassOrderInput, EyeglassOrderResult, ProductionOrder, ProductionOutcome } from '../types/order';
import { reviewPrescription, type ReviewOutcome } from './prescription-review';
import { shipOrder } from './ship-order';

const { stageOrderFiles, parsePrescription, savePrescription, findLensBlank, bookCarrier } =
  proxyActivities<typeof activities>({ startToCloseTimeout: '1 minute' });

/** One eyeglass order: read the prescription, pick a lens blank, hand production to a site, then ship. */
export async function eyeglassOrder(input: EyeglassOrderInput): Promise<EyeglassOrderResult> {
  const {
    orderId,
    frameStyle = ORDER_DEFAULTS.FRAME_STYLE,
    lensMaterial = ORDER_DEFAULTS.LENS_MATERIAL,
    coating = ORDER_DEFAULTS.COATING,
    carrier = ORDER_DEFAULTS.CARRIER,
    timeout = WAIT_TIMEOUT.PRODUCTION,
  } = input;

  // 1. Stage the prescription PDF and the frame print file
  const files = await stageOrderFiles({ orderId, frameStyle });

  // 2. Read the prescription; a person confirms a low-confidence read
  const parse = await parsePrescription({ orderId });
  const review: ReviewOutcome = parse.confidence >= CONFIDENCE_THRESHOLD
    ? { confirmed: true, prescription: parse.values }
    : await reviewPrescription(orderId, parse, files.prescription.path);
  if (!review.confirmed) return { orderId, status: review.status };
  const { prescription, reviewedBy } = review;
  const saved = await savePrescription({ orderId, prescription, reviewedBy });

  // 3. Pick a lens blank; the order desk names one when stock has none
  const lotNumber = await pickLensBlank(orderId, lensMaterial, coating);
  if (!lotNumber) return { orderId, status: ORDER_STATUS.HELD };

  // 4. Advertise production and wait for a site to report back
  const key = productionKey(orderId);
  const order: ProductionOrder = {
    orderId, frameStyle, lensMaterial, coating, lotNumber, prescription,
    signalKey: key,
    assets: [
      { as: ASSET.FRAME, sha256: files.frame.sha256, size: files.frame.size },
      { as: ASSET.PRESCRIPTION, sha256: saved.sha256, size: saved.size },
    ],
  };
  const outcome = await conditional<ProductionOutcome>(key, {
    role: ROLE.PRODUCTION,
    type: ESCALATION_TYPE.PRODUCTION,
    subtype: ESCALATION_SUBTYPE.AWAITING_SITE,
    signalKey: key,
    description: `Make ${frameStyle} glasses for order ${orderId}`,
    metadata: { orderId, frameStyle, lotNumber },
    data: { ...order },
    files: [
      { path: files.frame.path, as: ASSET.FRAME, name: `${frameStyle}${ORDER_FILE.FRAME_SUFFIX}` },
      { path: saved.path, as: ASSET.PRESCRIPTION, name: ORDER_FILE.PRESCRIPTION_JSON },
    ],
    timeout,
  });
  if (outcome === false) return { orderId, status: ORDER_STATUS.EXPIRED };
  if (outcome === null) return { orderId, status: ORDER_STATUS.CANCELLED };
  if (!outcome.completed) return { orderId, status: ORDER_STATUS.REJECTED };

  // 5. Book the carrier and wait for the pickup scan
  const booking = await bookCarrier({ orderId, carrier });
  return { orderId, status: await shipOrder(booking) };
}

async function pickLensBlank(orderId: string, lensMaterial: string, coating: string): Promise<string | undefined> {
  const blank = await findLensBlank({ orderId, lensMaterial, coating });
  if (blank) return blank.lotNumber;

  const answer = await conditional<{ lotNumber: string; note?: string }>(blankKey(orderId), {
    role: ROLE.ORDER_DESK,
    type: ESCALATION_TYPE.MISSING_BLANK,
    description: `Order ${orderId} has no ${lensMaterial} blank in stock that covers its prescription`,
    metadata: { orderId, lensMaterial },
    timeout: WAIT_TIMEOUT.ORDER_DESK,
  });
  return answer ? answer.lotNumber : undefined;
}

/** Invoked from Long Tail: the envelope carries the invoke form's fields. */
export async function eyeglassOrderRequest(envelope: LTEnvelope<EyeglassOrderInput>) {
  return { data: await eyeglassOrder(envelope.data) };
}

import type { LensBlank, Prescription, PrescriptionParse } from '../types/order';

// The sample data the stand-in parser, stock check and carrier booking answer from.

export const SAMPLE_ORDER_ID = 'A-1042';
export const STORY_ORDER_IDS = ['A-1042', 'A-1043', 'A-1044', 'A-1045'] as const;

export const SAMPLE_PRESCRIPTION: Prescription = {
  right: { sphere: -2.25, cylinder: -0.75, axis: 170, add: 1.5 },
  left: { sphere: -2, cylinder: -1, axis: 15, add: 1.5 },
  pd: 63,
};

const FOLDED_PARSE: PrescriptionParse = {
  values: { ...SAMPLE_PRESCRIPTION, left: { ...SAMPLE_PRESCRIPTION.left, axis: 75 } },
  scores: {
    right: { sphere: 0.97, cylinder: 0.95, axis: 0.96, add: 0.94 },
    left: { sphere: 0.93, cylinder: 0.71, axis: 0.52, add: 0.9 },
    pd: 0.95,
  },
  confidence: 0.62,
  summary: 'A fold crosses the left eye line. The axis reads as 15 or 75.',
};

/** The parse every order gets unless it has its own entry below. */
export const CLEAR_PARSE: PrescriptionParse = {
  values: SAMPLE_PRESCRIPTION,
  scores: {
    right: { sphere: 0.98, cylinder: 0.97, axis: 0.97, add: 0.96 },
    left: { sphere: 0.98, cylinder: 0.96, axis: 0.97, add: 0.96 },
    pd: 0.98,
  },
  confidence: 0.96,
  summary: 'Every field reads cleanly.',
};

const SMUDGED_PARSE: PrescriptionParse = {
  values: { right: { sphere: -1.5, cylinder: -0.5, axis: 90, add: 2 }, left: { sphere: -1.75, cylinder: -0.5, axis: 85, add: 2 }, pd: 61 },
  scores: {
    right: { sphere: 0.95, cylinder: 0.94, axis: 0.93, add: 0.58 },
    left: { sphere: 0.94, cylinder: 0.93, axis: 0.92, add: 0.9 },
    pd: 0.95,
  },
  confidence: 0.74,
  summary: 'A smudge covers the right add. It reads as 2.00 or 2.50.',
};

const HANDWRITTEN_PARSE: PrescriptionParse = {
  values: { right: { sphere: 1.25, cylinder: -0.25, axis: 10, add: 0 }, left: { sphere: 1, cylinder: -0.25, axis: 175, add: 0 }, pd: 64 },
  scores: {
    right: { sphere: 0.8, cylinder: 0.9, axis: 0.88, add: 0.95 },
    left: { sphere: 0.82, cylinder: 0.9, axis: 0.87, add: 0.95 },
    pd: 0.49,
  },
  confidence: 0.55,
  summary: 'The PD is handwritten. It reads as 64 or 69.',
};

const FAINT_PARSE: PrescriptionParse = {
  values: { right: { sphere: -3, cylinder: -1.25, axis: 180, add: 1 }, left: { sphere: -3.25, cylinder: -1, axis: 5, add: 1 }, pd: 62 },
  scores: {
    right: { sphere: 0.84, cylinder: 0.8, axis: 0.83, add: 0.86 },
    left: { sphere: 0.83, cylinder: 0.79, axis: 0.84, add: 0.86 },
    pd: 0.88,
  },
  confidence: 0.81,
  summary: 'The fax is faint. Both cylinders are worth a second look.',
};

export const PARSE_BY_ORDER: Record<string, PrescriptionParse> = {
  [SAMPLE_ORDER_ID]: FOLDED_PARSE,
  'A-1048': SMUDGED_PARSE,
  'A-1051': HANDWRITTEN_PARSE,
  'A-1054': FAINT_PARSE,
};

export const LENS_STOCK: LensBlank[] = [
  { lotNumber: 'LOT-4417', lensMaterial: 'polycarbonate', coating: 'anti-glare' },
  { lotNumber: 'LOT-4302', lensMaterial: 'polycarbonate', coating: 'blue-light' },
  { lotNumber: 'LOT-5120', lensMaterial: 'high-index', coating: 'anti-glare' },
];

/** Orders whose prescription no stocked blank covers. */
export const ORDERS_WITHOUT_BLANK: string[] = ['A-1044'];

export const BOOKING_PREFIX = 'BK-';
export const BOOKING_REF_BY_ORDER: Record<string, string> = {
  [SAMPLE_ORDER_ID]: 'BK-311',
};
export const BOOKING_REF_FALLBACK = 'BK-100';

/** Placeholder bytes for a frame print file. A real order reads the sliced file from its design system. */
export function frameFileBody(frameStyle: string): string {
  return `; frame ${frameStyle}\n; placeholder print file\n`;
}

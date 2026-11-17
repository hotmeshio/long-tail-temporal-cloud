import type { AssetName, OrderStatus } from '../modules/constants';

export interface Eye {
  sphere: number;
  cylinder: number;
  axis: number;
  add: number;
}

export interface Prescription {
  right: Eye;
  left: Eye;
  pd: number;
}

/** What the parser read, with a 0 to 1 score per field in the same shape. */
export interface PrescriptionParse {
  values: Prescription;
  scores: Prescription;
  confidence: number;
  summary: string;
}

/** A file in storage with the checksum a reader verifies. */
export interface StoredFile {
  path: string;
  sha256: string;
  size: number;
}

export interface OrderFiles {
  prescription: StoredFile;
  frame: StoredFile;
}

export interface LensBlank {
  lotNumber: string;
  lensMaterial: string;
  coating: string;
}

export interface Booking {
  orderId: string;
  carrier: string;
  bookingRef: string;
}

export interface EyeglassOrderInput {
  orderId: string;
  frameStyle?: string;
  lensMaterial?: string;
  coating?: string;
  carrier?: string;
  /** How long the order waits for a site, such as 7d. */
  timeout?: string;
}

/** What a site receives when it claims the production row. The site repo declares the same shape. */
export interface ProductionOrder {
  orderId: string;
  frameStyle: string;
  lensMaterial: string;
  coating: string;
  lotNumber: string;
  prescription: Prescription;
  signalKey: string;
  assets: { as: AssetName; sha256: string; size: number }[];
}

/** What a site reports when the glasses are packed. The site repo declares the same shape. */
export interface ProductionOutcome {
  completed: boolean;
  site: string;
  binKey?: string;
  destination?: string;
  notes?: string;
}

export interface EyeglassOrderResult {
  orderId: string;
  status: OrderStatus;
}

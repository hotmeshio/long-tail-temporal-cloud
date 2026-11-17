// Draw the sample prescription every order is staged with.
//
//   npm run make:pdf
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import { SAMPLE_ORDER_ID, SAMPLE_PRESCRIPTION } from '../src/modules/order-fixtures';
import type { Eye } from '../src/types/order';

const OUTPUT = join(__dirname, '../assets/prescription-sample.pdf');
const CUSTOMER = 'Jordan Avery';
const BRAND = 'Acme Eyeglass';
const ISSUED = new Date('2026-01-12T00:00:00Z');

const PAGE = { width: 612, height: 792, margin: 64 };
const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.8, 0.82, 0.85);
const COLUMNS = ['Eye', 'Sphere', 'Cylinder', 'Axis', 'Add'];
const COLUMN_WIDTH = 96;
const ROW_HEIGHT = 30;

const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
const eyeRow = (label: string, eye: Eye) => [label, signed(eye.sphere), signed(eye.cylinder), String(eye.axis), signed(eye.add)];

function drawRow(page: PDFPage, font: PDFFont, cells: string[], y: number, color = INK): void {
  cells.forEach((cell, index) => {
    page.drawText(cell, { x: PAGE.margin + index * COLUMN_WIDTH, y, size: 12, font, color });
  });
  page.drawLine({
    start: { x: PAGE.margin, y: y - 10 },
    end: { x: PAGE.margin + COLUMNS.length * COLUMN_WIDTH, y: y - 10 },
    thickness: 0.75,
    color: RULE,
  });
}

async function main(): Promise<void> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${BRAND} prescription ${SAMPLE_ORDER_ID}`);
  doc.setCreationDate(ISSUED);
  doc.setModificationDate(ISSUED);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE.width, PAGE.height]);

  let y = PAGE.height - PAGE.margin;
  page.drawText(BRAND, { x: PAGE.margin, y, size: 24, font: bold, color: INK });
  y -= 22;
  page.drawText('Prescription', { x: PAGE.margin, y, size: 12, font: regular, color: MUTED });

  y -= 48;
  page.drawText('Customer', { x: PAGE.margin, y, size: 10, font: regular, color: MUTED });
  page.drawText('Order', { x: PAGE.margin + 3 * COLUMN_WIDTH, y, size: 10, font: regular, color: MUTED });
  y -= 18;
  page.drawText(CUSTOMER, { x: PAGE.margin, y, size: 14, font: bold, color: INK });
  page.drawText(SAMPLE_ORDER_ID, { x: PAGE.margin + 3 * COLUMN_WIDTH, y, size: 14, font: bold, color: INK });

  y -= 56;
  drawRow(page, bold, COLUMNS, y, MUTED);
  y -= ROW_HEIGHT;
  drawRow(page, regular, eyeRow('Right', SAMPLE_PRESCRIPTION.right), y);
  y -= ROW_HEIGHT;
  drawRow(page, regular, eyeRow('Left', SAMPLE_PRESCRIPTION.left), y);

  y -= 48;
  page.drawText('PD', { x: PAGE.margin, y, size: 10, font: regular, color: MUTED });
  page.drawText(String(SAMPLE_PRESCRIPTION.pd), { x: PAGE.margin + COLUMN_WIDTH, y, size: 14, font: bold, color: INK });

  await writeFile(OUTPUT, await doc.save());
  console.log(`wrote ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

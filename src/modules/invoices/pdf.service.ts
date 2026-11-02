import { Injectable } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { amountInWords } from "@/domain/tax";
import type { Invoice, Ledger, Payment } from "./invoice.types";

const INK = rgb(0.08, 0.09, 0.1);
const GREEN = rgb(0.12, 0.24, 0.2);
const MUTED = rgb(0.38, 0.4, 0.4);
const LINE = rgb(0.85, 0.82, 0.76);
const SAND = rgb(0.96, 0.93, 0.88);


const money = (paise: number) => {
  const neg = paise < 0;
  const s = (Math.abs(paise) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? "-" : ""}₹${s}`;
};
const dateFmt = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
};

export interface PdfExtras { ledger?: Ledger; payments?: Payment[]; copyLabel?: string }

/** Renders GST tax invoices / credit notes (A4) with pdf-lib and an embedded Unicode font (₹ support). */
@Injectable()
export class PdfService {
  private fontCache?: { regular: Uint8Array; bold: Uint8Array };

  private async fonts() {
    if (!this.fontCache) {
      const candidates = [
        join(process.cwd(), "assets", "fonts"), // npm scripts run from backend/
        join(process.cwd(), "backend", "assets", "fonts"),
        join(__dirname, "assets", "fonts"), // Lambda bundle (assets copied next to handler.js)
        join(__dirname, "..", "assets", "fonts"),
        join(__dirname, "..", "..", "..", "assets", "fonts"),
        join(__dirname, "..", "..", "..", "..", "assets", "fonts"),
      ];
      for (const d of candidates) {
        try {
          this.fontCache = { regular: await readFile(join(d, "NotoSans-Regular.ttf")), bold: await readFile(join(d, "NotoSans-Bold.ttf")) };
          break;
        } catch {
          /* try next */
        }
      }
      if (!this.fontCache) throw new Error("Invoice fonts not found (backend/assets/fonts)");
    }
    return this.fontCache;
  }

  async render(inv: Invoice, extras: PdfExtras = {}): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const f = await this.fonts();
    const reg = await doc.embedFont(f.regular, { subset: true });
    const bold = await doc.embedFont(f.bold, { subset: true });
    doc.setTitle(`${inv.docType === "CREDIT_NOTE" ? "Credit Note" : "Tax Invoice"} ${inv.number}`);
    doc.setAuthor(inv.seller.name);
    doc.setProducer("Hotel KP billing");
  
    const W = 595.28, H = 841.89, M = 36;
    let page = doc.addPage([W, H]);
    let y = H - M;
  
    const text = (p: PDFPage, s: string, x: number, yy: number, size = 9, font: PDFFont = reg, color = INK) =>
      p.drawText(s, { x, y: yy, size, font, color });
    const right = (p: PDFPage, s: string, xr: number, yy: number, size = 9, font: PDFFont = reg, color = INK) =>
      p.drawText(s, { x: xr - font.widthOfTextAtSize(s, size), y: yy, size, font, color });
    const wrap = (s: string, width: number, size: number, font: PDFFont) => {
      const out: string[] = [];
      let cur = "";
      for (const w of s.split(/\s+/)) {
        const t = cur ? `${cur} ${w}` : w;
        if (font.widthOfTextAtSize(t, size) > width && cur) { out.push(cur); cur = w; } else cur = t;
      }
      if (cur) out.push(cur);
      return out;
    };
    const rule = (p: PDFPage, yy: number, x1 = M, x2 = W - M) => p.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.6, color: LINE });
  
    /* header */
    page.drawRectangle({ x: 0, y: H - 92, width: W, height: 92, color: GREEN });
    text(page, inv.seller.name, M, H - 42, 18, bold, rgb(1, 1, 1));
    const addr = wrap(inv.seller.address, 330, 8.5, reg);
    addr.forEach((l, i) => text(page, l, M, H - 58 - i * 11, 8.5, reg, rgb(0.9, 0.93, 0.9)));
    text(page, `GSTIN: ${inv.seller.gstin}  ·  ${inv.seller.phone}  ·  ${inv.seller.email}`, M, H - 58 - addr.length * 11, 8.5, reg, rgb(0.9, 0.93, 0.9));
    const title = inv.docType === "CREDIT_NOTE" ? "CREDIT NOTE" : "TAX INVOICE";
    right(page, title, W - M, H - 44, 16, bold, rgb(0.92, 0.77, 0.42));
    if (extras.copyLabel) right(page, extras.copyLabel, W - M, H - 60, 8.5, reg, rgb(0.9, 0.93, 0.9));
    y = H - 116;
  
    /* meta + bill to */
    const colR = W / 2 + 20;
    text(page, "Invoice no.", M, y, 8, reg, MUTED); text(page, inv.number, M + 62, y, 9.5, bold);
    text(page, "Date", M, y - 14, 8, reg, MUTED); text(page, dateFmt(inv.issuedAt), M + 62, y - 14, 9.5);
    text(page, "Due date", M, y - 28, 8, reg, MUTED); text(page, dateFmt(inv.dueDate), M + 62, y - 28, 9.5);
    text(page, "Place of supply", M, y - 42, 8, reg, MUTED); text(page, `${inv.placeOfSupply}`, M + 62, y - 42, 9.5);
    if (inv.bookingRef) { text(page, "Booking ref", M, y - 56, 8, reg, MUTED); text(page, inv.bookingRef, M + 62, y - 56, 9.5); }
  
    text(page, "BILL TO", colR, y, 8, bold, MUTED);
    let by = y - 14;
    const p = inv.party;
    text(page, p.company || p.name, colR, by, 10.5, bold); by -= 13;
    if (p.company) { text(page, `Attn: ${p.name}`, colR, by, 9); by -= 12; }
    if (p.gstin) { text(page, `GSTIN: ${p.gstin}`, colR, by, 9); by -= 12; }
    if (p.address) for (const l of wrap(p.address, W - M - colR, 9, reg)) { text(page, l, colR, by, 9); by -= 12; }
    text(page, [p.email, p.mobile].filter(Boolean).join("  ·  "), colR, by, 8.5, reg, MUTED);
    y = Math.min(y - 84, by - 30);
  
    /* table */
    const cols = [
      { k: "Description", x: M, w: 150, align: "l" as const },
      { k: "SAC", x: M + 150, w: 40, align: "l" as const },
      { k: "Qty", x: M + 190, w: 26, align: "r" as const },
      { k: "Rate", x: M + 216, w: 64, align: "r" as const },
      { k: "Disc.", x: M + 280, w: 64, align: "r" as const },
      { k: "Taxable", x: M + 344, w: 70, align: "r" as const },
      { k: "GST", x: M + 414, w: 32, align: "r" as const },
      { k: "Amount", x: M + 446, w: 77, align: "r" as const },
    ];
    const header = (pg: PDFPage, yy: number) => {
      pg.drawRectangle({ x: M, y: yy - 6, width: W - 2 * M, height: 20, color: SAND });
      for (const c of cols) c.align === "l" ? text(pg, c.k, c.x + 4, yy, 8, bold, GREEN) : right(pg, c.k, c.x + c.w, yy, 8, bold, GREEN);
    };
    header(page, y); y -= 22;
  
    for (const l of inv.lines) {
      const descLines = wrap(l.description, cols[0].w - 6, 9, reg);
      const rowH = Math.max(18, descLines.length * 11 + 7);
      if (y - rowH < 150) { page = doc.addPage([W, H]); y = H - M - 10; header(page, y); y -= 22; }
      descLines.forEach((d, i) => text(page, d, cols[0].x + 4, y - i * 11, 9));
      text(page, l.sac, cols[1].x, y, 9, reg, MUTED);
      right(page, String(l.qty), cols[2].x + cols[2].w, y);
      right(page, money(l.unitPricePaise), cols[3].x + cols[3].w, y, 8.5);
      right(page, l.discountPaise ? money(-l.discountPaise) : "—", cols[4].x + cols[4].w, y, 8.5);
      right(page, money(l.taxablePaise), cols[5].x + cols[5].w, y, 8.5);
      right(page, `${l.gstRate}%`, cols[6].x + cols[6].w, y);
      right(page, money(l.totalPaise), cols[7].x + cols[7].w, y, 8.5, bold);
      y -= rowH;
      rule(page, y + 12);
    }
  
    /* totals */
    if (y < 230) { page = doc.addPage([W, H]); y = H - M - 10; }
    y -= 14;
    const tx = W - M - 215;
    const row = (label: string, v: string, b = false) => {
      text(page, label, tx, y, 9, b ? bold : reg, b ? INK : MUTED);
      right(page, v, W - M, y, 9, b ? bold : reg);
      y -= 14;
    };
    row("Gross value", money(inv.totals.grossPaise));
    if (inv.totals.discountPaise) row(`Discount${inv.discountNote ? ` (${inv.discountNote})` : ""}`, money(-inv.totals.discountPaise));
    row("Taxable value", money(inv.totals.taxablePaise));
    if (inv.totals.cgstPaise) row("CGST", money(inv.totals.cgstPaise));
    if (inv.totals.sgstPaise) row("SGST", money(inv.totals.sgstPaise));
    if (inv.totals.igstPaise) row("IGST", money(inv.totals.igstPaise));
    if (inv.totals.roundOffPaise) row("Round off", money(inv.totals.roundOffPaise));
    y -= 6;
    page.drawRectangle({ x: tx - 8, y: y - 8, width: 215 + 8, height: 26, color: GREEN });
    text(page, "TOTAL", tx, y, 11, bold, rgb(1, 1, 1));
    right(page, money(inv.totals.grandTotalPaise), W - M - 6, y, 11, bold, rgb(1, 1, 1));
    const words = wrap(`Amount in words: ${amountInWords(Math.abs(inv.totals.grandTotalPaise))}`, tx - M - 20, 8.5, reg);
    words.forEach((l, i) => text(page, l, M, y - i * 11, 8.5, reg, MUTED));
    y -= 36;
  
    /* payments (statement copies) */
    if (extras.ledger) {
      text(page, "PAYMENT SUMMARY", M, y, 8, bold, MUTED); y -= 14;
      for (const pm of extras.payments ?? []) {
        if (y < 110) { page = doc.addPage([W, H]); y = H - M - 10; }
        const ref = pm.upiTransactionId ? `UPI txn ${pm.upiTransactionId}` : pm.bankReference ? `Ref ${pm.bankReference}` : pm.chequeNumber ? `Cheque ${pm.chequeNumber}` : "";
        text(page, `${dateFmt(pm.paidAt)}  ·  ${pm.method.replace("_", " ")}  ${ref}${pm.status !== "SUCCESS" ? `  [${pm.status.replace("_", " ")}]` : ""}`, M, y, 8.5);
        right(page, money(pm.amountPaise), W - M, y, 8.5);
        y -= 12;
      }
      y -= 4;
      text(page, "Received", M, y, 9, reg, MUTED); right(page, money(extras.ledger.paidPaise), W - M, y, 9); y -= 14;
      text(page, "Balance due", M, y, 10, bold); right(page, money(extras.ledger.balancePaise), W - M, y, 10, bold, extras.ledger.balancePaise > 0 ? rgb(0.7, 0.15, 0.12) : GREEN);
      y -= 22;
    }
  
    /* bank details */
    if (inv.seller.bank?.account) {
      const b = inv.seller.bank;
      text(page, "BANK DETAILS", M, 150, 8, bold, MUTED);
      text(page, `${b.name ?? ""}  ·  A/c ${b.account}  ·  IFSC ${b.ifsc ?? ""}${b.upiId ? `  ·  UPI ${b.upiId}` : ""}`, M, 137, 8.5, reg);
    }
  
    /* footer */
    const fy = 70;
    rule(page, fy + 30);
    text(page, "Terms: Payment due by the due date shown. Disputes subject to Ballia jurisdiction. Cancellation per booking terms.", M, fy + 16, 7.5, reg, MUTED);
    text(page, "This is a computer-generated document; no signature required. Invoices are immutable once issued, corrections are made via credit note.", M, fy + 5, 7.5, reg, MUTED);
    right(page, `For ${inv.seller.name}`, W - M, fy - 12, 8.5, bold);
    text(page, `Page ${doc.getPageCount()}  ·  Doc hash printed in system record`, M, fy - 12, 7.5, reg, MUTED);
  
    return doc.save();
  }

}

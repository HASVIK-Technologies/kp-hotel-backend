import type { Line, Totals } from "@/domain/tax";

/** Invoice, ledger and payment records. All money is integer paise. */

export interface Party {
  type: "B2C" | "B2B";
  name: string;
  email: string;
  mobile?: string;
  company?: string;
  gstin?: string;
  stateCode?: string;
  address?: string;
  customerId?: string;
}

/* --------------------------------------------------------------- invoice */
export type DocType = "TAX_INVOICE" | "CREDIT_NOTE";
export type PaymentMethod = "ONLINE" | "CASH" | "CARD" | "UPI" | "NET_BANKING" | "BANK_TRANSFER" | "CHEQUE";
export type LedgerStatus = "UNPAID" | "PARTIAL" | "PAID" | "CREDITED";

export interface Invoice {
  id: string;
  number: string; // KP/25-26/00001
  docType: DocType;
  issuedAt: string; // ISO
  dueDate: string; // yyyy-mm-dd
  party: Party;
  lines: Line[];
  totals: Totals;
  discountNote?: string;
  placeOfSupply: string;
  bookingRef?: string;
  relatesToInvoiceId?: string; // credit note → original
  reason?: string; // credit note reason
  notes?: string;
  seller: { name: string; gstin: string; address: string; stateCode: string; phone: string; email: string; bank?: { name?: string; account?: string; ifsc?: string; upiId?: string } };
  ruleSnapshot: { code: string; sac: string; rate: number; verified: boolean }[];
  pdfKey: string;
  pdfSha256: string;
  createdBy: string;
}

export interface Ledger {
  invoiceId: string;
  paidPaise: number;
  balancePaise: number;
  status: LedgerStatus;
  pendingChequePaise: number;
  refundDuePaise: number;
  version: number;
  updatedAt: string;
}

export type PaymentStatus = "SUCCESS" | "PENDING_CLEARANCE" | "BOUNCED" | "FAILED";
export type PaymentKind = "PAYMENT" | "REFUND";

export interface Payment {
  id: string;
  receiptNumber?: string;
  invoiceId: string;
  kind: PaymentKind;
  amountPaise: number;
  method: PaymentMethod;
  status: PaymentStatus;
  paidAt: string;
  recordedBy: string; // staff email or "customer:online"
  // method details
  upiTransactionId?: string;
  upiVpa?: string;
  bankReference?: string; // UTR / net banking ref / card auth
  cardLast4?: string;
  chequeNumber?: string;
  chequeBank?: string;
  chequeDate?: string;
  cashfreeOrderId?: string;
  cashfreePaymentId?: string;
  note?: string;
}


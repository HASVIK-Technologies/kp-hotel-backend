import { addDays, format } from "date-fns";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "./helpers/test-app";

/**
 * Service-level end-to-end test on PostgreSQL: booking → gateway (mock) → settle →
 * invoice + PDF + ledger, offline payments, cheque lifecycle, credit note, inventory and immutability.
 */
let t: Awaited<ReturnType<typeof bootTestApp>>;
let s: Record<string, any>;
const d = (n: number) => format(addDays(new Date(), n), "yyyy-MM-dd");

beforeAll(async () => {
  t = await bootTestApp();
  const [{ BookingsService }, { SettlementService }, { InvoicesService }, { LedgerService }, { InventoryService }, { CashfreeService }, { StorageService }, { UsersService }, { AuthService }] =
    await Promise.all([
      import("@/modules/bookings/bookings.service"),
      import("@/modules/payments/settlement.service"),
      import("@/modules/invoices/invoices.service"),
      import("@/modules/invoices/ledger.service"),
      import("@/modules/rooms/inventory.service"),
      import("@/modules/gateway/cashfree.service"),
      import("@/modules/storage/storage.service"),
      import("@/modules/users/users.service"),
      import("@/modules/auth/auth.service"),
    ]);
  s = {
    bookings: t.get(BookingsService),
    settlement: t.get(SettlementService),
    invoices: t.get(InvoicesService),
    ledger: t.get(LedgerService),
    inventory: t.get(InventoryService),
    cf: t.get(CashfreeService),
    storage: t.get(StorageService),
    users: t.get(UsersService),
    auth: t.get(AuthService),
  };
});
afterAll(() => t?.close());

const guest = { name: "Test Guest", email: "guest@example.com", mobile: "9876543210" };

describe("online booking → Cashfree → invoice", () => {
  let ref = "";
  let orderId = "";

  it("holds inventory and creates a gateway order", async () => {
    const r = await s.bookings.create({ roomSlug: "premium-room", checkIn: d(20), checkOut: d(22), rooms: 1, adults: 2, children: 0, ratePlan: "room-only", addonIds: [], guest, payMode: "online" });
    ref = r.booking.ref;
    orderId = r.payment.orderId;
    expect(r.booking.status).toBe("PENDING_PAYMENT");
    expect(r.payment.mode).toBe("mock");
    // 2 nights x Rs 2,800 = Rs 5,600 + 5% GST = Rs 5,880
    expect(r.booking.totalPaise).toBe(588000);
    expect(await s.inventory.availableRooms("premium-room", d(20), d(22))).toBe(5);
  });

  it("stays pending until the gateway reports success", async () => {
    expect((await s.settlement.settleOrder(orderId)).status).toBe("PENDING");
    await s.cf.mockComplete(orderId, "FAILED", "upi");
    expect((await s.settlement.settleOrder(orderId)).status).toBe("FAILED");
    expect((await s.bookings.get(ref)).status).toBe("PENDING_PAYMENT");
  });

  it("confirms, invoices and records the UPI payment exactly once (idempotent)", async () => {
    await s.cf.mockComplete(orderId, "SUCCESS", "upi");
    const [a, b] = await Promise.all([s.settlement.settleOrder(orderId), s.settlement.settleOrder(orderId)]); // webhook + return page race
    expect(a.status).toBe("PAID");
    expect(b.invoiceId).toBe(a.invoiceId);

    expect((await s.bookings.get(ref)).status).toBe("CONFIRMED");
    const ledger = await s.invoices.getLedger(a.invoiceId);
    expect(ledger.status).toBe("PAID");
    expect(ledger.balancePaise).toBe(0);
    const pays = await s.invoices.getPayments(a.invoiceId);
    expect(pays).toHaveLength(1);
    expect(pays[0].upiTransactionId).toBeTruthy();

    const inv = await s.invoices.get(a.invoiceId);
    expect(inv.number).toMatch(/^KP\/\d{2}-\d{2}\/\d{5}$/);
    const pdf = await s.storage.get(inv.pdfKey);
    expect(Buffer.from(pdf.slice(0, 4)).toString()).toBe("%PDF");
  });

  it("refunds the online payment and credits the invoice on in-window cancellation", async () => {
    const r = await s.bookings.cancel(ref, "guest", { guestEmail: guest.email });
    expect(r.refundable).toBe(true);
    expect(await s.inventory.availableRooms("premium-room", d(20), d(22))).toBe(6);
    const b = await s.bookings.get(ref);
    const led = await s.invoices.getLedger(b.invoiceId);
    expect(led.status).toBe("CREDITED");
    expect(led.refundDuePaise).toBe(0); // auto-refunded
  });
});

describe("inventory", () => {
  it("never oversells", async () => {
    const mk = () => s.bookings.create({ roomSlug: "executive-suite", checkIn: d(40), checkOut: d(41), rooms: 1, adults: 2, children: 0, ratePlan: "room-only", addonIds: [], guest, payMode: "hotel" });
    await mk();
    await mk();
    await mk(); // capacity = 3
    await expect(mk()).rejects.toThrow(/no longer available/);
  });

  it("releases abandoned holds", async () => {
    const r = await s.bookings.create({ roomSlug: "family-suite", checkIn: d(50), checkOut: d(51), rooms: 1, adults: 2, children: 0, ratePlan: "room-only", addonIds: [], guest, payMode: "online" });
    expect(await s.inventory.availableRooms("family-suite", d(50), d(51))).toBe(2);
    const n = await s.bookings.expireHolds(new Date(Date.now() + 60 * 60_000));
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await s.inventory.availableRooms("family-suite", d(50), d(51))).toBe(3);
    expect((await s.bookings.get(r.booking.ref)).status).toBe("EXPIRED");
  });
});

describe("B2B invoice, partial + offline payments", () => {
  let id = "";
  const party = { type: "B2B" as const, name: "Anil Rao", company: "Rao & Co", gstin: "09AABCR1234F1ZQ", email: "ar@raoco.example.com", mobile: "9810044521" };

  it("issues a B2B invoice with mixed rates, due date and discount", async () => {
    const { invoice, ledger } = await s.invoices.create({
      party,
      items: [
        { description: "Banquet hall", ruleCode: "BANQUET_HALL", qty: 1, unitPricePaise: 4500000 },
        { description: "Catering x100", ruleCode: "BANQUET_CATERING", qty: 100, unitPricePaise: 95000 },
      ],
      discount: { type: "percent", value: 5 },
      dueDate: d(15),
      createdBy: "test",
    });
    id = invoice.id;
    expect(invoice.totals.discountPaise).toBe(700000);
    expect(invoice.party.gstin).toBe("09AABCR1234F1ZQ");
    expect(ledger.balancePaise).toBe(invoice.totals.grandTotalPaise);
  });

  it("supports partial payments and tracks the outstanding balance", async () => {
    const before = (await s.invoices.getLedger(id)).balancePaise;
    const r = await s.ledger.recordPayment({ invoiceId: id, amountPaise: 5000000, method: "UPI", upiTransactionId: "T2026101400112233", recordedBy: "frontdesk@kphotel.com" });
    expect(r.payment.upiTransactionId).toBe("T2026101400112233");
    expect(r.ledger.status).toBe("PARTIAL");
    expect(r.ledger.balancePaise).toBe(before - 5000000);
  });

  it("rejects over-payment", async () => {
    await expect(s.ledger.recordPayment({ invoiceId: id, amountPaise: 99999999999, method: "CASH", recordedBy: "x" })).rejects.toThrow(/exceeds/);
  });

  it("holds cheques as pending until cleared, then settles", async () => {
    const led0 = await s.invoices.getLedger(id);
    const r = await s.ledger.recordPayment({ invoiceId: id, amountPaise: led0.balancePaise, method: "CHEQUE", chequeNumber: "123456", chequeBank: "SBI", chequeDate: d(0), recordedBy: "x" });
    expect(r.payment.status).toBe("PENDING_CLEARANCE");
    expect(r.ledger.balancePaise).toBe(led0.balancePaise); // not yet counted
    expect(r.ledger.pendingChequePaise).toBe(led0.balancePaise);
    const after = await s.ledger.resolveCheque(id, r.payment.id, "CLEARED", "acct");
    expect(after.status).toBe("PAID");
    expect(after.balancePaise).toBe(0);
  });

  it("issues a credit note without ever mutating the original invoice", async () => {
    const original = await s.invoices.get(id);
    const { creditNote, ledger } = await s.ledger.issueCreditNote(id, "Event cancelled by client", "owner");
    expect(creditNote.docType).toBe("CREDIT_NOTE");
    expect(creditNote.number).toMatch(/^KP\/CN\//);
    expect(ledger.status).toBe("CREDITED");
    expect(ledger.refundDuePaise).toBe(original.totals.grandTotalPaise);
    expect(await s.invoices.get(id)).toEqual(original);
    await expect(s.ledger.issueCreditNote(id, "again please", "owner")).rejects.toThrow(/already credited/);
  });

  it("generates gap-free sequential invoice numbers under concurrency", async () => {
    const mk = () =>
      s.invoices.create({ party: { type: "B2C", name: "A B", email: "a@b.co" }, items: [{ description: "Food", ruleCode: "RESTAURANT_FNB", qty: 1, unitPricePaise: 10000 }], createdBy: "t" });
    const [a, b, c] = await Promise.all([mk(), mk(), mk()]);
    const nums = [a, b, c].map((x: any) => Number(x.invoice.number.split("/").pop())).sort((x, y) => x - y);
    expect(nums[1]).toBe(nums[0] + 1);
    expect(nums[2]).toBe(nums[1] + 1);
  });
});

describe("auth", () => {
  it("hashes, verifies and locks out", async () => {
    await s.users.create({ email: "t@kphotel.com", name: "Test User", role: "frontdesk", password: "CorrectHorse@1" });
    const ok = await s.auth.login("t@kphotel.com", "CorrectHorse@1");
    expect(ok.user.role).toBe("frontdesk");
    for (let i = 0; i < 5; i++) await s.auth.login("t@kphotel.com", "wrong");
    expect((await s.auth.login("t@kphotel.com", "CorrectHorse@1")).error).toMatch(/Too many/);
  });
});

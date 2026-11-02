import { Injectable } from "@nestjs/common";
import { randomBytes, randomInt } from "node:crypto";
import { differenceInHours, parseISO } from "date-fns";
import { AppConfig } from "@/config/app-config.service";
import { BookingException, NotFoundAppException, SoldOutException } from "@/common/errors/app.exception";
import { IST_OFFSET_MS, istToday } from "@/common/utils/time.util";
import { computeInvoice } from "@/domain/tax";
import { RATE_PLANS } from "@/domain/pricing/catalog";
import { bookingLineItems, HOTEL_STATE_CODE } from "@/domain/pricing/pricing";
import { AuditService } from "@/modules/audit/audit.service";
import { CashfreeService } from "@/modules/gateway/cashfree.service";
import { PaymentOrdersRepository } from "@/modules/gateway/payment-orders.repository";
import { LedgerService } from "@/modules/invoices/ledger.service";
import { InvoicesService } from "@/modules/invoices/invoices.service";
import { MailService } from "@/modules/mail/mail.service";
import { MailTemplates } from "@/modules/mail/mail.templates";
import { InventoryService } from "@/modules/rooms/inventory.service";
import { RoomsService } from "@/modules/rooms/rooms.service";
import { SettingsService } from "@/modules/settings/settings.service";
import type { Booking, BookingStatus } from "./booking.types";
import { BookingsRepository, type StoredBooking } from "./bookings.repository";
import { BookingInvoicingService } from "./booking-invoicing.service";
import { toPublicBooking } from "./booking.mapper";

export const HOLD_MINUTES = 20;

export interface CreateBookingInput {
  roomSlug: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children: number;
  ratePlan: string;
  addonIds: string[];
  promo?: string;
  guest: Booking["guest"];
  payMode: "online" | "hotel" | "staff";
  source?: Booking["source"];
  createdBy?: string;
}

const newRef = () => `KPH-${randomInt(10000, 99999)}`;

@Injectable()
export class BookingsService {
  constructor(
    private readonly config: AppConfig,
    private readonly repo: BookingsRepository,
    private readonly rooms: RoomsService,
    private readonly inventory: InventoryService,
    private readonly settings: SettingsService,
    private readonly invoices: InvoicesService,
    private readonly ledger: LedgerService,
    private readonly invoicing: BookingInvoicingService,
    private readonly gateway: CashfreeService,
    private readonly orders: PaymentOrdersRepository,
    private readonly mail: MailService,
    private readonly templates: MailTemplates,
    private readonly audit: AuditService,
  ) {}

  find(ref: string) {
    return this.repo.find(ref);
  }

  async get(ref: string): Promise<StoredBooking> {
    const b = await this.repo.find(ref);
    if (!b) throw new NotFoundAppException("Booking");
    return b;
  }

  async list(limit = 300): Promise<Booking[]> {
    return (await this.repo.list(limit)).map(toPublicBooking);
  }

  /* ------------------------------------------------------------------ create */
  async create(input: CreateBookingInput) {
    const room = await this.rooms.find(input.roomSlug);
    if (!room) throw new BookingException("Unknown room", 404, "NOT_FOUND");
    if (!room.active) throw new SoldOutException();
    if (!RATE_PLANS.some((p) => p.id === input.ratePlan)) throw new BookingException("Unknown rate plan");

    const guestsPerRoom = Math.ceil((input.adults + input.children) / input.rooms);
    if (guestsPerRoom > room.maxGuests) throw new BookingException(`This room sleeps ${room.maxGuests}. Add another room or pick a larger one.`);
    if (input.checkIn < istToday()) throw new BookingException("Check-in can't be in the past");

    const rules = await this.settings.getTaxRules();
    const { items, nights } = bookingLineItems({
      room: { name: room.name, price: room.price },
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      rooms: input.rooms,
      ratePlan: input.ratePlan,
      addonIds: input.addonIds,
      promo: input.promo,
    });
    if (nights < 1 || nights > 30) throw new BookingException("Stays must be between 1 and 30 nights");
    const { totals } = computeInvoice(items, { rules, hotelStateCode: HOTEL_STATE_CODE });

    await this.inventory.reserveNights(input.roomSlug, input.checkIn, input.checkOut, input.rooms);

    const now = new Date();
    const confirmedNow = input.payMode !== "online";
    const base: StoredBooking = {
      ref: "",
      status: confirmedNow ? "CONFIRMED" : "PENDING_PAYMENT",
      roomSlug: room.slug,
      roomName: room.name,
      image: room.images[0],
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      nights,
      rooms: input.rooms,
      adults: input.adults,
      children: input.children,
      ratePlan: input.ratePlan,
      addonIds: input.addonIds,
      promo: input.promo?.toUpperCase(),
      guest: input.guest,
      payMode: input.payMode,
      totalPaise: totals.grandTotalPaise,
      createdAt: now.toISOString(),
      source: input.source ?? "Website",
      holdExpiresAt: confirmedNow ? undefined : new Date(now.getTime() + HOLD_MINUTES * 60_000).toISOString(),
      rulesSnapshot: rules,
      attempts: 0,
      roomPriceRupees: room.price,
    };

    // unique, human-friendly reference
    let placed = false;
    for (let i = 0; i < 8 && !placed; i++) {
      base.ref = newRef();
      try {
        placed = await this.repo.insert(base);
      } catch (e) {
        await this.inventory.releaseNights(input.roomSlug, input.checkIn, input.checkOut, input.rooms);
        throw e;
      }
    }
    if (!placed) {
      await this.inventory.releaseNights(input.roomSlug, input.checkIn, input.checkOut, input.rooms);
      throw new Error("Could not allocate a booking reference");
    }

    if (confirmedNow) {
      const { invoice } = await this.invoicing.ensureInvoice(base.ref, input.createdBy ?? "system");
      const b = (await this.repo.find(base.ref))!;
      await this.invoicing.notifyConfirmed(b, invoice);
      return { booking: toPublicBooking(b), invoice, payment: null };
    }

    const payment = await this.startOnlinePayment(base.ref);
    return { booking: toPublicBooking((await this.repo.find(base.ref))!), invoice: null, payment };
  }

  /* --------------------------------------------------------- online payments */
  async startOnlinePayment(ref: string) {
    const b = await this.repo.find(ref);
    if (!b) throw new BookingException("Booking not found", 404, "NOT_FOUND");
    if (b.status !== "PENDING_PAYMENT") throw new BookingException("This booking is not awaiting payment", 409, "NOT_PENDING");
    if (b.holdExpiresAt && b.holdExpiresAt < new Date().toISOString()) throw new BookingException("Your hold has expired. Please search again.", 410, "HOLD_EXPIRED");

    const attempt = b.attempts + 1;
    await this.repo.setAttempts(ref, attempt);
    const orderId = `${ref}-${attempt}-${randomBytes(4).toString("hex")}`; // unguessable: status lookups need the full id
    const order = await this.gateway.createOrder({
      orderId,
      amountPaise: b.totalPaise,
      customerId: `g_${ref.replace("-", "")}`,
      name: b.guest.name,
      email: b.guest.email,
      mobile: b.guest.mobile,
      expiresAt: new Date(b.holdExpiresAt ?? Date.now() + HOLD_MINUTES * 60_000),
      returnUrl: `${this.config.webUrl}/payment/return?order_id=${orderId}`,
      notifyUrl: `${this.config.apiUrl}/payments/cashfree/webhook`,
      note: `Booking ${ref}`,
    });
    await this.orders.save(orderId, { kind: "booking", ref }, b.totalPaise);
    return { orderId, paymentSessionId: order.paymentSessionId, mode: order.mode, amountPaise: b.totalPaise };
  }

  /** Hold → confirmed after a successful payment. Re-takes inventory if the hold had already lapsed. */
  async confirmPaid(b: StoredBooking) {
    if (b.status === "EXPIRED") {
      // paid after the hold lapsed, try to re-take the inventory; otherwise flag for staff
      try {
        await this.inventory.reserveNights(b.roomSlug, b.checkIn, b.checkOut, b.rooms);
      } catch {
        await this.mail.sendSafe({
          to: this.config.env.STAFF_ALERT_EMAIL,
          ...this.templates.staffAlert("Paid booking could not be re-allocated", [["Booking", b.ref], ["Room", b.roomName], ["Action", "Contact guest: refund or re-accommodate"]]),
        });
      }
    }
    await this.repo.markConfirmed(b);
  }

  /* ------------------------------------------------------------------ cancel */
  async cancel(ref: string, actor: string, opts: { guestEmail?: string; force?: boolean } = {}) {
    const b = await this.repo.find(ref);
    if (!b) throw new BookingException("Booking not found", 404, "NOT_FOUND");
    if (opts.guestEmail && b.guest.email.toLowerCase() !== opts.guestEmail.toLowerCase()) throw new BookingException("Booking not found", 404, "NOT_FOUND");
    if (["CANCELLED", "CHECKED_OUT", "CHECKED_IN"].includes(b.status)) {
      throw new BookingException(`A ${b.status.toLowerCase().replace("_", " ")} booking can't be cancelled`, 409, "NOT_CANCELLABLE");
    }

    const plan = RATE_PLANS.find((p) => p.id === b.ratePlan);
    const hoursToCheckIn = differenceInHours(parseISO(b.checkIn), new Date(Date.now() + IST_OFFSET_MS));
    const refundable = !!plan?.refundable && hoursToCheckIn >= 48;

    let note = "Your booking has been cancelled.";
    if (b.invoiceId && refundable) {
      const ledger = await this.invoices.getLedger(b.invoiceId);
      if (ledger && ledger.status !== "CREDITED") {
        const { ledger: after } = await this.ledger.issueCreditNote(b.invoiceId, `Booking ${ref} cancelled`, actor);
        // automatically refund online payments through the gateway
        let refunded = 0;
        const paid = (await this.invoices.getPayments(b.invoiceId)).filter((x) => x.kind === "PAYMENT" && x.status === "SUCCESS" && x.method === "ONLINE" && x.cashfreeOrderId);
        for (const p of paid) {
          const r = await this.gateway.createRefund(p.cashfreeOrderId!, p.amountPaise, `RF-${p.id}`.slice(0, 40), `Cancellation ${ref}`);
          if (r.ok) {
            await this.ledger.recordPayment({ invoiceId: b.invoiceId, amountPaise: p.amountPaise, method: "ONLINE", recordedBy: actor, kind: "REFUND", bankReference: r.refundId, note: `Refund of ${p.cashfreePaymentId}` });
            refunded += p.amountPaise;
          }
        }
        note =
          refunded > 0
            ? `A refund of ₹${(refunded / 100).toLocaleString("en-IN")} has been initiated to your original payment method (5–7 working days).`
            : after.refundDuePaise > 0
              ? "Your refund is being processed by our team."
              : "No payment was due.";
      }
    } else if (b.invoiceId) {
      note = "This rate is non-refundable or inside 48 hours of check-in, so no refund applies.";
    }

    await this.repo.markCancelled(b);
    await this.inventory.releaseNights(b.roomSlug, b.checkIn, b.checkOut, b.rooms);
    await this.audit.record(actor, "booking.cancel", ref, { refundable });
    const pb = toPublicBooking({ ...b, status: "CANCELLED" });
    await this.mail.sendSafe({ to: b.guest.email, ...this.templates.bookingCancelled(pb, note) });
    return { booking: pb, refundable, note };
  }

  /** Scheduled every few minutes: frees inventory held by abandoned checkouts. */
  async expireHolds(now = new Date()): Promise<number> {
    let n = 0;
    for (const b of await this.repo.listHolds(now.toISOString())) {
      if (await this.repo.markExpired(b)) {
        await this.inventory.releaseNights(b.roomSlug, b.checkIn, b.checkOut, b.rooms);
        n++;
      }
    }
    return n;
  }

  async setStatus(ref: string, status: Extract<BookingStatus, "CHECKED_IN" | "CHECKED_OUT" | "NO_SHOW">, actor: string) {
    const b = await this.repo.find(ref);
    if (!b) throw new BookingException("Booking not found", 404, "NOT_FOUND");
    const allowed: Record<string, BookingStatus[]> = { CHECKED_IN: ["CONFIRMED"], CHECKED_OUT: ["CHECKED_IN"], NO_SHOW: ["CONFIRMED"] };
    if (!allowed[status].includes(b.status)) throw new BookingException(`Cannot move a ${b.status} booking to ${status}`, 409);
    await this.repo.setStatus(ref, status);
    if (status === "NO_SHOW") await this.inventory.releaseNights(b.roomSlug, b.checkIn, b.checkOut, b.rooms);
    await this.audit.record(actor, `booking.${status.toLowerCase()}`, ref);
    return toPublicBooking({ ...b, status });
  }
}

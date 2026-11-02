import { Injectable } from "@nestjs/common";
import { PrismaService, isConditionFailed } from "@/database/prisma.service";
import { stripKeys } from "@/common/utils/storage-item.util";
import type { TaxRule } from "@/domain/tax";
import type { Booking, BookingStatus } from "./booking.types";

/** A booking as stored: the public fields plus internal pricing/bookkeeping fields that never leave the API. */
export type StoredBooking = Booking & { rulesSnapshot: TaxRule[]; attempts: number; roomPriceRupees: number; invoiceCreating?: string };

const key = (ref: string) => ({ pk: `BOOKING#${ref}`, sk: "META" });

@Injectable()
export class BookingsRepository {
  constructor(private readonly db: PrismaService) {}

  async find(ref: string): Promise<StoredBooking | undefined> {
    const it = await this.db.get(`BOOKING#${ref}`);
    return it ? stripKeys<StoredBooking>(it) : undefined;
  }

  async list(limit: number): Promise<StoredBooking[]> {
    return (await this.db.listByType("BOOKING", { limit })).map((i) => stripKeys<StoredBooking>(i));
  }

  /** Bookings whose payment hold expires at or before `beforeIso`. */
  async listHolds(beforeIso: string): Promise<StoredBooking[]> {
    return (await this.db.listByRelation("HOLD", { beforeSk: beforeIso })).map((h) => stripKeys<StoredBooking>(h));
  }

  /** @returns false when the reference is already taken. */
  async insert(b: StoredBooking): Promise<boolean> {
    try {
      await this.db.put(
        {
          pk: `BOOKING#${b.ref}`,
          sk: "META",
          gsi1pk: "BOOKING",
          gsi1sk: `${b.createdAt}#${b.ref}`,
          gsi2pk: b.holdExpiresAt ? "HOLD" : `EMAIL#${b.guest.email.toLowerCase()}`,
          gsi2sk: b.holdExpiresAt ?? b.createdAt,
          ...b,
        },
        { ifNotExists: true },
      );
      return true;
    } catch (e) {
      if (isConditionFailed(e)) return false;
      throw e;
    }
  }

  async setAttempts(ref: string, attempts: number) {
    await this.db.update(key(ref), { set: { attempts } });
  }

  /** Hold → confirmed (paid online). */
  async markConfirmed(b: StoredBooking) {
    await this.db.update(key(b.ref), {
      set: { status: "CONFIRMED", gsi2pk: `EMAIL#${b.guest.email.toLowerCase()}`, gsi2sk: b.createdAt },
      remove: ["holdExpiresAt"],
    });
  }

  /** Claims the right to create the booking's invoice. Returns false if another request holds a fresh claim. */
  async claimInvoiceCreation(ref: string): Promise<boolean> {
    const stale = new Date(Date.now() - 60_000).toISOString();
    try {
      await this.db.update(key(ref), {
        set: { invoiceCreating: new Date().toISOString() },
        conditions: { absent: ["invoiceId"], any: [{ absent: ["invoiceCreating"] }, { lessThan: { invoiceCreating: stale } }] },
      });
      return true;
    } catch (e) {
      if (isConditionFailed(e)) return false;
      throw e;
    }
  }

  async attachInvoice(ref: string, invoiceId: string, invoiceNumber: string, totalPaise: number) {
    await this.db.update(key(ref), {
      set: { invoiceId, invoiceNumber, totalPaise },
      remove: ["invoiceCreating"],
    });
  }

  async markCancelled(b: StoredBooking) {
    await this.db.update(key(b.ref), {
      set: { status: "CANCELLED", cancelledAt: new Date().toISOString(), gsi2pk: `EMAIL#${b.guest.email.toLowerCase()}`, gsi2sk: b.createdAt },
      remove: ["holdExpiresAt"],
    });
  }

  /** PENDING_PAYMENT → EXPIRED. Returns false if the booking was no longer pending. */
  async markExpired(b: StoredBooking): Promise<boolean> {
    try {
      await this.db.update(key(b.ref), {
        set: { status: "EXPIRED", gsi2pk: `EMAIL#${b.guest.email.toLowerCase()}`, gsi2sk: b.createdAt },
        remove: ["holdExpiresAt"],
        conditions: { equals: { status: "PENDING_PAYMENT" } },
      });
      return true;
    } catch (e) {
      if (isConditionFailed(e)) return false;
      throw e;
    }
  }

  async setStatus(ref: string, status: BookingStatus) {
    await this.db.update(key(ref), { set: { status } });
  }
}

import { Injectable } from "@nestjs/common";
import { PrismaService, isConditionFailed } from "@/database/prisma.service";
import { AppException, SoldOutException } from "@/common/errors/app.exception";
import { RoomsService } from "./rooms.service";

export const nightsList = (checkIn: string, checkOut: string): string[] => {
  const out: string[] = [];
  for (let d = Date.parse(checkIn); d < Date.parse(checkOut); d += 86400_000) out.push(new Date(d).toISOString().slice(0, 10));
  return out;
};

/**
 * Per-night room counters (`INV#slug` / `DATE#yyyy-mm-dd` → booked). Reservations are conditional
 * transactional writes, so inventory can never be oversold even under concurrent bookings.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly db: PrismaService,
    private readonly rooms: RoomsService,
  ) {}

  /** How many rooms of this type are still free on every night of [checkIn, checkOut). */
  async availableRooms(slug: string, checkIn: string, checkOut: string): Promise<number> {
    const room = await this.rooms.find(slug);
    if (!room || !room.active) return 0;
    const items = await this.db.queryRange<any>(`INV#${slug}`, `DATE#${checkIn}`, `DATE#${checkOut}`);
    const booked = new Map(items.map((i) => [String(i.sk).slice(5), Number(i.booked)]));
    const nights = nightsList(checkIn, checkOut);
    return Math.max(0, Math.min(...nights.map((n) => room.inventory - (booked.get(n) ?? 0))));
  }

  /** Atomically reserve `qty` rooms for each night (all-or-nothing, never oversells). */
  async reserveNights(slug: string, checkIn: string, checkOut: string, qty: number) {
    const room = await this.rooms.find(slug);
    if (!room || !room.active) throw new SoldOutException();
    const nights = nightsList(checkIn, checkOut);
    if (nights.length === 0 || nights.length > 30) throw new AppException("Stays must be between 1 and 30 nights");
    const operations = nights.map((n) => ({
      update: {
        key: { pk: `INV#${slug}`, sk: `DATE#${n}` },
        mutation: { increment: { booked: qty }, conditions: { lessThanOrEqual: { booked: room.inventory - qty } } },
      },
    }));
    try {
      await this.db.transaction(operations);
    } catch (e) {
      if (isConditionFailed(e)) throw new SoldOutException();
      throw e;
    }
  }

  async releaseNights(slug: string, checkIn: string, checkOut: string, qty: number) {
    const operations = nightsList(checkIn, checkOut).map((n) => ({
      update: {
        key: { pk: `INV#${slug}`, sk: `DATE#${n}` },
        mutation: { increment: { booked: -qty }, conditions: { greaterThanOrEqual: { booked: qty } } },
      },
    }));
    try {
      await this.db.transaction(operations);
    } catch (e) {
      if (!isConditionFailed(e)) throw e;
    }
  }
}

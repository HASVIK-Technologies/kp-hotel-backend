import { Injectable, Logger } from "@nestjs/common";
import { addDays, format } from "date-fns";
import { AppConfig } from "@/config/app-config.service";
import { paise } from "@/domain/tax";
import { BookingsService } from "@/modules/bookings/bookings.service";
import { CustomersService } from "@/modules/customers/customers.service";
import { InvoicesService } from "@/modules/invoices/invoices.service";
import { LedgerService } from "@/modules/invoices/ledger.service";
import { DEFAULT_ROOMS } from "@/modules/rooms/default-rooms";
import { RoomsRepository } from "@/modules/rooms/rooms.repository";
import { UsersService } from "@/modules/users/users.service";

export const OWNER = { email: "admin@kphotel.com", password: "KpAdmin@2026", name: "Priya Sharma" };

/** Idempotent bootstrap + local demo data. Production never seeds demo data. */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly config: AppConfig,
    private readonly users: UsersService,
    private readonly roomsRepo: RoomsRepository,
    private readonly bookings: BookingsService,
    private readonly customers: CustomersService,
    private readonly invoices: InvoicesService,
    private readonly ledger: LedgerService,
  ) {}

  /** Creates the first owner account if it does not exist. Run once per environment (use a strong password). */
  async ensureOwner(email = OWNER.email, password = OWNER.password, name = OWNER.name) {
    if (await this.users.find(email)) return false;
    await this.users.create({ email, name, role: "owner", password });
    return true;
  }

  /** Starter room categories, only when the catalogue is empty. */
  async ensureDefaultRooms() {
    const flag = this.config.env.SEED_DEFAULT_ROOMS;
    const enabled = flag ? flag === "1" : !this.config.isProd;
    if (!enabled || (await this.roomsRepo.list()).length > 0) return 0;
    const now = new Date().toISOString();
    for (const [i, room] of DEFAULT_ROOMS.entries()) await this.roomsRepo.insert({ ...room, sortOrder: i + 1, createdAt: now, updatedAt: now });
    this.logger.log(`Created ${DEFAULT_ROOMS.length} starter room categories`);
    return DEFAULT_ROOMS.length;
  }

  /** Local demo data so the admin console is meaningful on first run. */
  async seedDemo() {
    const d = (n: number) => format(addDays(new Date(), n), "yyyy-MM-dd");
    await this.ensureOwner();
    await this.users.create({ email: "frontdesk@kphotel.com", name: "Rohit Kumar", role: "frontdesk", password: "FrontDesk@2026" }).catch(() => {});
    await this.users.create({ email: "accounts@kphotel.com", name: "Meera Iyer", role: "accountant", password: "Accounts@2026" }).catch(() => {});

    // B2B customer with credit terms
    await this.customers
      .create({ name: "Anil Rao", company: "Rao & Co. Logistics", gstin: "09AABCR1234F1ZQ", email: "accounts@raoco.example.com", mobile: "9810044521", address: "12 Civil Lines, Ballia, UP", creditDays: 15 })
      .catch(() => {});

    const booking = await this.bookings.create({
      roomSlug: "executive-suite", checkIn: d(10), checkOut: d(12), rooms: 1, adults: 2, children: 0, ratePlan: "breakfast", addonIds: ["pickup"],
      guest: { name: "Aarav Fernandes", email: "aarav@example.com", mobile: "9876543210" }, payMode: "hotel", source: "Phone", createdBy: "seed",
    });
    await this.bookings.create({
      roomSlug: "deluxe-room", checkIn: d(3), checkOut: d(5), rooms: 2, adults: 4, children: 0, ratePlan: "room-only", addonIds: [],
      guest: { name: "Sunita Gupta", email: "sunita@example.com", mobile: "9988776655" }, payMode: "hotel", source: "Walk-in", createdBy: "seed",
    });

    // B2B banquet invoice, partial payment, overdue
    const { invoice } = await this.invoices.create({
      party: { type: "B2B", name: "Anil Rao", company: "Rao & Co. Logistics", gstin: "09AABCR1234F1ZQ", email: "accounts@raoco.example.com", mobile: "9810044521", stateCode: "09", customerId: "cus_09aabcr1234f1zq" },
      items: [
        { description: "Banquet hall hire, Royal Banquet Hall (annual dealers' meet)", ruleCode: "BANQUET_HALL", qty: 1, unitPricePaise: paise(45000) },
        { description: "Catering, Gold package × 120 guests", ruleCode: "BANQUET_CATERING", qty: 120, unitPricePaise: paise(950) },
      ],
      discount: { type: "percent", value: 5 }, discountNote: "Corporate rate", createdBy: "seed",
      dueDate: d(-6), issuedAt: addDays(new Date(), -21), notes: "Event held 18 days ago",
    });
    await this.ledger.recordPayment({ invoiceId: invoice.id, amountPaise: paise(50000), method: "BANK_TRANSFER", recordedBy: "seed", bankReference: "UTR2026091800123", paidAt: addDays(new Date(), -19).toISOString() });

    // B2C restaurant bill, paid via UPI
    const { invoice: bill } = await this.invoices.create({
      party: { type: "B2C", name: "Walk-in guest", email: "walkin@example.com" },
      items: [{ description: "Restaurant, dinner for 4", ruleCode: "RESTAURANT_FNB", qty: 1, unitPricePaise: paise(2860) }],
      createdBy: "seed",
    });
    await this.ledger.recordPayment({ invoiceId: bill.id, amountPaise: bill.totals.grandTotalPaise, method: "UPI", recordedBy: "seed", upiTransactionId: "426012345678", upiVpa: "guest@okicici" });
    return { booking: booking.booking.ref };
  }

  /** Called on startup in local/dev. */
  async bootstrapLocal() {
    await this.ensureDefaultRooms();
    if (this.config.env.SEED_DEMO === "1") {
      await this.seedDemo();
      this.logger.log(`Demo data seeded (owner: ${OWNER.email} / ${OWNER.password})`);
    }
  }
}

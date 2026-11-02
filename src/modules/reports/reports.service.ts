import { Injectable } from "@nestjs/common";
import { istDate, istToday } from "@/common/utils/time.util";
import { BookingsService } from "@/modules/bookings/bookings.service";
import { EnquiriesService } from "@/modules/enquiries/enquiries.service";
import { InvoicesService } from "@/modules/invoices/invoices.service";
import { RoomsService } from "@/modules/rooms/rooms.service";

/** Read-only management reports built from invoices, ledgers, payments and bookings. */
@Injectable()
export class ReportsService {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly bookings: BookingsService,
    private readonly enquiries: EnquiriesService,
    private readonly rooms: RoomsService,
  ) {}

  async dashboard() {
    const [invoices, payments, bookings, enquiries, rooms] = await Promise.all([
      this.invoices.list(),
      this.invoices.listPayments(),
      this.bookings.list(),
      this.enquiries.list(),
      this.rooms.list(),
    ]);
    const today = istToday();
    const month = today.slice(0, 7);

    const ok = payments.filter((p) => p.status === "SUCCESS");
    const net = (p: (typeof ok)[number]) => (p.kind === "REFUND" ? -p.amountPaise : p.amountPaise);
    const collectedToday = ok.filter((p) => istDate(p.paidAt) === today).reduce((s, p) => s + net(p), 0);
    const collectedMonth = ok.filter((p) => istDate(p.paidAt).startsWith(month)).reduce((s, p) => s + net(p), 0);

    const taxInv = invoices.filter((r) => r.invoice.docType === "TAX_INVOICE");
    const outstanding = taxInv.reduce((s, r) => s + r.ledger.balancePaise, 0);
    const overdue = taxInv.filter((r) => r.overdue);

    const totalRooms = rooms.reduce((s, r) => s + (r.active ? r.inventory : 0), 0);
    const occupied = bookings.filter((b) => ["CONFIRMED", "CHECKED_IN"].includes(b.status) && b.checkIn <= today && b.checkOut > today).reduce((s, b) => s + b.rooms, 0);

    // 6-month revenue by service from tax invoices less credit notes (taxable value)
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setUTCMonth(d.getUTCMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }
    const revenue = months.map((m) => {
      const row = { month: m, ROOM: 0, RESTAURANT: 0, BANQUET: 0, CONFERENCE: 0, OTHER: 0 };
      for (const r of invoices) {
        if (istDate(r.invoice.issuedAt).slice(0, 7) !== m) continue;
        const sign = r.invoice.docType === "CREDIT_NOTE" ? -1 : 1;
        for (const l of r.invoice.lines) row[l.service] += sign * l.taxablePaise;
      }
      return row;
    });

    return {
      collectedTodayPaise: collectedToday,
      collectedMonthPaise: collectedMonth,
      outstandingPaise: outstanding,
      overduePaise: overdue.reduce((s, r) => s + r.ledger.balancePaise, 0),
      overdueCount: overdue.length,
      occupancyPct: totalRooms ? Math.round((occupied / totalRooms) * 100) : 0,
      arrivalsToday: bookings.filter((b) => b.status === "CONFIRMED" && b.checkIn === today).length,
      departuresToday: bookings.filter((b) => b.status === "CHECKED_IN" && b.checkOut === today).length,
      openEnquiries: enquiries.filter((e) => e.status === "New").length,
      pendingCheques: invoices.reduce((s, r) => s + r.ledger.pendingChequePaise, 0),
      revenue,
      recentBookings: bookings.slice(0, 8),
    };
  }

  async outstandingAging() {
    const rows = (await this.invoices.list()).filter((r) => r.invoice.docType === "TAX_INVOICE" && r.ledger.balancePaise > 0);
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    for (const r of rows) {
      const d = r.daysOverdue;
      const k = d <= 0 ? "current" : d <= 30 ? "d1_30" : d <= 60 ? "d31_60" : d <= 90 ? "d61_90" : "d90plus";
      buckets[k] += r.ledger.balancePaise;
    }
    return {
      buckets,
      totalPaise: rows.reduce((s, r) => s + r.ledger.balancePaise, 0),
      rows: rows
        .sort((a, b) => b.daysOverdue - a.daysOverdue)
        .map((r) => ({
          invoiceId: r.invoice.id,
          number: r.invoice.number,
          party: r.invoice.party.company || r.invoice.party.name,
          type: r.invoice.party.type,
          dueDate: r.invoice.dueDate,
          daysOverdue: r.daysOverdue,
          totalPaise: r.invoice.totals.grandTotalPaise,
          balancePaise: r.ledger.balancePaise,
        })),
    };
  }

  /** GSTR-1 style summary: taxable value and tax by SAC and rate, credit notes netted. */
  async gstSummary(from: string, to: string) {
    const rows = (await this.invoices.list(2000)).filter((r) => {
      const d = istDate(r.invoice.issuedAt);
      return d >= from && d <= to;
    });
    const map = new Map<string, { sac: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
    const b2b: { number: string; date: string; gstin: string; party: string; taxable: number; tax: number; total: number; docType: string }[] = [];
    let b2cTaxable = 0;
    let b2cTax = 0;
    for (const r of rows) {
      const sign = r.invoice.docType === "CREDIT_NOTE" ? -1 : 1;
      let invTaxable = 0;
      let invTax = 0;
      for (const l of r.invoice.lines) {
        const key = `${l.sac}|${l.gstRate}`;
        const m = map.get(key) ?? { sac: l.sac, rate: l.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
        m.taxable += sign * l.taxablePaise;
        m.cgst += sign * l.cgstPaise;
        m.sgst += sign * l.sgstPaise;
        m.igst += sign * l.igstPaise;
        map.set(key, m);
        invTaxable += sign * l.taxablePaise;
        invTax += sign * (l.cgstPaise + l.sgstPaise + l.igstPaise);
      }
      if (r.invoice.party.type === "B2B") {
        b2b.push({
          number: r.invoice.number,
          date: istDate(r.invoice.issuedAt),
          gstin: r.invoice.party.gstin ?? "",
          party: r.invoice.party.company ?? r.invoice.party.name,
          taxable: invTaxable,
          tax: invTax,
          total: sign * r.invoice.totals.grandTotalPaise,
          docType: r.invoice.docType,
        });
      } else {
        b2cTaxable += invTaxable;
        b2cTax += invTax;
      }
    }
    const byRate = [...map.values()].sort((a, b) => a.sac.localeCompare(b.sac) || a.rate - b.rate);
    return {
      from,
      to,
      byRate,
      b2b,
      b2c: { taxablePaise: b2cTaxable, taxPaise: b2cTax },
      totalTaxablePaise: byRate.reduce((s, r) => s + r.taxable, 0),
      totalTaxPaise: byRate.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0),
    };
  }

  async collections(from: string, to: string) {
    const pays = (await this.invoices.listPayments(2000)).filter((p) => p.status === "SUCCESS" && istDate(p.paidAt) >= from && istDate(p.paidAt) <= to);
    const byMethod: Record<string, number> = {};
    for (const p of pays) byMethod[p.method] = (byMethod[p.method] ?? 0) + (p.kind === "REFUND" ? -p.amountPaise : p.amountPaise);
    return { from, to, byMethod, totalPaise: Object.values(byMethod).reduce((a, b) => a + b, 0), count: pays.length };
  }
}

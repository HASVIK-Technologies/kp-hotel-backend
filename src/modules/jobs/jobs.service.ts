import { Injectable } from "@nestjs/common";
import { AppConfig } from "@/config/app-config.service";
import { TokensService } from "@/modules/auth/tokens.service";
import { BookingsService } from "@/modules/bookings/bookings.service";
import { InvoicesRepository } from "@/modules/invoices/invoices.repository";
import { InvoicesService } from "@/modules/invoices/invoices.service";
import { MailService } from "@/modules/mail/mail.service";
import { MailTemplates } from "@/modules/mail/mail.templates";

/** Scheduled work. In AWS, EventBridge Scheduler invokes the Lambda with `{ "job": "release-holds" | "reminders" }`. */
@Injectable()
export class JobsService {
  constructor(
    private readonly config: AppConfig,
    private readonly bookings: BookingsService,
    private readonly invoices: InvoicesService,
    private readonly invoicesRepo: InvoicesRepository,
    private readonly tokens: TokensService,
    private readonly mail: MailService,
    private readonly templates: MailTemplates,
  ) {}

  /** Daily: remind customers of invoices due within 3 days or overdue (max one reminder / 7 days). */
  async runReminders(now = new Date()): Promise<number> {
    const rows = await this.invoices.list(2000);
    const horizon = new Date(now.getTime() + 3 * 86400_000 + 5.5 * 3600_000).toISOString().slice(0, 10);
    let sent = 0;
    for (const r of rows) {
      if (r.invoice.docType !== "TAX_INVOICE" || r.ledger.balancePaise <= 0 || r.ledger.status === "CREDITED") continue;
      if (r.invoice.dueDate > horizon) continue;
      const last = (r.ledger as { lastReminderAt?: string }).lastReminderAt;
      if (last && now.getTime() - Date.parse(last) < 7 * 86400_000) continue;
      const url = `${this.config.webUrl}/pay?invoice=${r.invoice.id}&t=${await this.tokens.signLink("pay", r.invoice.id, 30)}`;
      await this.mail.sendSafe({ to: r.invoice.party.email, ...this.templates.paymentReminder(r.invoice, r.ledger, r.daysOverdue, url) });
      await this.invoicesRepo.setLastReminder(r.invoice.id, now.toISOString());
      sent++;
    }
    return sent;
  }

  async run(job: string) {
    if (job === "release-holds") return { released: await this.bookings.expireHolds() };
    if (job === "reminders") return { reminders: await this.runReminders() };
    throw new Error(`Unknown job ${job}`);
  }
}

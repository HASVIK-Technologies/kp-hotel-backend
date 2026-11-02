import { Injectable } from "@nestjs/common";
import { ValidationAppException } from "@/common/errors/app.exception";
import { computeInvoice, paise, stateCodeOf } from "@/domain/tax";
import { CustomersService } from "@/modules/customers/customers.service";
import { SettingsService } from "@/modules/settings/settings.service";
import { AuditService } from "@/modules/audit/audit.service";
import { InvoiceDeliveryService } from "./invoice-delivery.service";
import { InvoicesService } from "./invoices.service";
import type { CreateInvoiceDto, PreviewInvoiceDto } from "./dto/invoice.dto";
import type { Party } from "./invoice.types";

/** Turns a staff "new invoice" request into an issued invoice (normalise party, link customer, convert ₹ → paise). */
@Injectable()
export class InvoiceComposerService {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly customers: CustomersService,
    private readonly settings: SettingsService,
    private readonly delivery: InvoiceDeliveryService,
    private readonly audit: AuditService,
  ) {}

  /** GST breakdown for the staff form, computed by the same engine that will issue the invoice. Nothing is saved. */
  async preview(dto: PreviewInvoiceDto) {
    const [rules, settings] = await Promise.all([this.settings.getTaxRules(), this.settings.getSettings()]);
    for (const item of dto.items) {
      if (!rules.some((r) => r.code === item.ruleCode)) throw new ValidationAppException(`Unknown tax rule ${item.ruleCode}`);
    }
    return computeInvoice(
      dto.items.map((i) => ({ description: i.description || "Item", ruleCode: i.ruleCode, qty: i.qty, unitPricePaise: paise(i.unitPrice), tariffPaise: i.tariff ? paise(i.tariff) : undefined })),
      {
        rules,
        hotelStateCode: settings.stateCode,
        customerStateCode: stateCodeOf(dto.partyGstin?.toUpperCase()),
        discount: dto.discount ? (dto.discount.type === "percent" ? { type: "percent", value: dto.discount.value } : { type: "flat", valuePaise: paise(dto.discount.value) }) : null,
      },
    );
  }

  async compose(dto: CreateInvoiceDto, actorEmail: string) {
    const party: Party = {
      ...dto.party,
      mobile: dto.party.mobile || undefined,
      company: dto.party.company || undefined,
      gstin: dto.party.gstin || undefined,
      address: dto.party.address || undefined,
    };
    if (party.type === "B2C") {
      party.gstin = undefined;
      party.company = undefined;
    }
    if (party.type === "B2B" && party.gstin && !party.customerId) {
      party.customerId = await this.customers.upsertForGstin(party, party.gstin.slice(0, 2));
    }

    const rules = await this.settings.getTaxRules();
    for (const item of dto.items) {
      if (!rules.some((r) => r.code === item.ruleCode)) throw new ValidationAppException(`Unknown tax rule ${item.ruleCode}`);
    }

    const { invoice, ledger } = await this.invoices.create({
      party,
      items: dto.items.map((i) => ({
        description: i.description,
        ruleCode: i.ruleCode,
        qty: i.qty,
        unitPricePaise: paise(i.unitPrice),
        tariffPaise: i.tariff ? paise(i.tariff) : undefined,
      })),
      discount: dto.discount ? (dto.discount.type === "percent" ? { type: "percent", value: dto.discount.value } : { type: "flat", valuePaise: paise(dto.discount.value) }) : null,
      discountNote: dto.discountNote || (dto.discount ? (dto.discount.type === "percent" ? `${dto.discount.value}%` : "flat") : undefined),
      dueDate: dto.dueDate,
      notes: dto.notes || undefined,
      bookingRef: dto.bookingRef,
      createdBy: actorEmail,
    });
    await this.audit.record(actorEmail, "invoice.create", invoice.number, { total: invoice.totals.grandTotalPaise, type: party.type });
    if (dto.sendEmail) await this.delivery.emailInvoice(invoice.id, invoice.party.email);
    return { invoice, ledger };
  }
}

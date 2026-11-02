import { Injectable } from "@nestjs/common";
import { AppConfig } from "@/config/app-config.service";
import { PrismaService } from "@/database/prisma.service";
import { DEFAULT_TAX_RULES, type TaxRule } from "@/domain/tax";

export interface HotelSettings {
  name: string;
  gstin: string;
  stateCode: string;
  address: string;
  phone: string;
  email: string;
  bankName?: string;
  bankAccount?: string;
  bankIfsc?: string;
  upiId?: string;
  defaultCreditDays: number;
}

/** Business settings (seller identity on invoices) and GST tax rules. Both are single config items. */
@Injectable()
export class SettingsService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: AppConfig,
  ) {}

  private defaults(): HotelSettings {
    const e = this.config.env;
    return { name: e.HOTEL_NAME, gstin: e.HOTEL_GSTIN, stateCode: e.HOTEL_STATE_CODE, address: e.HOTEL_ADDRESS, phone: e.HOTEL_PHONE, email: e.HOTEL_EMAIL, defaultCreditDays: 7 };
  }

  async getSettings(): Promise<HotelSettings> {
    const item = await this.db.get<{ value: Partial<HotelSettings> }>("CONFIG", "SETTINGS");
    return { ...this.defaults(), ...(item?.value ?? {}) };
  }

  async saveSettings(patch: Partial<HotelSettings>) {
    const cur = await this.getSettings();
    await this.db.put({ pk: "CONFIG", sk: "SETTINGS", value: { ...cur, ...patch }, updatedAt: new Date().toISOString() });
  }

  async getTaxRules(): Promise<TaxRule[]> {
    const item = await this.db.get<{ value: TaxRule[] }>("CONFIG", "TAXRULES");
    if (!item) return DEFAULT_TAX_RULES;
    // merge so newly-added default rules appear without wiping edits
    const byCode = new Map(item.value.map((r) => [r.code, r]));
    return [...DEFAULT_TAX_RULES.map((d) => byCode.get(d.code) ?? d), ...item.value.filter((r) => !DEFAULT_TAX_RULES.some((d) => d.code === r.code))];
  }

  async saveTaxRules(rules: TaxRule[]) {
    await this.db.put({ pk: "CONFIG", sk: "TAXRULES", value: rules, updatedAt: new Date().toISOString() });
  }
}

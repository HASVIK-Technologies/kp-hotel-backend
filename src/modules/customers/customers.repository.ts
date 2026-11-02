import { Injectable } from "@nestjs/common";
import { PrismaService, isConditionFailed } from "@/database/prisma.service";
import { stripKeys } from "@/common/utils/storage-item.util";
import type { Customer } from "./customer.types";

@Injectable()
export class CustomersRepository {
  constructor(private readonly db: PrismaService) {}

  async list(): Promise<Customer[]> {
    return (await this.db.listByType("CUSTOMER", { limit: 1000 })).map((c) => stripKeys<Customer>(c));
  }

  async find(id: string): Promise<Customer | undefined> {
    const it = await this.db.get(`CUSTOMER#${id}`);
    return it ? stripKeys<Customer>(it) : undefined;
  }

  async customerIdForGstin(gstin: string): Promise<string | undefined> {
    return (await this.db.get<{ customerId: string }>(`GSTIN#${gstin}`))?.customerId;
  }

  /** @returns false if the GSTIN is already registered. */
  async claimGstin(gstin: string, customerId: string): Promise<boolean> {
    try {
      await this.db.put({ pk: `GSTIN#${gstin}`, sk: "META", customerId }, { ifNotExists: true });
      return true;
    } catch (e) {
      if (isConditionFailed(e)) return false;
      throw e;
    }
  }

  async insert(c: Customer) {
    await this.db.put({ pk: `CUSTOMER#${c.id}`, sk: "META", gsi1pk: "CUSTOMER", gsi1sk: c.createdAt, ...c });
  }

  async updateContact(c: Customer) {
    await this.db.update(
      { pk: `CUSTOMER#${c.id}`, sk: "META" },
      { set: { name: c.name, company: c.company, email: c.email, mobile: c.mobile ?? "", address: c.address ?? "", creditDays: c.creditDays } },
    );
  }
}

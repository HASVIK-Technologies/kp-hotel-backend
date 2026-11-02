import { Injectable } from "@nestjs/common";
import { DuplicateException, NotFoundAppException } from "@/common/errors/app.exception";
import { CustomersRepository } from "./customers.repository";
import type { Customer } from "./customer.types";

export type NewCustomer = Omit<Customer, "id" | "createdAt" | "stateCode">;
export type CustomerPatch = Partial<Pick<Customer, "name" | "company" | "email" | "mobile" | "address" | "creditDays">>;

@Injectable()
export class CustomersService {
  constructor(private readonly repo: CustomersRepository) {}

  list() {
    return this.repo.list();
  }

  async get(id: string): Promise<Customer> {
    const c = await this.repo.find(id);
    if (!c) throw new NotFoundAppException("Customer");
    return c;
  }

  async create(input: NewCustomer): Promise<Customer> {
    const gstin = input.gstin.toUpperCase();
    const customer: Customer = { ...input, gstin, id: `cus_${gstin.toLowerCase()}`, stateCode: gstin.slice(0, 2), createdAt: new Date().toISOString() };
    if (!(await this.repo.claimGstin(gstin, customer.id))) throw new DuplicateException("A customer with this GSTIN already exists");
    await this.repo.insert(customer);
    return customer;
  }

  /** GSTIN is the identity and is immutable; contact + credit terms can change. Customers are never deleted. */
  async update(id: string, patch: CustomerPatch): Promise<Customer> {
    const cur = await this.get(id);
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const next = { ...cur, ...defined } as Customer;
    await this.repo.updateContact(next);
    return next;
  }

  /** Find-or-create the B2B customer record for a GSTIN (used by bookings and invoices). */
  async upsertForGstin(
    party: { name: string; email: string; mobile?: string; company?: string; gstin?: string },
    stateCode: string,
  ): Promise<string | undefined> {
    if (!party.gstin) return undefined;
    const gstin = party.gstin.toUpperCase();
    const existing = await this.repo.customerIdForGstin(gstin);
    if (existing) return existing;
    const id = `cus_${gstin.toLowerCase()}`;
    const c: Customer = { id, name: party.name, company: party.company || party.name, gstin, stateCode, email: party.email, mobile: party.mobile, creditDays: 7, createdAt: new Date().toISOString() };
    try {
      await this.repo.claimGstin(gstin, id);
      await this.repo.insert(c);
    } catch {
      /* concurrent create is fine */
    }
    return id;
  }
}

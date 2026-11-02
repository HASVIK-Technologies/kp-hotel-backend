import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { StaffGuard } from "@/modules/auth/guards/staff.guard";
import { CustomersService } from "@/modules/customers/customers.service";
import { InvoicesService } from "./invoices.service";

/** A customer's account statement. Lives with invoices because it is built from their ledgers. */
@ApiTags("Admin · Customers (B2B)")
@ApiCookieAuth()
@UseGuards(StaffGuard)
@Controller("admin/customers")
export class CustomerStatementController {
  constructor(
    private readonly customers: CustomersService,
    private readonly invoices: InvoicesService,
  ) {}

  @Get(":id")
  @ApiOperation({ summary: "Customer with all their invoices and total outstanding balance." })
  async statement(@Param("id") id: string) {
    const customer = await this.customers.get(id);
    const rows = (await this.invoices.list(2000)).filter((r) => r.invoice.party.customerId === customer.id);
    return {
      customer,
      invoices: rows,
      outstandingPaise: rows.reduce((s, r) => s + (r.invoice.docType === "TAX_INVOICE" ? r.ledger.balancePaise : 0), 0),
    };
  }
}

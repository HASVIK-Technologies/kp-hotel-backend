import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import type { SessionUser } from "@/common/types/session-user";
import { StaffGuard } from "@/modules/auth/guards/staff.guard";
import { AuditService } from "@/modules/audit/audit.service";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto, UpdateCustomerDto } from "./dto/customer.dto";

@ApiTags("Admin · Customers (B2B)")
@ApiCookieAuth()
@UseGuards(StaffGuard)
@Controller("admin/customers")
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: "All B2B customers (companies with a GSTIN)." })
  async list() {
    return { customers: await this.customers.list() };
  }

  @Post()
  @RequirePermission("customer:manage")
  @ApiOperation({ summary: "Create a B2B customer. 409 DUPLICATE if the GSTIN already exists." })
  async create(@Body() body: CreateCustomerDto, @CurrentUser() user: SessionUser) {
    const customer = await this.customers.create({ ...body, mobile: body.mobile || undefined, address: body.address || undefined });
    await this.audit.record(user.email, "customer.create", customer.id);
    return { customer };
  }

  @Patch(":id")
  @HttpCode(200)
  @RequirePermission("customer:manage")
  @ApiOperation({ summary: "Update contact details / credit days (GSTIN is immutable)." })
  async update(@Param("id") id: string, @Body() body: UpdateCustomerDto, @CurrentUser() user: SessionUser) {
    const customer = await this.customers.update(id, body);
    await this.audit.record(user.email, "customer.update", customer.id);
    return { customer };
  }
}

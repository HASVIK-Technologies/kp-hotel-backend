import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { NotFoundAppException } from "@/common/errors/app.exception";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import type { SessionUser } from "@/common/types/session-user";
import { StaffGuard } from "@/modules/auth/guards/staff.guard";
import { AuditService } from "@/modules/audit/audit.service";
import { InvoicesService } from "@/modules/invoices/invoices.service";
import { toPublicBooking } from "./booking.mapper";
import { BookingsService } from "./bookings.service";
import { BookingStatusDto, CreateStaffBookingDto } from "./dto/booking.dto";

@ApiTags("Admin · Bookings")
@ApiCookieAuth()
@UseGuards(StaffGuard)
@Controller("admin/bookings")
export class AdminBookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly invoices: InvoicesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Latest 300 bookings, newest first." })
  async list() {
    return { bookings: await this.bookings.list() };
  }

  @Get(":ref")
  @ApiOperation({ summary: "Booking with its invoice detail." })
  async get(@Param("ref") ref: string) {
    const b = await this.bookings.find(ref);
    if (!b) throw new NotFoundAppException("Booking");
    return { booking: toPublicBooking(b), invoice: b.invoiceId ? await this.invoices.detail(b.invoiceId) : null };
  }

  @Post()
  @RequirePermission("booking:manage")
  @ApiOperation({ summary: "Create a phone / walk-in / OTA booking. Confirmed and invoiced immediately." })
  async create(@Body() body: CreateStaffBookingDto, @CurrentUser() user: SessionUser) {
    const r = await this.bookings.create({
      ...body,
      promo: body.promo || undefined,
      guest: { ...body.guest, company: body.guest.company || undefined, gstin: body.guest.gstin || undefined, requests: body.guest.requests || undefined },
      payMode: "staff",
      createdBy: user.email,
    });
    await this.audit.record(user.email, "booking.create", r.booking.ref, { source: body.source });
    return { booking: r.booking, invoice: r.invoice ? { id: r.invoice.id, number: r.invoice.number } : null };
  }

  @Post(":ref/status")
  @HttpCode(200)
  @RequirePermission("booking:manage")
  @ApiOperation({ summary: "Check-in, check-out or mark no-show." })
  async setStatus(@Param("ref") ref: string, @Body() body: BookingStatusDto, @CurrentUser() user: SessionUser) {
    return { booking: await this.bookings.setStatus(ref, body.status, user.email) };
  }

  @Post(":ref/cancel")
  @HttpCode(200)
  @RequirePermission("booking:manage")
  @ApiOperation({ summary: "Cancel a booking on the guest's behalf." })
  cancel(@Param("ref") ref: string, @CurrentUser() user: SessionUser) {
    return this.bookings.cancel(ref, user.email, { force: true });
  }
}

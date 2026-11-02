import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { AppConfig } from "@/config/app-config.service";
import { NotFoundAppException } from "@/common/errors/app.exception";
import { TokensService } from "@/modules/auth/tokens.service";
import { InvoiceDeliveryService } from "@/modules/invoices/invoice-delivery.service";
import { InvoicesService } from "@/modules/invoices/invoices.service";
import { toPublicBooking } from "./booking.mapper";
import { BookingsService } from "./bookings.service";
import { CreateBookingDto } from "./dto/booking.dto";
import type { StoredBooking } from "./bookings.repository";

/** Guest-facing booking endpoints. Access to an existing booking = signed token (`t`) OR the booking email. */
@ApiTags("Bookings (public)")
@Controller("bookings")
export class BookingsController {
  constructor(
    private readonly config: AppConfig,
    private readonly bookings: BookingsService,
    private readonly invoices: InvoicesService,
    private readonly delivery: InvoiceDeliveryService,
    private readonly tokens: TokensService,
  ) {}

  /** Returns the booking only if the caller proves access; otherwise 404 (never reveals that a booking exists). */
  private async authorise(ref: string, t?: string, email?: string): Promise<StoredBooking> {
    const b = await this.bookings.find(ref);
    if (!b) throw new NotFoundAppException("Booking");
    const ok = (t && (await this.tokens.verifyLink(t, "booking", ref))) || (email && email.trim().toLowerCase() === b.guest.email.toLowerCase());
    if (!ok) throw new NotFoundAppException("Booking");
    return b;
  }

  @Post()
  @ApiOperation({ summary: "Create a booking. payMode=online returns a gateway session; payMode=hotel confirms immediately." })
  async create(@Body() body: CreateBookingDto) {
    const r = await this.bookings.create({
      ...body,
      promo: body.promo || undefined,
      guest: { ...body.guest, company: body.guest.company || undefined, gstin: body.guest.gstin || undefined, requests: body.guest.requests || undefined },
    });
    const accessToken = await this.tokens.signLink("booking", r.booking.ref, 60);
    return { booking: r.booking, invoice: r.invoice ? { id: r.invoice.id, number: r.invoice.number } : null, payment: r.payment, accessToken };
  }

  @Get(":ref")
  @ApiQuery({ name: "t", required: false, description: "accessToken returned when the booking was created" })
  @ApiQuery({ name: "email", required: false, description: "Booking email (alternative to t)" })
  @ApiOperation({ summary: "Look up a booking with its invoice summary." })
  async get(@Param("ref") ref: string, @Query("t") t?: string, @Query("email") email?: string) {
    const b = await this.authorise(ref.toUpperCase(), t, email);
    let invoice: null | { id: string; number: string; balancePaise: number; status: string; pdfUrl: string; payUrl?: string } = null;
    if (b.invoiceId) {
      const [inv, led] = await Promise.all([this.invoices.get(b.invoiceId), this.invoices.getLedger(b.invoiceId)]);
      if (inv && led) {
        invoice = {
          id: inv.id,
          number: inv.number,
          balancePaise: led.balancePaise,
          status: led.status,
          pdfUrl: await this.delivery.pdfUrl(inv.id),
          payUrl: led.balancePaise > 0 ? await this.delivery.payUrl(inv.id) : undefined,
        };
      }
    }
    return { booking: toPublicBooking(b), invoice };
  }

  @Post(":ref/cancel")
  @HttpCode(200)
  @ApiQuery({ name: "t", required: false })
  @ApiQuery({ name: "email", required: false })
  @ApiOperation({ summary: "Cancel a booking. Refund applies for refundable plans ≥ 48 h before check-in." })
  async cancel(@Param("ref") ref: string, @Query("t") t?: string, @Query("email") email?: string) {
    const b = await this.authorise(ref.toUpperCase(), t, email);
    const r = await this.bookings.cancel(b.ref, `guest:${b.guest.email}`, { guestEmail: b.guest.email });
    return { booking: r.booking, refundable: r.refundable, message: r.note };
  }

  @Post(":ref/pay")
  @HttpCode(200)
  @ApiQuery({ name: "t", required: false })
  @ApiQuery({ name: "email", required: false })
  @ApiOperation({ summary: "Retry the online payment for a booking that is still on hold." })
  async pay(@Param("ref") ref: string, @Query("t") t?: string, @Query("email") email?: string) {
    const b = await this.authorise(ref.toUpperCase(), t, email);
    return { payment: await this.bookings.startOnlinePayment(b.ref) };
  }
}

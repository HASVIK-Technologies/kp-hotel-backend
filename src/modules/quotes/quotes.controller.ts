import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { NotFoundAppException } from "@/common/errors/app.exception";
import { buildQuote } from "@/domain/pricing/pricing";
import { InventoryService } from "@/modules/rooms/inventory.service";
import { RoomsService } from "@/modules/rooms/rooms.service";
import { SettingsService } from "@/modules/settings/settings.service";
import { QuoteDto } from "./dto/quote.dto";

@ApiTags("Quotes (public)")
@Controller("quotes")
export class QuotesController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly settings: SettingsService,
    private readonly inventory: InventoryService,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: "Authoritative price + availability for a stay. The website shows exactly this number." })
  async quote(@Body() b: QuoteDto) {
    const room = await this.rooms.find(b.roomSlug);
    if (!room) throw new NotFoundAppException("Room");
    const rules = await this.settings.getTaxRules();
    const { invoiceLines, ...quote } = buildQuote(
      { room: { name: room.name, price: room.price }, checkIn: b.checkIn, checkOut: b.checkOut, rooms: b.rooms, ratePlan: b.ratePlan, addonIds: b.addonIds, promo: b.promo },
      rules,
    );
    const available = await this.inventory.availableRooms(b.roomSlug, b.checkIn, b.checkOut);
    return { quote, available, soldOut: available < b.rooms };
  }
}

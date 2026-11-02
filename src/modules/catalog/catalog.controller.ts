import { Controller, Get, Header } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ADDONS, PROMOS, RATE_PLANS } from "@/domain/pricing/catalog";

@ApiTags("Catalog (public)")
@Controller("catalog")
export class CatalogController {
  @Get()
  @Header("Cache-Control", "public, max-age=300")
  @ApiOperation({ summary: "Rate plans, paid add-ons and promo codes (percent off the room charge)." })
  catalog() {
    return {
      ratePlans: RATE_PLANS,
      addons: ADDONS,
      promos: Object.fromEntries(Object.entries(PROMOS).map(([code, p]) => [code, { label: p.label, percent: p.percent }])),
    };
  }
}

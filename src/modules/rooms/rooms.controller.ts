import { Controller, Get, Header, Param } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { addDaysIso } from "@/common/utils/time.util";
import { istToday } from "@/common/utils/time.util";
import { InventoryService } from "./inventory.service";
import { RoomsService } from "./rooms.service";
import type { PublicRoom, Room } from "./room.types";

/** Public, cacheable room catalogue for the website. */
@ApiTags("Rooms (public)")
@Controller("rooms")
export class RoomsController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly inventory: InventoryService,
  ) {}

  private async withAvailability(room: Room): Promise<PublicRoom> {
    const today = istToday();
    const roomsLeft = room.active ? await this.inventory.availableRooms(room.slug, today, addDaysIso(new Date(`${today}T00:00:00Z`), 1)) : 0;
    return { ...room, roomsLeft };
  }

  @Get()
  @Header("Cache-Control", "public, max-age=30")
  @ApiOperation({ summary: "All room categories, in display order. Inactive rooms are returned with active=false (shown as sold out)." })
  async list() {
    const rooms = await this.rooms.list();
    return { rooms: await Promise.all(rooms.map((r) => this.withAvailability(r))) };
  }

  @Get(":slug")
  @Header("Cache-Control", "public, max-age=30")
  @ApiOperation({ summary: "One room category by slug." })
  async get(@Param("slug") slug: string) {
    return { room: await this.withAvailability(await this.rooms.get(slug)) };
  }
}

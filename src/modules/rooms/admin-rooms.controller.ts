import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import type { SessionUser } from "@/common/types/session-user";
import { StaffGuard } from "@/modules/auth/guards/staff.guard";
import { AuditService } from "@/modules/audit/audit.service";
import { CreateRoomDto, UpdateRoomDto } from "./dto/room.dto";
import { RoomsService } from "./rooms.service";

@ApiTags("Admin · Rooms & rates")
@ApiCookieAuth()
@UseGuards(StaffGuard)
@Controller("admin/rooms")
export class AdminRoomsController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: "All room categories with rates and inventory." })
  async list() {
    return { rooms: await this.rooms.list() };
  }

  @Get(":slug")
  @ApiOperation({ summary: "One room category (for the edit form)." })
  async get(@Param("slug") slug: string) {
    return { room: await this.rooms.get(slug) };
  }

  @Post()
  @RequirePermission("rooms:edit")
  @ApiOperation({ summary: "Add a new room category. It appears on the public website within ~30 s." })
  async create(@Body() body: CreateRoomDto, @CurrentUser() user: SessionUser) {
    const room = await this.rooms.create(body);
    await this.audit.record(user.email, "room.create", room.slug, { price: room.price, inventory: room.inventory });
    return { room };
  }

  @Patch(":slug")
  @HttpCode(200)
  @RequirePermission("rooms:edit")
  @ApiOperation({ summary: "Update any field of a room category (rate, inventory, content, active flag)." })
  async update(@Param("slug") slug: string, @Body() body: UpdateRoomDto, @CurrentUser() user: SessionUser) {
    const room = await this.rooms.update(slug, body);
    await this.audit.record(user.email, "room.update", slug, body as Record<string, unknown>);
    return { room };
  }
}

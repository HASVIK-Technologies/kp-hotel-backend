import { Module } from "@nestjs/common";
import { AdminRoomsController } from "./admin-rooms.controller";
import { InventoryService } from "./inventory.service";
import { RoomsController } from "./rooms.controller";
import { RoomsRepository } from "./rooms.repository";
import { RoomsService } from "./rooms.service";

@Module({
  controllers: [RoomsController, AdminRoomsController],
  providers: [RoomsRepository, RoomsService, InventoryService],
  exports: [RoomsRepository, RoomsService, InventoryService],
})
export class RoomsModule {}

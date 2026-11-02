import { Module } from "@nestjs/common";
import { RoomsModule } from "@/modules/rooms/rooms.module";
import { QuotesController } from "./quotes.controller";

@Module({ imports: [RoomsModule], controllers: [QuotesController] })
export class QuotesModule {}

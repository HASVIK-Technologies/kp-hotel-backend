import { Module } from "@nestjs/common";
import { RoomsModule } from "../rooms/rooms.module";
import { QuotesController } from "./quotes.controller";

@Module({ imports: [RoomsModule], controllers: [QuotesController] })
export class QuotesModule {}

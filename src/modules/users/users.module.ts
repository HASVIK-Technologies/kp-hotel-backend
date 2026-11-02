import { Module } from "@nestjs/common";
import { PasswordService } from "./password.service";
import { UsersController } from "./users.controller";
import { UsersRepository } from "./users.repository";
import { UsersService } from "./users.service";

@Module({
  controllers: [UsersController],
  providers: [UsersRepository, PasswordService, UsersService],
  exports: [UsersRepository, PasswordService, UsersService],
})
export class UsersModule {}

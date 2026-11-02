import { Global, Module } from "@nestjs/common";
import { UsersModule } from "@/modules/users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TokensService } from "./tokens.service";
import { StaffGuard } from "./guards/staff.guard";

/** Global so any feature module can use `@UseGuards(StaffGuard)` and sign guest links without re-importing. */
@Global()
@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, TokensService, StaffGuard],
  exports: [TokensService, StaffGuard],
})
export class AuthModule {}

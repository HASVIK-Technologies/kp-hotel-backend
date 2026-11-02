import { Injectable } from "@nestjs/common";
import type { Role } from "@/common/constants/permissions";
import { PasswordService } from "./password.service";
import { UsersRepository } from "./users.repository";

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly passwords: PasswordService,
  ) {}

  list() {
    return this.repo.list();
  }

  find(email: string) {
    return this.repo.find(email);
  }

  async create(u: { email: string; name: string; role: Role; password: string }) {
    await this.repo.insert({ email: u.email, name: u.name, role: u.role, passwordHash: await this.passwords.hash(u.password) });
  }

  setActive(email: string, active: boolean) {
    return this.repo.setActive(email, active);
  }

  async resetPassword(email: string, password: string) {
    await this.repo.setPassword(email, await this.passwords.hash(password));
  }
}

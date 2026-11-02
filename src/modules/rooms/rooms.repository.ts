import { Injectable } from "@nestjs/common";
import { PrismaService, isConditionFailed } from "@/database/prisma.service";
import { stripKeys } from "@/common/utils/storage-item.util";
import type { Room } from "./room.types";

/** Persistence for room categories. Listing order = `sortOrder`, then creation. */
@Injectable()
export class RoomsRepository {
  constructor(private readonly db: PrismaService) {}

  async find(slug: string): Promise<Room | undefined> {
    const it = await this.db.get(`ROOM#${slug}`);
    return it ? stripKeys<Room>(it) : undefined;
  }

  async list(): Promise<Room[]> {
    const rows = await this.db.listByType("ROOM", { newestFirst: false });
    return rows.map((r) => stripKeys<Room>(r));
  }

  /** @returns false when the slug already exists. */
  async insert(room: Room): Promise<boolean> {
    try {
      await this.db.put({ pk: `ROOM#${room.slug}`, sk: "META", ...this.indexKeys(room), ...room }, { ifNotExists: true });
      return true;
    } catch (e) {
      if (isConditionFailed(e)) return false;
      throw e;
    }
  }

  async save(room: Room) {
    await this.db.put({ pk: `ROOM#${room.slug}`, sk: "META", ...this.indexKeys(room), ...room });
  }

  private indexKeys(room: Room) {
    return { gsi1pk: "ROOM", gsi1sk: `${String(room.sortOrder).padStart(5, "0")}#${room.slug}` };
  }
}

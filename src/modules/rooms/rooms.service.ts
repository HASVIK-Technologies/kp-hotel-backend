import { Injectable } from "@nestjs/common";
import { DuplicateException, NotFoundAppException } from "@/common/errors/app.exception";
import { RoomsRepository } from "./rooms.repository";
import type { Room } from "./room.types";
import type { CreateRoomDto, UpdateRoomDto } from "./dto/room.dto";

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

@Injectable()
export class RoomsService {
  constructor(private readonly repo: RoomsRepository) {}

  list() {
    return this.repo.list();
  }

  async get(slug: string): Promise<Room> {
    const room = await this.repo.find(slug);
    if (!room) throw new NotFoundAppException("Room");
    return room;
  }

  find(slug: string) {
    return this.repo.find(slug);
  }

  /** Creates a room category. The URL slug is derived from the name and made unique (`-2`, `-3`, …). */
  async create(input: CreateRoomDto): Promise<Room> {
    const now = new Date().toISOString();
    const base = slugify(input.name) || "room";
    const sortOrder = input.sortOrder ?? (await this.repo.list()).length + 1;
    for (let i = 1; i <= 20; i++) {
      const slug = i === 1 ? base : `${base}-${i}`;
      const room: Room = { ...input, slug, sortOrder, rating: 0, reviews: 0, createdAt: now, updatedAt: now };
      if (await this.repo.insert(room)) return room;
    }
    throw new DuplicateException("A room with a very similar name already exists");
  }

  async update(slug: string, patch: UpdateRoomDto): Promise<Room> {
    const cur = await this.get(slug);
    const next: Room = { ...cur, ...patch, slug, updatedAt: new Date().toISOString() };
    await this.repo.save(next);
    return next;
  }
}

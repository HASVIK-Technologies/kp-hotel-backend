import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

export type OrderTarget = { kind: "booking"; ref: string } | { kind: "invoice"; id: string };
export interface OrderMapping {
  target: OrderTarget;
  amountPaise: number;
  createdAt: string;
}

/** Maps a gateway order id to what it pays for (a booking or an invoice). */
@Injectable()
export class PaymentOrdersRepository {
  constructor(private readonly db: PrismaService) {}

  async save(orderId: string, target: OrderTarget, amountPaise: number) {
    await this.db.put({ pk: `CFORDER#${orderId}`, sk: "META", target, amountPaise, createdAt: new Date().toISOString() });
  }

  find(orderId: string) {
    return this.db.get<OrderMapping>(`CFORDER#${orderId}`);
  }
}

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { AppConfig } from "@/config/app-config.service";

export type Item = Record<string, unknown> & { pk: string; sk: string };
export type ItemKey = Pick<Item, "pk" | "sk">;

export interface ItemCondition {
  exists?: boolean;
  equals?: Record<string, unknown>;
  absent?: string[];
  lessThan?: Record<string, string>;
  lessThanOrEqual?: Record<string, number>;
  greaterThanOrEqual?: Record<string, number>;
  any?: ItemCondition[];
}

export interface ItemMutation {
  set?: Record<string, unknown>;
  remove?: string[];
  increment?: Record<string, number>;
  conditions?: ItemCondition;
}

export type DatabaseOperation =
  | { put: { item: Item; ifNotExists?: boolean } }
  | { update: { key: ItemKey; mutation: ItemMutation } };

type TransactionClient = Prisma.TransactionClient;

export const isConditionFailed = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { name?: string }).name === "ConditionalCheckFailedException";

const cleanJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const conditionSql = (condition: ItemCondition): Prisma.Sql[] => {
  const parts: Prisma.Sql[] = [];
  if (condition.exists === true) parts.push(Prisma.sql`TRUE`);
  if (condition.exists === false) parts.push(Prisma.sql`FALSE`);
  for (const [field, value] of Object.entries(condition.equals ?? {})) {
    parts.push(Prisma.sql`data -> ${field} = ${JSON.stringify(value)}::jsonb`);
  }
  for (const field of condition.absent ?? []) parts.push(Prisma.sql`NOT (data ? ${field})`);
  for (const [field, value] of Object.entries(condition.lessThan ?? {})) {
    parts.push(Prisma.sql`data ->> ${field} < ${value}`);
  }
  for (const [field, value] of Object.entries(condition.lessThanOrEqual ?? {})) {
    parts.push(Prisma.sql`COALESCE((data ->> ${field})::numeric, 0) <= ${value}`);
  }
  for (const [field, value] of Object.entries(condition.greaterThanOrEqual ?? {})) {
    parts.push(Prisma.sql`COALESCE((data ->> ${field})::numeric, 0) >= ${value}`);
  }
  if (condition.any?.length) {
    const alternatives = condition.any.map((item) => Prisma.sql`(${Prisma.join(conditionSql(item), " AND ")})`);
    parts.push(Prisma.sql`(${Prisma.join(alternatives, " OR ")})`);
  }
  return parts;
};

const conditionalFailure = () => {
  const error = new Error("Conditional database write failed");
  error.name = "ConditionalCheckFailedException";
  return error;
};

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfig) {
    super({ datasources: { db: { url: config.env.DATABASE_URL } } });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log("Connected to PostgreSQL");
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async get<T = Item>(pk: string, sk = "META"): Promise<T | undefined> {
    const row = await this.storedItem.findUnique({ where: { pk_sk: { pk, sk } }, select: { data: true } });
    return row?.data as T | undefined;
  }

  async put(item: Item, options: { ifNotExists?: boolean } = {}) {
    return this.putWith(this, item, options.ifNotExists ?? false);
  }

  async queryPartition<T = Item>(pk: string, options: { skPrefix?: string; limit?: number; forward?: boolean } = {}): Promise<T[]> {
    const rows = await this.storedItem.findMany({
      where: { pk, ...(options.skPrefix ? { sk: { startsWith: options.skPrefix } } : {}) },
      orderBy: { sk: options.forward === false ? "desc" : "asc" },
      ...(options.limit ? { take: options.limit } : {}),
      select: { data: true },
    });
    return rows.map(({ data }) => data as T);
  }

  async queryRange<T = Item>(pk: string, skFrom: string, skTo: string): Promise<T[]> {
    const rows = await this.storedItem.findMany({
      where: { pk, sk: { gte: skFrom, lte: skTo } },
      orderBy: { sk: "asc" },
      select: { data: true },
    });
    return rows.map(({ data }) => data as T);
  }

  async listByType<T = Item>(type: string, options: { limit?: number; newestFirst?: boolean } = {}): Promise<T[]> {
    const rows = await this.storedItem.findMany({
      where: { typeKey: type },
      orderBy: { typeSort: options.newestFirst === false ? "asc" : "desc" },
      ...(options.limit ? { take: options.limit } : {}),
      select: { data: true },
    });
    return rows.map(({ data }) => data as T);
  }

  async listByRelation<T = Item>(relation: string, options: { beforeSk?: string; limit?: number } = {}): Promise<T[]> {
    const rows = await this.storedItem.findMany({
      where: { relationKey: relation, ...(options.beforeSk ? { relationSort: { lte: options.beforeSk } } : {}) },
      orderBy: { relationSort: "asc" },
      ...(options.limit ? { take: options.limit } : {}),
      select: { data: true },
    });
    return rows.map(({ data }) => data as T);
  }

  async update(key: ItemKey, mutation: ItemMutation): Promise<void> {
    await this.updateWith(this, key, mutation);
  }

  async transaction(operations: DatabaseOperation[]): Promise<void> {
    await this.$transaction(async (transaction) => {
      for (const operation of operations) {
        if ("put" in operation) await this.putWith(transaction, operation.put.item, operation.put.ifNotExists ?? false);
        else await this.updateWith(transaction, operation.update.key, operation.update.mutation);
      }
    });
  }

  async nextCounter(name: string): Promise<number> {
    const counter = await this.counter.upsert({
      where: { name },
      create: { name, value: 1 },
      update: { value: { increment: 1 } },
    });
    return counter.value;
  }

  private async putWith(client: TransactionClient | PrismaService, item: Item, ifNotExists: boolean) {
    const data = cleanJson(item);
    const index = this.indexFields(item);
    if (ifNotExists) {
      try {
        await client.storedItem.create({ data: { pk: item.pk, sk: item.sk, ...index, data } });
      } catch (error) {
        if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") throw conditionalFailure();
        throw error;
      }
      return;
    }
    await client.storedItem.upsert({
      where: { pk_sk: { pk: item.pk, sk: item.sk } },
      create: { pk: item.pk, sk: item.sk, ...index, data },
      update: { ...index, data },
    });
  }

  private async updateWith(client: TransactionClient | PrismaService, key: ItemKey, mutation: ItemMutation) {
    const conditions = conditionSql(mutation.conditions ?? {});
    const updates: Prisma.Sql[] = [];
    if (mutation.set && Object.keys(mutation.set).length) updates.push(Prisma.sql`data || ${JSON.stringify(mutation.set)}::jsonb`);
    for (const [field, amount] of Object.entries(mutation.increment ?? {})) {
      updates.push(Prisma.sql`jsonb_build_object(${field}, COALESCE((data ->> ${field})::numeric, 0) + ${amount})`);
    }
    let value: Prisma.Sql = updates.length ? Prisma.join(updates, " || ") : Prisma.sql`data`;
    if (mutation.remove?.length) value = Prisma.sql`(${value}) - ARRAY[${Prisma.join(mutation.remove)}]::text[]`;
    const condition = conditions.length ? Prisma.sql` AND ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
    const indexAssignments: Prisma.Sql[] = [];
    if (typeof mutation.set?.gsi1pk === "string") indexAssignments.push(Prisma.sql`"typeKey" = ${mutation.set.gsi1pk}`);
    if (typeof mutation.set?.gsi1sk === "string") indexAssignments.push(Prisma.sql`"typeSort" = ${mutation.set.gsi1sk}`);
    if (typeof mutation.set?.gsi2pk === "string") indexAssignments.push(Prisma.sql`"relationKey" = ${mutation.set.gsi2pk}`);
    if (typeof mutation.set?.gsi2sk === "string") indexAssignments.push(Prisma.sql`"relationSort" = ${mutation.set.gsi2sk}`);

    if (Object.keys(mutation.increment ?? {}).length > 0) {
      const initialData = cleanJson({ pk: key.pk, sk: key.sk, ...(mutation.set ?? {}) });
      const increments = cleanJson(mutation.increment);
      const initialConditions = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
      const onConflict = [
        Prisma.sql`data = ${value}`,
        ...indexAssignments,
      ];
      const conflictCondition = conditions.length ? Prisma.sql` WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
      const count = await client.$executeRaw(
        Prisma.sql`INSERT INTO "StoredItem" (pk, sk, data)
          SELECT ${key.pk}, ${key.sk}, current.data || ${increments}::jsonb
          FROM (SELECT ${initialData}::jsonb AS data) AS current
          ${initialConditions}
          ON CONFLICT (pk, sk) DO UPDATE SET ${Prisma.join(onConflict, ", ")}${conflictCondition}`,
      );
      if (count === 0) throw conditionalFailure();
      return;
    }

    const assignments = [Prisma.sql`data = ${value}`, ...indexAssignments];
    const count = await client.$executeRaw(
      Prisma.sql`UPDATE "StoredItem" SET ${Prisma.join(assignments, ", ")} WHERE pk = ${key.pk} AND sk = ${key.sk}${condition}`,
    );
    if (count === 0) throw conditionalFailure();
  }

  private indexFields(item: Item) {
    return {
      typeKey: typeof item.gsi1pk === "string" ? item.gsi1pk : null,
      typeSort: typeof item.gsi1sk === "string" ? item.gsi1sk : null,
      relationKey: typeof item.gsi2pk === "string" ? item.gsi2pk : null,
      relationSort: typeof item.gsi2sk === "string" ? item.gsi2sk : null,
    };
  }
}

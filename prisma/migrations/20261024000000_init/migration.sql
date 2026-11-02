CREATE TABLE "StoredItem" (
    "pk" TEXT NOT NULL,
    "sk" TEXT NOT NULL,
    "typeKey" TEXT,
    "typeSort" TEXT,
    "relationKey" TEXT,
    "relationSort" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "StoredItem_pkey" PRIMARY KEY ("pk", "sk")
);

CREATE INDEX "StoredItem_typeKey_typeSort_idx" ON "StoredItem"("typeKey", "typeSort");
CREATE INDEX "StoredItem_relationKey_relationSort_idx" ON "StoredItem"("relationKey", "relationSort");

CREATE TABLE "Counter" (
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("name")
);

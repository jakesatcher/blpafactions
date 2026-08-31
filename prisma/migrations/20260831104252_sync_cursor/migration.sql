-- CreateTable
CREATE TABLE "sync_cursors" (
    "source" TEXT NOT NULL,
    "lastUpdated" BIGINT NOT NULL DEFAULT 0,
    "lastId" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_cursors_pkey" PRIMARY KEY ("source")
);

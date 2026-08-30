-- CreateTable
CREATE TABLE "orders" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "animal" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "leagueAppsUserId" TEXT,
    "orderSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_progress" (
    "playerId" TEXT NOT NULL,
    "orderSlug" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "degree" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_progress_pkey" PRIMARY KEY ("playerId")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "eventId" TEXT,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "leagueAppsEventId" TEXT,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_participation" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "placement" INTEGER,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "event_participation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_name_key" ON "orders"("name");

-- CreateIndex
CREATE UNIQUE INDEX "players_email_key" ON "players"("email");

-- CreateIndex
CREATE UNIQUE INDEX "players_leagueAppsUserId_key" ON "players"("leagueAppsUserId");

-- CreateIndex
CREATE INDEX "players_orderSlug_idx" ON "players"("orderSlug");

-- CreateIndex
CREATE INDEX "order_progress_orderSlug_idx" ON "order_progress"("orderSlug");

-- CreateIndex
CREATE INDEX "achievements_eventId_idx" ON "achievements"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "achievements_playerId_code_key" ON "achievements"("playerId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "events_leagueAppsEventId_key" ON "events"("leagueAppsEventId");

-- CreateIndex
CREATE INDEX "event_participation_eventId_idx" ON "event_participation"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "event_participation_playerId_eventId_key" ON "event_participation"("playerId", "eventId");

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_orderSlug_fkey" FOREIGN KEY ("orderSlug") REFERENCES "orders"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_progress" ADD CONSTRAINT "order_progress_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_progress" ADD CONSTRAINT "order_progress_orderSlug_fkey" FOREIGN KEY ("orderSlug") REFERENCES "orders"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participation" ADD CONSTRAINT "event_participation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participation" ADD CONSTRAINT "event_participation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

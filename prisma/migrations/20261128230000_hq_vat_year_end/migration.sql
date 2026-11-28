-- CreateEnum
CREATE TYPE "HqVatReturnStatus" AS ENUM ('DRAFT', 'FILED');

-- AlterTable
ALTER TABLE "HqSettings" ADD COLUMN     "hmrcAccessToken" TEXT,
ADD COLUMN     "hmrcConnectedAt" TIMESTAMP(3),
ADD COLUMN     "hmrcOauthState" TEXT,
ADD COLUMN     "hmrcRefreshToken" TEXT,
ADD COLUMN     "hmrcTokenExpires" TIMESTAMP(3),
ADD COLUMN     "hmrcVrn" TEXT,
ADD COLUMN     "vatRegisteredFrom" TIMESTAMP(3),
ADD COLUMN     "vatStaggerMonth" INTEGER,
ADD COLUMN     "yearEndDay" INTEGER,
ADD COLUMN     "yearEndMonth" INTEGER;

-- CreateTable
CREATE TABLE "HqVatReturn" (
    "id" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "periodKey" TEXT,
    "status" "HqVatReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "box1" INTEGER NOT NULL DEFAULT 0,
    "box2" INTEGER NOT NULL DEFAULT 0,
    "box3" INTEGER NOT NULL DEFAULT 0,
    "box4" INTEGER NOT NULL DEFAULT 0,
    "box5" INTEGER NOT NULL DEFAULT 0,
    "box6" INTEGER NOT NULL DEFAULT 0,
    "box7" INTEGER NOT NULL DEFAULT 0,
    "box8" INTEGER NOT NULL DEFAULT 0,
    "box9" INTEGER NOT NULL DEFAULT 0,
    "filedAt" TIMESTAMP(3),
    "filedById" TEXT,
    "submittedToHmrc" BOOLEAN NOT NULL DEFAULT false,
    "hmrcReceipt" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqVatReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqYearEnd" (
    "id" TEXT NOT NULL,
    "yearStart" TIMESTAMP(3) NOT NULL,
    "yearEnd" TIMESTAMP(3) NOT NULL,
    "profitPence" INTEGER NOT NULL,
    "taxPence" INTEGER NOT NULL DEFAULT 0,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqYearEnd_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HqVatReturn_periodStart_periodEnd_key" ON "HqVatReturn"("periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "HqYearEnd_yearEnd_key" ON "HqYearEnd"("yearEnd");


-- Matrix HQ data is only read through the server, never through Supabase's public API.
ALTER TABLE "HqVatReturn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqYearEnd" ENABLE ROW LEVEL SECURITY;

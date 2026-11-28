-- CreateEnum
CREATE TYPE "HqProjectStatus" AS ENUM ('PLANNED', 'ACTIVE', 'ON_HOLD', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HqBilling" AS ENUM ('FIXED', 'HOURLY', 'NONE');

-- CreateEnum
CREATE TYPE "HqTaskStatus" AS ENUM ('TODO', 'DOING', 'REVIEW', 'DONE');

-- CreateEnum
CREATE TYPE "HqPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "HqContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HqContractKind" AS ENUM ('SUPPORT', 'HOSTING', 'MAINTENANCE', 'LICENCE', 'DEVELOPMENT', 'SERVICE', 'OTHER');

-- AlterTable
ALTER TABLE "HqBill" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "HqInvoice" ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "HqProject" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "status" "HqProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "billing" "HqBilling" NOT NULL DEFAULT 'FIXED',
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "budgetMinor" INTEGER NOT NULL DEFAULT 0,
    "rateMinor" INTEGER NOT NULL DEFAULT 0,
    "budgetHours" DECIMAL(10,2),
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "description" TEXT,
    "managerId" TEXT,
    "quoteId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "HqTaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "HqPriority" NOT NULL DEFAULT 'NORMAL',
    "assigneeId" TEXT,
    "dueDate" TIMESTAMP(3),
    "estimateMinutes" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "doneAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqTimeEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "description" TEXT,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqTimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqTimer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "description" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqTimer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqContract" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "HqContractKind" NOT NULL DEFAULT 'SERVICE',
    "status" "HqContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "reference" TEXT,
    "vendor" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "renewMonths" INTEGER NOT NULL DEFAULT 12,
    "noticeDays" INTEGER NOT NULL DEFAULT 30,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "valueMinor" INTEGER NOT NULL DEFAULT 0,
    "costMinor" INTEGER,
    "terms" TEXT,
    "notes" TEXT,
    "recurringId" TEXT,
    "remindedFor" TIMESTAMP(3),
    "renewedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HqProject_status_idx" ON "HqProject"("status");

-- CreateIndex
CREATE INDEX "HqProject_clientId_idx" ON "HqProject"("clientId");

-- CreateIndex
CREATE INDEX "HqTask_projectId_status_idx" ON "HqTask"("projectId", "status");

-- CreateIndex
CREATE INDEX "HqTask_assigneeId_status_idx" ON "HqTask"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "HqTimeEntry_projectId_date_idx" ON "HqTimeEntry"("projectId", "date");

-- CreateIndex
CREATE INDEX "HqTimeEntry_userId_date_idx" ON "HqTimeEntry"("userId", "date");

-- CreateIndex
CREATE INDEX "HqTimeEntry_invoiceId_idx" ON "HqTimeEntry"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "HqTimer_userId_key" ON "HqTimer"("userId");

-- CreateIndex
CREATE INDEX "HqContract_status_endDate_idx" ON "HqContract"("status", "endDate");

-- CreateIndex
CREATE INDEX "HqContract_clientId_idx" ON "HqContract"("clientId");

-- AddForeignKey
ALTER TABLE "HqInvoice" ADD CONSTRAINT "HqInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "HqProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqBill" ADD CONSTRAINT "HqBill_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "HqProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqProject" ADD CONSTRAINT "HqProject_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "HqClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqTask" ADD CONSTRAINT "HqTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "HqProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqTimeEntry" ADD CONSTRAINT "HqTimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "HqProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqTimeEntry" ADD CONSTRAINT "HqTimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HqTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqTimeEntry" ADD CONSTRAINT "HqTimeEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "HqInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqTimer" ADD CONSTRAINT "HqTimer_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "HqProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqTimer" ADD CONSTRAINT "HqTimer_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HqTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqContract" ADD CONSTRAINT "HqContract_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "HqClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Matrix HQ data is only read through the server, never through Supabase's public API.
ALTER TABLE "HqProject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqTimeEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqTimer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqContract" ENABLE ROW LEVEL SECURITY;

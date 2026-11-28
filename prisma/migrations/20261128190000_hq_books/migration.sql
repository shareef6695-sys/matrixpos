-- Matrix HQ phase 2: the books (ledger, bills, bank statements, credit notes, recurring invoices).
-- CreateEnum
CREATE TYPE "HqBillStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "HqCreditStatus" AS ENUM ('ISSUED', 'VOID');

-- CreateEnum
CREATE TYPE "HqFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "HqBankTxnStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'IGNORED');

-- AlterTable
ALTER TABLE "HqInvoice" ADD COLUMN     "hqRecurringId" TEXT;

-- AlterTable
ALTER TABLE "HqItem" ADD COLUMN     "incomeAccountId" TEXT;

-- AlterTable
ALTER TABLE "HqLine" ADD COLUMN     "creditNoteId" TEXT;

-- AlterTable
ALTER TABLE "HqPayment" ADD COLUMN     "bankAccountId" TEXT,
ADD COLUMN     "creditNoteId" TEXT;

-- CreateTable
CREATE TABLE "HqAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "systemKey" TEXT,
    "isBank" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "description" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqJournal" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "reference" TEXT,
    "memo" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqJournal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqJournalLine" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitPence" INTEGER NOT NULL DEFAULT 0,
    "creditPence" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "foreignMinor" INTEGER,

    CONSTRAINT "HqJournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqSettings" (
    "id" TEXT NOT NULL DEFAULT 'hq',
    "lockDate" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HqSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqSupplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "vatNumber" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqBill" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT,
    "payee" TEXT NOT NULL,
    "reference" TEXT,
    "isExpense" BOOLEAN NOT NULL DEFAULT false,
    "status" "HqBillStatus" NOT NULL DEFAULT 'OPEN',
    "date" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "perGbp" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "netMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "paidMinor" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqBillLine" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "netMinor" INTEGER NOT NULL,
    "taxPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HqBillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqBillPayment" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "perGbp" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "gbpPence" INTEGER NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "reference" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqBillPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqCreditNote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "status" "HqCreditStatus" NOT NULL DEFAULT 'ISSUED',
    "date" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "perGbp" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "reason" TEXT,
    "subtotalMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "publicToken" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqCreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqRecurring" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "lines" JSONB NOT NULL,
    "frequency" "HqFrequency" NOT NULL DEFAULT 'MONTHLY',
    "nextDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "autoSend" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "terms" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqRecurring_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqBankTxn" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "importKey" TEXT NOT NULL,
    "status" "HqBankTxnStatus" NOT NULL DEFAULT 'UNMATCHED',
    "journalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqBankTxn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HqAccount_code_key" ON "HqAccount"("code");

-- CreateIndex
CREATE UNIQUE INDEX "HqAccount_systemKey_key" ON "HqAccount"("systemKey");

-- CreateIndex
CREATE INDEX "HqJournal_date_idx" ON "HqJournal"("date");

-- CreateIndex
CREATE UNIQUE INDEX "HqJournal_source_sourceId_key" ON "HqJournal"("source", "sourceId");

-- CreateIndex
CREATE INDEX "HqJournalLine_accountId_idx" ON "HqJournalLine"("accountId");

-- CreateIndex
CREATE INDEX "HqBill_status_dueDate_idx" ON "HqBill"("status", "dueDate");

-- CreateIndex
CREATE INDEX "HqBill_date_idx" ON "HqBill"("date");

-- CreateIndex
CREATE INDEX "HqBillPayment_billId_idx" ON "HqBillPayment"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "HqCreditNote_number_key" ON "HqCreditNote"("number");

-- CreateIndex
CREATE UNIQUE INDEX "HqCreditNote_publicToken_key" ON "HqCreditNote"("publicToken");

-- CreateIndex
CREATE INDEX "HqRecurring_active_nextDate_idx" ON "HqRecurring"("active", "nextDate");

-- CreateIndex
CREATE UNIQUE INDEX "HqBankTxn_importKey_key" ON "HqBankTxn"("importKey");

-- CreateIndex
CREATE UNIQUE INDEX "HqBankTxn_journalId_key" ON "HqBankTxn"("journalId");

-- CreateIndex
CREATE INDEX "HqBankTxn_accountId_status_date_idx" ON "HqBankTxn"("accountId", "status", "date");

-- CreateIndex
CREATE INDEX "HqLine_creditNoteId_idx" ON "HqLine"("creditNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "HqPayment_creditNoteId_key" ON "HqPayment"("creditNoteId");

-- AddForeignKey
ALTER TABLE "HqItem" ADD CONSTRAINT "HqItem_incomeAccountId_fkey" FOREIGN KEY ("incomeAccountId") REFERENCES "HqAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqInvoice" ADD CONSTRAINT "HqInvoice_hqRecurringId_fkey" FOREIGN KEY ("hqRecurringId") REFERENCES "HqRecurring"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqLine" ADD CONSTRAINT "HqLine_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "HqCreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqPayment" ADD CONSTRAINT "HqPayment_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "HqCreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqJournalLine" ADD CONSTRAINT "HqJournalLine_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "HqJournal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqJournalLine" ADD CONSTRAINT "HqJournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "HqAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqBill" ADD CONSTRAINT "HqBill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "HqSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqBillLine" ADD CONSTRAINT "HqBillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "HqBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqBillPayment" ADD CONSTRAINT "HqBillPayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "HqBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqCreditNote" ADD CONSTRAINT "HqCreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "HqInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqRecurring" ADD CONSTRAINT "HqRecurring_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "HqClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqBankTxn" ADD CONSTRAINT "HqBankTxn_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "HqAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqBankTxn" ADD CONSTRAINT "HqBankTxn_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "HqJournal"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "HqAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqJournal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqJournalLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqSupplier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqBill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqBillLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqBillPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqCreditNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqRecurring" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqBankTxn" ENABLE ROW LEVEL SECURITY;

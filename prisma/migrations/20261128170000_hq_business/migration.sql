-- Matrix HQ business modules (phase 1): HQ staff, catalogue, clients, leads, quotes, invoices, payments, exchange rates.
-- CreateEnum
CREATE TYPE "HqRole" AS ENUM ('MANAGER', 'SALES', 'ACCOUNTS', 'PROJECTS', 'VIEWER');

-- CreateEnum
CREATE TYPE "HqItemKind" AS ENUM ('SERVICE', 'SUBSCRIPTION', 'PRODUCT', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "HqLeadStage" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "HqQuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'INVOICED');

-- CreateEnum
CREATE TYPE "HqInvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIAL', 'PAID', 'VOID');

-- CreateTable
CREATE TABLE "HqMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "HqRole" NOT NULL DEFAULT 'VIEWER',
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "kind" "HqItemKind" NOT NULL DEFAULT 'SERVICE',
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'each',
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "priceMinor" INTEGER NOT NULL DEFAULT 0,
    "costMinor" INTEGER,
    "vendor" TEXT,
    "url" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HqItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqClient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isCompany" BOOLEAN NOT NULL DEFAULT true,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "town" TEXT,
    "postcode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'United Kingdom',
    "vatNumber" TEXT,
    "companyNo" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "paymentDays" INTEGER NOT NULL DEFAULT 14,
    "notes" TEXT,
    "ownerId" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HqClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqContact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "jobTitle" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqLead" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "stage" "HqLeadStage" NOT NULL DEFAULT 'NEW',
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "valueMinor" INTEGER NOT NULL DEFAULT 0,
    "expectedClose" TIMESTAMP(3),
    "ownerId" TEXT,
    "clientId" TEXT,
    "lostReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HqLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqNote" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "leadId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'NOTE',
    "body" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqFxRate" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "perGbp" DECIMAL(18,8) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqFxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqQuote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT,
    "status" "HqQuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "perGbp" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "subtotalMinor" INTEGER NOT NULL DEFAULT 0,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "terms" TEXT,
    "publicToken" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HqQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqInvoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "quoteId" TEXT,
    "title" TEXT,
    "status" "HqInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "perGbp" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "subtotalMinor" INTEGER NOT NULL DEFAULT 0,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL DEFAULT 0,
    "paidMinor" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "terms" TEXT,
    "billToName" TEXT,
    "billToAddress" TEXT,
    "billToEmail" TEXT,
    "billToVatNumber" TEXT,
    "publicToken" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HqInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT,
    "invoiceId" TEXT,
    "itemId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitMinor" INTEGER NOT NULL,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "amountMinor" INTEGER NOT NULL,

    CONSTRAINT "HqLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqPayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "perGbp" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "gbpPence" INTEGER NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'BANK',
    "reference" TEXT,
    "notes" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HqMember_userId_key" ON "HqMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HqItem_sku_key" ON "HqItem"("sku");

-- CreateIndex
CREATE INDEX "HqClient_name_idx" ON "HqClient"("name");

-- CreateIndex
CREATE INDEX "HqContact_clientId_idx" ON "HqContact"("clientId");

-- CreateIndex
CREATE INDEX "HqLead_stage_idx" ON "HqLead"("stage");

-- CreateIndex
CREATE INDEX "HqNote_clientId_createdAt_idx" ON "HqNote"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "HqNote_leadId_createdAt_idx" ON "HqNote"("leadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HqFxRate_currency_date_key" ON "HqFxRate"("currency", "date");

-- CreateIndex
CREATE UNIQUE INDEX "HqQuote_number_key" ON "HqQuote"("number");

-- CreateIndex
CREATE UNIQUE INDEX "HqQuote_publicToken_key" ON "HqQuote"("publicToken");

-- CreateIndex
CREATE INDEX "HqQuote_status_idx" ON "HqQuote"("status");

-- CreateIndex
CREATE UNIQUE INDEX "HqInvoice_number_key" ON "HqInvoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "HqInvoice_quoteId_key" ON "HqInvoice"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "HqInvoice_publicToken_key" ON "HqInvoice"("publicToken");

-- CreateIndex
CREATE INDEX "HqInvoice_status_dueDate_idx" ON "HqInvoice"("status", "dueDate");

-- CreateIndex
CREATE INDEX "HqInvoice_issueDate_idx" ON "HqInvoice"("issueDate");

-- CreateIndex
CREATE INDEX "HqLine_quoteId_idx" ON "HqLine"("quoteId");

-- CreateIndex
CREATE INDEX "HqLine_invoiceId_idx" ON "HqLine"("invoiceId");

-- CreateIndex
CREATE INDEX "HqPayment_invoiceId_idx" ON "HqPayment"("invoiceId");

-- CreateIndex
CREATE INDEX "HqPayment_date_idx" ON "HqPayment"("date");

-- AddForeignKey
ALTER TABLE "HqMember" ADD CONSTRAINT "HqMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqContact" ADD CONSTRAINT "HqContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "HqClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqLead" ADD CONSTRAINT "HqLead_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "HqClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqNote" ADD CONSTRAINT "HqNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "HqClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqNote" ADD CONSTRAINT "HqNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "HqLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqQuote" ADD CONSTRAINT "HqQuote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "HqClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqInvoice" ADD CONSTRAINT "HqInvoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "HqClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqInvoice" ADD CONSTRAINT "HqInvoice_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "HqQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqLine" ADD CONSTRAINT "HqLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "HqQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqLine" ADD CONSTRAINT "HqLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "HqInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqLine" ADD CONSTRAINT "HqLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "HqItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqPayment" ADD CONSTRAINT "HqPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "HqInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Same defence in depth as every other table: no rows through Supabase's REST roles.
ALTER TABLE "HqMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqClient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqLead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqFxRate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqQuote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HqPayment" ENABLE ROW LEVEL SECURITY;

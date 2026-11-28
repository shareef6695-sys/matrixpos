-- Card machine payments recorded by the server, so a sale can't claim a card payment that never happened.
CREATE TABLE "CardPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "reference" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CardPayment_provider_ref_key" ON "CardPayment"("provider", "ref");
CREATE INDEX "CardPayment_organizationId_saleId_idx" ON "CardPayment"("organizationId", "saleId");
ALTER TABLE "CardPayment" ADD CONSTRAINT "CardPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardPayment" ENABLE ROW LEVEL SECURITY;

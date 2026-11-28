-- MatrixPOS's own subscription invoices are tax records that must be kept for 6 years,
-- so deleting a closed business no longer deletes them: the link to the business is cleared instead.
ALTER TABLE "SubscriptionInvoice" DROP CONSTRAINT "SubscriptionInvoice_organizationId_fkey";
ALTER TABLE "SubscriptionInvoice" ALTER COLUMN "organizationId" DROP NOT NULL;
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

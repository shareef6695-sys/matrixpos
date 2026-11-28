-- Revoked sessions (sign-out) and used authenticator codes.
CREATE TABLE "RevokedToken" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RevokedToken_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RevokedToken_expiresAt_idx" ON "RevokedToken"("expiresAt");

-- Price lists given to tills, so the server re-prices each sale itself.
CREATE TABLE "PricingSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PricingSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PricingSnapshot_organizationId_createdAt_idx" ON "PricingSnapshot"("organizationId", "createdAt");
ALTER TABLE "PricingSnapshot" ADD CONSTRAINT "PricingSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same defence in depth as every other MatrixPOS table (see 20261128100000_row_level_security).
ALTER TABLE "RevokedToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PricingSnapshot" ENABLE ROW LEVEL SECURITY;

import type { VatCode } from "@/lib/pos/vat";
import type { PromotionRule, PricingUnit, TenderMethod } from "@/lib/pos/pricing";

export interface TillProduct {
  id: string; name: string; pricePence: number; vatCode: VatCode; unit: PricingUnit; minAge: number | null;
  plu: string | null; sku: string | null; categoryId: string | null; quickKey: boolean;
  barcodes: { code: string; packQty: number }[]; stock: number | null;
}

export interface TillSettings {
  enableCash: boolean; enableCardManual: boolean; enableStripeTerminal: boolean; enableSumUp: boolean; enableDojo: boolean;
  enablePromotions: boolean; enableAgeCheck: boolean; enableWeighedItems: boolean; enableStockControl: boolean;
  enableLoyalty: boolean; enableOfflineMode: boolean; embeddedBarcodeMode: "PRICE" | "WEIGHT" | "OFF"; ageCheckThreshold: number;
  requireManagerForRefund: boolean; requireManagerForVoid: boolean;
}

export interface Bootstrap {
  device: { storeId: string; registerId: string } | null;
  org: { name: string; vatNumber: string | null; receiptFooter: string | null; brandColor: string; companyNo: string | null };
  store: { name: string; code: string; address: string; phone: string | null };
  register: { name: string; number: number; hasStripe: boolean; hasSumUp: boolean; hasDojo: boolean };
  settings: TillSettings;
  categories: { id: string; name: string; color: string }[];
  products: TillProduct[];
  promotions: PromotionRule[];
  lastSeq: number;
  /** Price list id and signed cashier proof, sent back with every sale so the server can check it. */
  pricingId?: string;
  cashierProof?: string | null;
  user: { id: string; name: string; role: "OWNER" | "MANAGER" | "SUPERVISOR" | "CASHIER" } | null;
  shift: { id: string; openedAt: string; openingFloatPence: number } | null;
}

export interface Tender { method: TenderMethod; amountPence: number; reference?: string | null }

export interface QueuedSale {
  id: string; receiptNo: string; kind: "SALE" | "REFUND"; originalSaleId?: string | null; shiftId: string | null; userId: string;
  customerId?: string | null; createdAt: string; subtotalPence: number; discountPence: number; totalPence: number; vatPence: number;
  changePence: number; ageVerified: boolean;
  lines: { productId: string | null; name: string; quantity: number; unit: PricingUnit; unitPricePence: number; grossPence: number; discountPence: number; netPence: number; vatCode: VatCode; vatRate: number; promotionName: string | null }[];
  vat: { vatCode: VatCode; vatRate: number; grossPence: number; vatPence: number }[];
  payments: Tender[];
  pricingId?: string | null; cashierProof?: string | null; approvals?: string[];
  // display-only, stripped before sync
  _cashier?: string; _promotions?: { name: string; savingPence: number }[]; _customer?: string | null;
}

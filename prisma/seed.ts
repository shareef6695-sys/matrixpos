/* Demo data: one business, two branches, staff, a UK supermarket catalogue and live offers.
 * Run with `npm run db:seed`. Safe to re-run: it removes the demo business first. */
import { PrismaClient, type VatCode, type PricingUnit } from "@prisma/client";
import bcrypt from "bcryptjs";
import { gtinCheckDigit } from "../src/lib/pos/barcode";
import { DEFAULT_CHART } from "../src/lib/accounting/ledger";

const db = new PrismaClient();
const SLUG = "demo-mart";

const ean = (n: number) => {
  const body = `50999${String(n).padStart(7, "0")}`;
  return body + gtinCheckDigit(body);
};

type P = [name: string, pence: number, vat: VatCode, cat: string, opts?: { unit?: PricingUnit; minAge?: number; plu?: string; quick?: boolean; cost?: number }];

const products: P[] = [
  ["Semi Skimmed Milk 2.272L (4 pint)", 155, "ZERO", "Dairy", { quick: true }],
  ["Whole Milk 1.136L (2 pint)", 125, "ZERO", "Dairy"],
  ["Mature Cheddar 400g", 375, "ZERO", "Dairy"],
  ["Salted Butter 250g", 225, "ZERO", "Dairy"],
  ["Free Range Eggs x6", 199, "ZERO", "Dairy"],
  ["Greek Style Yogurt 500g", 165, "ZERO", "Dairy"],
  ["White Sliced Bread 800g", 140, "ZERO", "Bakery", { quick: true }],
  ["Wholemeal Bread 800g", 150, "ZERO", "Bakery"],
  ["Croissants x4", 180, "ZERO", "Bakery"],
  ["Hot Sausage Roll", 135, "STANDARD", "Bakery", { quick: true }],
  ["Bananas", 99, "ZERO", "Fruit & Veg", { unit: "PER_KG", plu: "4011", quick: true }],
  ["Loose Apples", 230, "ZERO", "Fruit & Veg", { unit: "PER_KG", plu: "4131", quick: true }],
  ["Loose Carrots", 70, "ZERO", "Fruit & Veg", { unit: "PER_KG", plu: "4562" }],
  ["Potatoes 2.5kg", 175, "ZERO", "Fruit & Veg"],
  ["Onions 1kg", 95, "ZERO", "Fruit & Veg"],
  ["Chicken Breast Fillets 500g", 450, "ZERO", "Meat"],
  ["Beef Mince 500g", 399, "ZERO", "Meat"],
  ["Pork Sausages x8", 275, "ZERO", "Meat"],
  ["Deli Ham (sliced to order)", 1290, "ZERO", "Meat", { unit: "PER_KG", plu: "123" }],
  ["Chicken & Bacon Sandwich", 325, "ZERO", "Meal Deal"],
  ["Egg Mayo Sandwich", 260, "ZERO", "Meal Deal"],
  ["Ready Salted Crisps 45g", 95, "STANDARD", "Snacks"],
  ["Cheese & Onion Crisps 45g", 95, "STANDARD", "Snacks"],
  ["Milk Chocolate Bar 45g", 110, "STANDARD", "Snacks", { quick: true }],
  ["Digestive Biscuits 400g", 129, "ZERO", "Snacks"],
  ["Still Water 500ml", 90, "STANDARD", "Drinks", { quick: true }],
  ["Cola 500ml", 175, "STANDARD", "Drinks"],
  ["Orange Juice 1L", 199, "ZERO", "Drinks"],
  ["Tea Bags x80", 299, "ZERO", "Drinks"],
  ["Instant Coffee 100g", 450, "ZERO", "Drinks"],
  ["Lager 4 x 440ml", 550, "STANDARD", "Alcohol", { minAge: 18 }],
  ["Red Wine 75cl", 799, "STANDARD", "Alcohol", { minAge: 18 }],
  ["Paracetamol 16 tablets", 59, "STANDARD", "Health", { minAge: 16 }],
  ["Washing Up Liquid 450ml", 125, "STANDARD", "Household"],
  ["Toilet Roll x9", 499, "STANDARD", "Household"],
  ["Kitchen Knife", 600, "STANDARD", "Household", { minAge: 18 }],
  ["Disposable Nappies x30", 550, "ZERO", "Baby"],
  ["Domestic Fuel: Logs Net", 450, "REDUCED", "Household"],
  ["Postage Stamp 1st Class", 165, "EXEMPT", "Services"],
  ["Carrier Bag", 10, "STANDARD", "Services", { quick: true }],
];

const colors: Record<string, string> = {
  Dairy: "#0ea5e9", Bakery: "#d97706", "Fruit & Veg": "#16a34a", Meat: "#dc2626", "Meal Deal": "#7c3aed",
  Snacks: "#db2777", Drinks: "#2563eb", Alcohol: "#9f1239", Health: "#0d9488", Household: "#64748b", Baby: "#f472b6", Services: "#475569",
};

async function main() {
  const old = await db.organization.findUnique({ where: { slug: SLUG } });
  if (old) {
    await db.journalEntry.deleteMany({ where: { organizationId: old.id } });
    await db.sale.deleteMany({ where: { organizationId: old.id } });
    await db.purchaseOrder.deleteMany({ where: { organizationId: old.id } });
    await db.shift.deleteMany({ where: { store: { organizationId: old.id } } });
    await db.organization.delete({ where: { id: old.id } });
  }

  const org = await db.organization.create({
    data: {
      name: "Matrix Demo Mart",
      slug: SLUG,
      vatNumber: "GB123456789",
      companyNo: "01234567",
      receiptFooter: "Thank you for shopping with us! Returns accepted within 28 days with receipt.",
      settings: { create: { enableLoyalty: true } },
    },
  });

  const london = await db.store.create({
    data: { organizationId: org.id, name: "High Street", code: "LDN1", addressLine1: "12 High Street", town: "London", postcode: "E1 6AN", phone: "020 7946 0000",
      registers: { create: [{ name: "Till 1", number: 1 }, { name: "Till 2", number: 2 }] } },
  });
  const manchester = await db.store.create({
    data: { organizationId: org.id, name: "Market Street", code: "MAN1", addressLine1: "4 Market Street", town: "Manchester", postcode: "M1 1PW",
      registers: { create: [{ name: "Till 1", number: 1 }] } },
  });

  const pin = (p: string) => bcrypt.hashSync(p, 10);
  const staff = [
    { name: "Demo Owner", email: "owner@demo.matrixpos.uk", passwordHash: bcrypt.hashSync("demo1234", 10), pinHash: pin("9999"), role: "OWNER" as const },
    { name: "Priya (Manager)", email: "manager@demo.matrixpos.uk", passwordHash: bcrypt.hashSync("demo1234", 10), pinHash: pin("2222"), role: "MANAGER" as const },
    { name: "Tom (Supervisor)", pinHash: pin("3333"), role: "SUPERVISOR" as const },
    { name: "Amy (Cashier)", pinHash: pin("1111"), role: "CASHIER" as const },
  ];
  for (const s of staff)
    await db.user.create({ data: { ...s, organizationId: org.id, stores: { create: [{ storeId: london.id }, { storeId: manchester.id }] } } });

  const cats = new Map<string, string>();
  let order = 0;
  for (const name of [...new Set(products.map((p) => p[3]))]) {
    const c = await db.category.create({ data: { organizationId: org.id, name, color: colors[name] ?? "#64748b", sortOrder: order++ } });
    cats.set(name, c.id);
  }

  const supplier = await db.supplier.create({ data: { organizationId: org.id, name: "Booker Wholesale", contactName: "Accounts", email: "orders@example.co.uk", phone: "0800 000 0000" } });

  const ids = new Map<string, string>();
  let n = 1;
  for (const [name, pricePence, vatCode, cat, o = {}] of products) {
    const isWeighed = o.unit === "PER_KG";
    const p = await db.product.create({
      data: {
        organizationId: org.id, name, pricePence, vatCode, categoryId: cats.get(cat), supplierId: supplier.id,
        unit: o.unit ?? "EACH", minAge: o.minAge, plu: o.plu, quickKey: o.quick ?? false,
        sku: `SKU${String(n).padStart(4, "0")}`,
        costPence: o.cost ?? Math.round((pricePence / (vatCode === "STANDARD" ? 1.2 : vatCode === "REDUCED" ? 1.05 : 1)) * 0.7),
        reorderLevel: isWeighed ? 2000 : 6, reorderQty: isWeighed ? 10000 : 24,
        barcodes: isWeighed ? undefined : { create: { organizationId: org.id, code: ean(n) } },
        stockLevels: { create: [
          { storeId: london.id, quantity: isWeighed ? 15000 : 20 + ((n * 7) % 40) },
          { storeId: manchester.id, quantity: isWeighed ? 8000 : 4 + ((n * 5) % 20) },
        ] },
      },
    });
    ids.set(name, p.id);
    n++;
  }

  const items = (names: string[], group = 1) => names.map((x) => ({ productId: ids.get(x)!, group }));
  await db.promotion.create({ data: { organizationId: org.id, name: "Meal Deal £3.50", type: "MEAL_DEAL", pricePence: 350, items: { create: [
    ...items(["Chicken & Bacon Sandwich", "Egg Mayo Sandwich"], 1),
    ...items(["Ready Salted Crisps 45g", "Cheese & Onion Crisps 45g", "Milk Chocolate Bar 45g"], 2),
    ...items(["Still Water 500ml", "Cola 500ml"], 3),
  ] } } });
  await db.promotion.create({ data: { organizationId: org.id, name: "Any 3 for £2.50", type: "MULTIBUY_PRICE", quantity: 3, pricePence: 250,
    items: { create: items(["Ready Salted Crisps 45g", "Cheese & Onion Crisps 45g", "Milk Chocolate Bar 45g"]) } } });
  await db.promotion.create({ data: { organizationId: org.id, name: "Buy 1 Get 1 Free", type: "BUY_X_GET_Y", quantity: 1, freeQuantity: 1,
    items: { create: items(["Croissants x4", "Greek Style Yogurt 500g"]) } } });
  await db.promotion.create({ data: { organizationId: org.id, name: "25% off Fruit", type: "PERCENT_OFF", percentOff: 25,
    items: { create: items(["Loose Apples", "Bananas"]) } } });

  // Accounts: chart, opening balances and a few bills.
  await db.ledgerAccount.createMany({ data: DEFAULT_CHART.map((a) => ({ organizationId: org.id, code: a.code, name: a.name, type: a.type, systemKey: a.systemKey ?? null, isBank: a.isBank ?? false })) });
  const acct = async (code: string) => (await db.ledgerAccount.findUniqueOrThrow({ where: { organizationId_code: { organizationId: org.id, code } } })).id;
  const stockValue = (await db.product.findMany({ where: { organizationId: org.id }, include: { stockLevels: true } }))
    .reduce((a, p) => a + p.stockLevels.reduce((b, l) => b + Math.round(((p.costPence ?? 0) * l.quantity) / (p.unit === "PER_KG" ? 1000 : 1)), 0), 0);
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1, 9));
  await db.journalEntry.create({ data: { organizationId: org.id, date: monthStart, source: "MANUAL", memo: "Opening balances", reference: "OPEN", lines: { create: [
    { accountId: await acct("1200"), debitPence: 500000, creditPence: 0 },
    { accountId: await acct("1001"), debitPence: stockValue, creditPence: 0 },
    { accountId: await acct("3000"), debitPence: 0, creditPence: 500000 + stockValue },
  ] } } });
  const bill = async (payee: string, code: string, net: number, vatCode: "STANDARD" | "ZERO" | "EXEMPT", paid: boolean, ref: string) => {
    const vat = vatCode === "STANDARD" ? Math.round(net * 0.2) : 0;
    const b = await db.bill.create({ data: { organizationId: org.id, payee, date: monthStart, reference: ref, accountId: await acct(code), vatCode, netPence: net, vatPence: vat, grossPence: net + vat, supplierId: payee === supplier.name ? supplier.id : null, ...(paid ? { paidAt: monthStart, paidFromId: await acct("1200") } : {}) } });
    const lines = [{ accountId: b.accountId, debitPence: net, creditPence: 0 }, ...(vat ? [{ accountId: await acct("2201"), debitPence: vat, creditPence: 0 }] : []), { accountId: await acct("2100"), debitPence: 0, creditPence: net + vat }];
    await db.journalEntry.create({ data: { organizationId: org.id, date: monthStart, source: "BILL", sourceId: b.id, reference: ref, memo: payee, lines: { create: lines } } });
    if (paid) await db.journalEntry.create({ data: { organizationId: org.id, date: monthStart, source: "BILL_PAYMENT", sourceId: b.id, reference: ref, memo: `Paid ${payee}`, lines: { create: [{ accountId: await acct("2100"), debitPence: net + vat, creditPence: 0 }, { accountId: await acct("1200"), debitPence: 0, creditPence: net + vat }] } } });
  };
  await bill("Shop landlord", "6100", 150000, "EXEMPT", true, "RENT-01");
  await bill("Octopus Energy", "6200", 32000, "STANDARD", true, "EL-2231");
  await bill(supplier.name, "1001", 84000, "ZERO", false, "INV-90812");

  await db.customer.create({ data: { organizationId: org.id, name: "Sarah Jones", email: "sarah@example.com", loyaltyCode: "MX1001", points: 120, marketingOptIn: true } });

  console.log(`Seeded "${org.name}". Back office: owner@demo.matrixpos.uk / demo1234. Till PINs: owner 9999, manager 2222, supervisor 3333, cashier 1111.`);
}

main().finally(() => db.$disconnect());

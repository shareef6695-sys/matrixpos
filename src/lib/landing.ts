// Copy for the keyword landing pages (one page per type of shop). Each entry becomes /<slug>.

export interface LandingPage {
  slug: string;
  /** Short label for footer links. */
  navLabel: string;
  /** <title>, about 60 characters. */
  title: string;
  /** Meta description, about 155 characters. */
  description: string;
  h1: string;
  intro: string;
  points: [string, string][];
  faqs: [string, string][];
}

export const LANDING_PAGES: LandingPage[] = [
  {
    slug: "supermarket-pos-system",
    navLabel: "Supermarket POS",
    title: "POS System for Small Supermarkets in the UK",
    description:
      "Cloud POS system for small and independent UK supermarkets: fast barcode tills, stock, suppliers, UK VAT and multi-branch reports. From £12 a month.",
    h1: "The POS system for small UK supermarkets",
    intro:
      "Independent supermarkets and mini markets need a till that keeps the queue moving, knows UK VAT and tracks thousands of lines of stock. MatrixPOS does all of that on the PCs and tablets you already have, for a flat monthly fee.",
    points: [
      ["Fast checkout on any hardware", "Scan with any USB or Bluetooth barcode scanner, use quick-pick buttons for loose fruit and veg, and key quantities like 6*barcode."],
      ["Stock that stays right", "Stock levels per shop, low stock alerts, suppliers, purchase orders and goods in. Import your product list from a spreadsheet."],
      ["Weighed and labelled goods", "Price-per-kg items, and deli or butcher scale labels with the price or weight in the barcode."],
      ["Offers your customers expect", "Meal deals, 3 for £2, buy one get one free and percentage discounts, applied at the till automatically."],
      ["More than one branch", "Shared catalogue, stock per store, transfers between shops and reports by branch."],
      ["Accounts and VAT", "Every sale posts to your books, with a VAT summary for your HMRC return on the Business plan."],
    ],
    faqs: [
      ["How many products can I have?", "There's no product limit on any plan. Most supermarkets import their list from a CSV file in a few minutes."],
      ["Can I run several tills?", "Yes. Starter includes 2 tills, and Business and Enterprise have unlimited tills."],
      ["Does it work if the internet goes down?", "Yes. The till keeps selling offline and syncs every sale when the connection is back."],
    ],
  },
  {
    slug: "convenience-store-epos",
    navLabel: "Convenience store EPOS",
    title: "Convenience Store EPOS & Till System UK",
    description:
      "Simple convenience store till system for UK corner shops: barcode scanning, Challenge 25, meal deals, UK VAT, works offline. Free trial, from £12/month.",
    h1: "A convenience store till system that just works",
    intro:
      "Corner shops and convenience stores run on speed and small margins. MatrixPOS gives you a modern EPOS till on a tablet or PC you already own, with no contract, no setup fee and no cut of your card takings.",
    points: [
      ["Challenge 25 built in", "Alcohol, tobacco, vapes and other age-restricted lines prompt the cashier to check ID before payment."],
      ["Meal deals and multibuys", "Set up meal deals, 2 for £3 and BOGOF offers once and the till applies them for you."],
      ["Keep your card machine", "Works with any standalone card terminal, or connect Stripe, SumUp or Dojo readers. MatrixPOS never takes a percentage."],
      ["Cash up in minutes", "Shifts, float and cash counts, refunds and end-of-day reports for every till."],
      ["Know what's selling", "Best sellers, sales by hour and low stock lists, so you order the right things from the cash and carry."],
      ["Staff PINs", "Each cashier signs in with their own PIN, so you can see who sold what."],
    ],
    faqs: [
      ["Do I need new hardware?", "No. Use a Windows PC, Mac, Android tablet or iPad you already have, with any barcode scanner and receipt printer."],
      ["Is there a contract?", "No. Pay monthly and cancel any time, or pay yearly and get 2 months free."],
      ["How quickly can I start selling?", "Most shops are selling the same day. Sign up, import or scan in your products and open the till."],
    ],
  },
  {
    slug: "off-licence-epos",
    navLabel: "Off-licence EPOS",
    title: "Off-Licence EPOS with Challenge 25 Checks (UK)",
    description:
      "EPOS for UK off-licences and wine shops: Challenge 25 checks on every restricted sale, multibuys, stock control and UK VAT receipts. From £12 a month.",
    h1: "EPOS for off-licences, with Challenge 25 on every sale",
    intro:
      "Selling alcohol and tobacco means every age-restricted sale has to be checked. MatrixPOS prompts your staff to confirm ID before payment, and handles the multibuys, stock and VAT that off-licences live on.",
    points: [
      ["Age checks you can rely on", "Set a minimum age on a product once, and the till asks the cashier to confirm Challenge 25 before taking payment."],
      ["Multibuys on wine and beer", "Any 3 bottles for £20, case discounts and percentage offers, applied automatically."],
      ["Stock control by the bottle", "Track stock per shop, set reorder levels and raise purchase orders to your suppliers."],
      ["UK VAT receipts", "VAT receipts with your VAT number and a VAT summary for your returns."],
      ["Works offline", "Keep trading if the broadband drops. Sales sync as soon as it's back."],
      ["Loyalty customers", "Reward regulars with loyalty points on the Business plan."],
    ],
    faqs: [
      ["Which products need an age check?", "You choose. Set a minimum age of 16 or 18 on any product, such as alcohol, tobacco, vapes, lottery or knives."],
      ["Can I use my existing card machine?", "Yes. Use any standalone terminal, or connect Stripe, SumUp or Dojo readers on the Business plan."],
      ["How much does it cost?", "Starter is £12 a month for one shop, Business is £24 and Enterprise is £49, with a 14-day free trial."],
    ],
  },
];

export const landingBySlug = (slug: string) => LANDING_PAGES.find((p) => p.slug === slug);

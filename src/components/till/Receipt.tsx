"use client";
import { COMPANY } from "@/components/PoweredBy";
import { formatGBP, formatWeight } from "@/lib/pos/money";
import { VAT_LETTERS } from "@/lib/pos/vat";
import type { Bootstrap, QueuedSale } from "./types";

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash", CARD_MANUAL: "Card", STRIPE_TERMINAL: "Card (Stripe)", SUMUP: "Card (SumUp)", DOJO: "Card (Dojo)", VOUCHER: "Voucher",
};

/** 80mm receipt. Printed with the browser's print dialog, so it works with any receipt or A4 printer. */
export function Receipt({ sale, boot }: { sale: QueuedSale; boot: Bootstrap }) {
  const when = new Date(sale.createdAt);
  return (
    <div className="print-area mx-auto w-[300px] bg-white p-3 font-mono text-[12px] leading-snug text-black">
      <div className="text-center">
        <div className="text-base font-bold">{boot.org.name}</div>
        <div>{boot.store.name}</div>
        {boot.store.address && <div>{boot.store.address}</div>}
        {boot.store.phone && <div>Tel {boot.store.phone}</div>}
        {boot.org.vatNumber && <div>VAT No. {boot.org.vatNumber}</div>}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      {sale.kind === "REFUND" && <div className="mb-1 text-center font-bold">*** REFUND ***</div>}
      {sale.lines.map((l, i) => (
        <div key={i} className="mb-0.5">
          <div className="flex justify-between gap-2">
            <span className="truncate">{l.name}</span>
            <span className="whitespace-nowrap">{formatGBP(l.grossPence)} {VAT_LETTERS[l.vatCode]}</span>
          </div>
          {(l.unit === "PER_KG" || Math.abs(l.quantity) > 1) && (
            <div className="pl-2 text-[11px]">
              {l.unit === "PER_KG" ? `${formatWeight(Math.abs(l.quantity))} @ ${formatGBP(l.unitPricePence)}/kg` : `${Math.abs(l.quantity)} @ ${formatGBP(l.unitPricePence)}`}
            </div>
          )}
          {l.discountPence !== 0 && (
            <div className="flex justify-between pl-2 text-[11px]"><span>{l.promotionName ?? "Discount"}</span><span>-{formatGBP(Math.abs(l.discountPence))}</span></div>
          )}
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-black" />
      {sale.discountPence !== 0 && <Row l="You saved" r={formatGBP(Math.abs(sale.discountPence))} />}
      <Row l={`TOTAL (${sale.lines.reduce((a, l) => a + (l.unit === "EACH" ? Math.abs(l.quantity) : 1), 0)} items)`} r={formatGBP(sale.totalPence)} bold />
      {sale.payments.map((p, i) => <Row key={i} l={METHOD_LABEL[p.method] + (p.reference ? ` ${p.reference}` : "")} r={formatGBP(p.amountPence)} />)}
      {sale.changePence > 0 && <Row l="Change" r={formatGBP(sale.changePence)} bold />}
      <div className="my-2 border-t border-dashed border-black" />
      <div className="grid grid-cols-4 text-[11px]">
        <span>VAT</span><span className="text-right">Rate</span><span className="text-right">Net</span><span className="text-right">VAT</span>
        {sale.vat.map((v) => (
          <span key={v.vatCode} className="contents">
            <span>{VAT_LETTERS[v.vatCode]}</span>
            <span className="text-right">{v.vatCode === "EXEMPT" ? "Exempt" : `${v.vatRate / 100}%`}</span>
            <span className="text-right">{formatGBP(v.grossPence - v.vatPence)}</span>
            <span className="text-right">{formatGBP(v.vatPence)}</span>
          </span>
        ))}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      {sale._customer && <div>Loyalty: {sale._customer}</div>}
      <div>Served by {sale._cashier ?? ""}</div>
      <div>{boot.register.name} · {when.toLocaleDateString("en-GB")} {when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
      <div>Receipt {sale.receiptNo}</div>
      {boot.org.receiptFooter && <div className="mt-2 text-center">{boot.org.receiptFooter}</div>}
      {boot.org.companyNo && <div className="mt-1 text-center text-[10px]">Company No. {boot.org.companyNo}</div>}
      <div className="mt-2 text-center text-[9px]">Powered by {COMPANY}</div>
    </div>
  );
}

function Row({ l, r, bold }: { l: string; r: string; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? "font-bold" : ""}`}><span>{l}</span><span>{r}</span></div>;
}

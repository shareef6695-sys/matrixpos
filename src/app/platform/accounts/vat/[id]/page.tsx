import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { hmrcConnected, hmrcSandbox, hqSettings } from "@/lib/server/hq-vat";
import { deleteVatReturn, fileVatReturn, prepareVatReturn } from "@/lib/server/actions/hq-tax";
import { PageHeader } from "@/components/admin";
import { BooksNav } from "@/components/hq/BooksNav";
import { PrintButton } from "@/components/PrintButton";
import { VatFileForm } from "@/components/hq/VatForms";
import { VAT_BOXES } from "@/lib/hq/labels";
import { formatGBP } from "@/lib/pos/money";
import { fmtDate, fmtDateTime, londonDate } from "@/lib/dates";

export const metadata = { title: "VAT return" };

export default async function VatReturn({ params }: { params: Promise<{ id: string }> }) {
  const h = await requireHq("accounts.view");
  const r = await db.hqVatReturn.findUnique({ where: { id: (await params).id } });
  if (!r) notFound();
  const [s, connected, vatAccounts] = await Promise.all([hqSettings(), hmrcConnected(), db.hqAccount.findMany({ where: { systemKey: { in: ["VAT_OUTPUT", "VAT_INPUT", "VAT_CONTROL"] } }, orderBy: { code: "asc" } })]);
  const start = londonDate(r.periodStart), end = londonDate(r.periodEnd);
  const ended = end < londonDate();
  const edit = h.can("accounts.edit");
  const receipt = (r.hmrcReceipt ?? null) as Record<string, string | null> | null;
  const value = (n: number, i: number) => (i < 5 ? formatGBP(n) : `£${n.toLocaleString("en-GB")}`);
  return (
    <div>
      <PageHeader title={`VAT return: ${fmtDate(start)} to ${fmtDate(end)}`} sub={`Due ${fmtDate(r.dueDate)}${r.periodKey ? ` · HMRC period ${r.periodKey}` : ""}`} actions={<PrintButton />} />
      <BooksNav current="/platform/accounts/vat" />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="card overflow-x-auto">
          <h2 className="text-lg font-bold">Matrix Infotech Ltd{s?.hmrcVrn ? ` · VAT ${s.hmrcVrn}` : ""}</h2>
          <p className="mb-4 text-sm text-slate-500">{r.status === "FILED" ? `Filed ${fmtDateTime(r.filedAt!)}${r.submittedToHmrc ? " with HMRC" : ""}` : ended ? "Draft, worked out from the books" : "Preview: the period hasn't ended yet"}</p>
          <table className="w-full text-sm">
            <tbody>
              {VAT_BOXES.map((label, i) => {
                const n = r[`box${i + 1}` as "box1"];
                return (
                  <tr key={i} className={i === 4 ? "text-base font-bold" : ""}>
                    <td className="w-12 py-2 align-top font-mono text-xs text-slate-400">Box {i + 1}</td>
                    <td className="py-2 pr-3">{label}</td>
                    <td className="py-2 text-right tabular-nums">{value(n, i)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-4 text-sm font-semibold">{r.box5 > 0 ? `You pay HMRC ${formatGBP(r.box5)}.` : r.box5 < 0 ? `HMRC pays you ${formatGBP(-r.box5)}.` : "Nothing to pay."}</p>
          <p className="mt-2 text-xs text-slate-500">
            Boxes 1 and 4 are the VAT in the books for the period. Box 6 is all income before VAT; box 7 is costs before VAT, plus equipment bought, leaving out
            wages, depreciation, exchange differences and Corporation Tax. Boxes 2, 8 and 9 are for trade in goods with the EU from Northern Ireland, so are nil.
            {" "}Standard accounting (invoice basis) is assumed.
          </p>
          <p className="mt-2 text-xs">{vatAccounts.map((a) => <Link key={a.id} href={`/platform/accounts/ledger/${a.id}`} className="mr-3 text-violet-700">{a.code} {a.name}</Link>)}</p>
        </div>
        <div className="space-y-4 print:hidden">
          {r.status === "FILED" ? (
            <div className="card text-sm">
              <h2 className="mb-2 font-semibold">Filed</h2>
              <p className="text-slate-600">Its VAT has moved to &ldquo;VAT owed to HMRC&rdquo;. When you pay (or get a refund), match the bank line to that account.</p>
              {receipt && (
                <dl className="mt-3 space-y-1 text-xs">
                  {receipt.formBundleNumber && <div><dt className="inline text-slate-500">HMRC reference: </dt><dd className="inline font-mono">{receipt.formBundleNumber}</dd></div>}
                  {receipt.processingDate && <div><dt className="inline text-slate-500">Received: </dt><dd className="inline">{fmtDateTime(receipt.processingDate)}</dd></div>}
                  {receipt.chargeRefNumber && <div><dt className="inline text-slate-500">Payment reference: </dt><dd className="inline font-mono">{receipt.chargeRefNumber}</dd></div>}
                  {receipt.receiptId && <div><dt className="inline text-slate-500">Receipt ID: </dt><dd className="inline font-mono">{receipt.receiptId}</dd></div>}
                </dl>
              )}
            </div>
          ) : edit ? (
            <>
              <div className="card text-sm">
                <h2 className="mb-2 font-semibold">Check the figures</h2>
                <p className="mb-3 text-slate-600">Make sure every bill and bank line for the period is in, then work it out again.</p>
                <form action={prepareVatReturn}>
                  <input type="hidden" name="start" value={start} /><input type="hidden" name="end" value={end} /><input type="hidden" name="due" value={londonDate(r.dueDate)} />
                  <button className="btn-secondary">Work it out again</button>
                </form>
              </div>
              {ended && (
                <div className="card">
                  <h2 className="mb-3 font-semibold">File the return</h2>
                  <VatFileForm action={fileVatReturn} id={r.id} canHmrc={connected && !!r.periodKey && !!s?.hmrcVrn} sandbox={hmrcSandbox()} />
                  <p className="mt-3 text-xs text-slate-500">Filing locks the books up to {fmtDate(end)}.</p>
                </div>
              )}
              <form action={deleteVatReturn}><input type="hidden" name="id" value={r.id} /><button className="text-xs text-red-600">Delete this draft</button></form>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

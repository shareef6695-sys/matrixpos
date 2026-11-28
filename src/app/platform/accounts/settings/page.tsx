import { requireHq } from "@/lib/server/hq";
import { lockDate } from "@/lib/server/hq-books";
import { PageHeader } from "@/components/admin";
import { BooksNav } from "@/components/hq/BooksNav";
import { ActionForm } from "@/components/FormMessage";
import { saveLockDate } from "@/lib/server/actions/hq-books";
import { fmtDate, londonDate } from "@/lib/dates";

export const metadata = { title: "Lock date" };

export default async function BookSettings() {
  const h = await requireHq("accounts.view");
  const lock = await lockDate();
  return (
    <div>
      <PageHeader title="Lock date" sub="Once a month, quarter or year is final (say, after your accountant has filed), lock it so nothing in it can change." />
      <BooksNav current="/platform/accounts/settings" />
      <div className="card max-w-lg">
        <p className="mb-3 text-sm">{lock ? <>The books are locked up to and including <b>{fmtDate(lock)}</b>.</> : "The books are not locked."}</p>
        {h.can("accounts.edit") ? (
          <ActionForm action={saveLockDate} className="space-y-3" submit="Save lock date">
            <label className="label">Lock everything dated on or before</label>
            <input type="date" name="lockDate" className="input" defaultValue={lock ? londonDate(lock) : ""} max={londonDate()} />
            <p className="text-xs text-slate-500">Leave it blank to unlock. Only the owner can unlock, or move the date back.</p>
          </ActionForm>
        ) : <p className="text-sm text-slate-500">Ask someone with Accounts access to change it.</p>}
      </div>
    </div>
  );
}

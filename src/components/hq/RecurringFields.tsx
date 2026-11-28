import { FREQUENCY_LABEL } from "@/lib/hq/labels";

/** The schedule part of the repeating invoice form. */
export function RecurringFields({ frequency, endDate, autoSend }: { frequency?: string; endDate?: string; autoSend?: boolean }) {
  return (
    <>
      <div><label className="label">How often</label><select name="frequency" className="input" defaultValue={frequency ?? "MONTHLY"}>{Object.entries(FREQUENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div><label className="label">Stop after (optional)</label><input type="date" name="endDate" className="input" defaultValue={endDate} /></div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="autoSend" defaultChecked={autoSend} /> Email each invoice to the client automatically (otherwise it&apos;s saved as a draft for you to check)</label>
    </>
  );
}

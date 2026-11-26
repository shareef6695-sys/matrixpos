import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { ensureChart } from "@/lib/server/accounting";
import { PageHeader } from "@/components/admin";
import { londonDate } from "@/lib/dates";
import { AccountsTabs } from "../Tabs";
import { MoveMoneyForm, JournalForm } from "./Forms";

export const metadata = { title: "Bank & cash" };

export default async function Money() {
  const s = await requireAdmin();
  await ensureChart(s.orgId);
  const accounts = await db.ledgerAccount.findMany({ where: { organizationId: s.orgId, archived: false }, orderBy: { code: "asc" } });
  const id = (k: string) => accounts.find((a) => a.systemKey === k)?.id ?? "";
  const fees = accounts.find((a) => a.code === "6400")?.id ?? id("GENERAL_EXPENSES");
  const presets = [
    { label: "Bank the cash from the safe", from: id("CASH_SAFE"), to: id("BANK") },
    { label: "Card payout arrived in the bank", from: id("CARD_CLEARING"), to: id("BANK") },
    { label: "Card fees deducted by the provider", from: id("CARD_CLEARING"), to: fees },
    { label: "Owner put money into the business", from: id("CAPITAL"), to: id("BANK") },
    { label: "Owner took money out (drawings)", from: id("BANK"), to: id("DRAWINGS") },
    { label: "Pay VAT to HMRC", from: id("BANK"), to: id("VAT_OUTPUT") },
    { label: "Other", from: "", to: "" },
  ];
  const opts = accounts.map((a) => ({ id: a.id, label: `${a.code} ${a.name}` }));
  return (
    <div>
      <PageHeader title="Bank & cash" sub="Record money moving between accounts. Till sales, refunds and cash drops are booked automatically." />
      <AccountsTabs current="/admin/accounts/money" />
      <div className="grid gap-6 xl:grid-cols-2">
        <MoveMoneyForm today={londonDate()} presets={presets} accounts={opts} />
        {s.role === "OWNER" && <JournalForm today={londonDate()} accounts={opts} />}
      </div>
    </div>
  );
}

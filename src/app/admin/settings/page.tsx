import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader } from "@/components/admin";
import { SettingsForm } from "./SettingsForm";
import { PLAN_FEATURES, planAllows } from "@/lib/plans";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const s = await requireAdmin("OWNER");
  const [org, st] = await Promise.all([
    db.organization.findUnique({ where: { id: s.orgId } }),
    db.orgSettings.upsert({ where: { organizationId: s.orgId }, create: { organizationId: s.orgId }, update: {} }),
  ]);
  const { stripeSecretKey, sumupApiKey, sumupMerchantCode, dojoApiKey, ...flags } = st;
  return (
    <div>
      <PageHeader title="Settings" sub="Switch on only what your shop needs. Everything else stays out of the way at the till." />
      <SettingsForm
        org={{ name: org!.name, vatNumber: org!.vatNumber ?? "", companyNo: org!.companyNo ?? "", receiptFooter: org!.receiptFooter ?? "" }}
        flags={flags}
        locked={PLAN_FEATURES.filter((x) => !planAllows(org!.plan, x))}
        keys={{ stripe: !!stripeSecretKey, sumup: !!sumupApiKey, sumupMerchant: sumupMerchantCode ?? "", dojo: !!dojoApiKey }}
      />
    </div>
  );
}

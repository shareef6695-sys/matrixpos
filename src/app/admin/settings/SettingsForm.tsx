"use client";
import { useActionState } from "react";
import { saveSettings } from "@/lib/server/actions/admin";

type Flags = Record<string, unknown> & {
  enableCash: boolean; enableCardManual: boolean; enableStripeTerminal: boolean; enableSumUp: boolean; enableDojo: boolean;
  enablePromotions: boolean; enableAgeCheck: boolean; enableWeighedItems: boolean; enableStockControl: boolean; enableLoyalty: boolean; enableOfflineMode: boolean; enableAccounting: boolean;
  requireManagerForRefund: boolean; requireManagerForVoid: boolean; embeddedBarcodeMode: string; ageCheckThreshold: number; loyaltyPointsPerPound: number;
};

function Toggle({ name, label, desc, on }: { name: string; label: string; desc: string; on: boolean }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg p-3 hover:bg-slate-50">
      <span><span className="block font-medium">{label}</span><span className="text-sm text-slate-500">{desc}</span></span>
      <input type="checkbox" name={name} defaultChecked={on} className="peer sr-only" />
      <span className="relative mt-1 h-6 w-11 shrink-0 rounded-full bg-slate-300 transition after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:bg-brand-600 peer-checked:after:translate-x-5" />
    </label>
  );
}

export function SettingsForm({ org, flags: f, keys }: { org: { name: string; vatNumber: string; companyNo: string; receiptFooter: string }; flags: Flags; keys: { stripe: boolean; sumup: boolean; sumupMerchant: string; dojo: boolean } }) {
  const [state, action, pending] = useActionState(saveSettings, undefined);
  const keyHint = (set: boolean) => (set ? "Saved. Leave blank to keep, or type - to remove." : "Not set");
  return (
    <form action={action} className="grid max-w-5xl gap-6 lg:grid-cols-2">
      <div className="card space-y-3 lg:col-span-2">
        <h2 className="font-semibold">Business details (printed on receipts)</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label">Business name</label><input name="name" className="input" defaultValue={org.name} /></div>
          <div><label className="label">VAT number</label><input name="vatNumber" className="input" defaultValue={org.vatNumber} placeholder="GB123456789" /></div>
          <div><label className="label">Company number</label><input name="companyNo" className="input" defaultValue={org.companyNo} /></div>
        </div>
        <div><label className="label">Receipt footer</label><textarea name="receiptFooter" className="input" rows={2} defaultValue={org.receiptFooter} /></div>
      </div>

      <div className="card">
        <h2 className="mb-1 font-semibold">Ways to pay</h2>
        <Toggle name="enableCash" label="Cash" desc="Change calculation, float, cash in/out and drawer count" on={f.enableCash} />
        <Toggle name="enableCardManual" label="Card on a separate machine" desc="Any card terminal: the cashier keys the amount and confirms" on={f.enableCardManual} />
        <Toggle name="enableStripeTerminal" label="Stripe Terminal" desc="Amount sent straight to a Stripe reader" on={f.enableStripeTerminal} />
        <Toggle name="enableSumUp" label="SumUp" desc="Amount sent to a SumUp Solo reader" on={f.enableSumUp} />
        <Toggle name="enableDojo" label="Dojo" desc="Amount sent to a Dojo card machine" on={f.enableDojo} />
      </div>

      <div className="card">
        <h2 className="mb-1 font-semibold">Features</h2>
        <Toggle name="enablePromotions" label="Offers" desc="Meal deals, multibuys, BOGOF, % off" on={f.enablePromotions} />
        <Toggle name="enableAgeCheck" label="Age checks" desc="Challenge prompt for age-restricted products" on={f.enableAgeCheck} />
        <Toggle name="enableWeighedItems" label="Weighed goods" desc="Price per kg, scale labels" on={f.enableWeighedItems} />
        <Toggle name="enableStockControl" label="Stock control" desc="Stock counts, low stock alerts, purchase orders" on={f.enableStockControl} />
        <Toggle name="enableLoyalty" label="Loyalty" desc="Customer cards and points" on={f.enableLoyalty} />
        <Toggle name="enableAccounting" label="Accounts" desc="Bookkeeping, bills, profit and loss, VAT return" on={f.enableAccounting} />
        <Toggle name="enableOfflineMode" label="Offline selling" desc="Keep selling when the internet drops and sync later" on={f.enableOfflineMode} />
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Till rules</h2>
        <Toggle name="requireManagerForRefund" label="Refunds need a manager PIN" desc="Cashiers can't refund on their own" on={f.requireManagerForRefund} />
        <Toggle name="requireManagerForVoid" label="Voiding a sale needs a supervisor PIN" desc="" on={f.requireManagerForVoid} />
        <div className="grid gap-3 px-3 sm:grid-cols-3">
          <div><label className="label">Age policy</label><select name="ageCheckThreshold" className="input" defaultValue={f.ageCheckThreshold}><option value={25}>Challenge 25</option><option value={21}>Challenge 21</option></select></div>
          <div><label className="label">Scale labels</label><select name="embeddedBarcodeMode" className="input" defaultValue={f.embeddedBarcodeMode}><option value="PRICE">Price in barcode</option><option value="WEIGHT">Weight in barcode</option><option value="OFF">Not used</option></select></div>
          <div><label className="label">Points per £1</label><input name="loyaltyPointsPerPound" type="number" min={0} max={100} className="input" defaultValue={f.loyaltyPointsPerPound} /></div>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Card provider keys</h2>
        <p className="text-sm text-slate-500">Stored on your server only. Never sent to the till. Use test keys first.</p>
        <div><label className="label">Stripe secret key</label><input name="stripeSecretKey" type="password" className="input" placeholder={keyHint(keys.stripe)} autoComplete="off" /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">SumUp API key</label><input name="sumupApiKey" type="password" className="input" placeholder={keyHint(keys.sumup)} autoComplete="off" /></div>
          <div><label className="label">SumUp merchant code</label><input name="sumupMerchantCode" className="input" placeholder={keys.sumupMerchant || "Not set"} /></div>
        </div>
        <div><label className="label">Dojo API key</label><input name="dojoApiKey" type="password" className="input" placeholder={keyHint(keys.dojo)} autoComplete="off" /></div>
        <p className="text-xs text-slate-500">Then link each reader to a till under Stores &amp; tills.</p>
      </div>

      <div className="flex items-center gap-3 lg:col-span-2">
        <button className="btn-primary px-6" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
        {state?.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}

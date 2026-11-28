"use client";
import { PoweredBy } from "@/components/PoweredBy";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { priceBasket, type CartLine } from "@/lib/pos/pricing";
import { parseEmbeddedBarcode, parseScanInput } from "@/lib/pos/barcode";
import { formatGBP, formatWeight, parseGBP } from "@/lib/pos/money";
import { VAT_LETTERS } from "@/lib/pos/vat";
import { Logo } from "@/components/Logo";
import { Keypad, Modal, beep } from "./ui";
import { PaymentModal } from "./PaymentModal";
import { Receipt } from "./Receipt";
import { enqueue, flush, loadBootstrap, nextReceiptNo, queued, saveBootstrap, clearBootstrap } from "./offline";
import type { Bootstrap, QueuedSale, Tender, TillProduct } from "./types";

const uuid = () => crypto.randomUUID();
const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) }));

type Line = CartLine & { stock?: number | null };
type Overlay =
  | null
  | { kind: "weight"; product: TillProduct }
  | { kind: "age"; age: number }
  | { kind: "pay" }
  | { kind: "receipt"; sale: QueuedSale }
  | { kind: "override"; title: string; action: string; then: (approverName: string, token?: string | null) => void }
  | { kind: "price"; lineId: string }
  | { kind: "qty"; lineId: string }
  | { kind: "refund" }
  | { kind: "customer" }
  | { kind: "menu" }
  | { kind: "report"; report: Report | null; closing?: boolean }
  | { kind: "cash"; direction: 1 | -1 }
  | { kind: "lookup" }
  | { kind: "misc" };

interface Report {
  shift: { id: string; openedAt: string; closedAt: string | null; zNumber: number | null; user: string; register: string; store: string; openingFloatPence: number; countedCashPence: number | null };
  salesTotal: number; refundsTotal: number; netTotal: number; salesCount: number; refundsCount: number; discounts: number;
  byMethod: Record<string, number>; changeGiven: number; cashMovements: number; expectedCash: number;
  vat: Record<string, { grossPence: number; vatPence: number; vatRate: number }>;
}

export function TillApp() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [state, setState] = useState<"loading" | "setup" | "pin" | "shift" | "sell">("loading");
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);

  const notify = useCallback((text: string, bad = false) => {
    setToast({ text, bad });
    setTimeout(() => setToast(null), 2600);
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/till/bootstrap", { cache: "no-store" });
      const b = (await r.json()) as Bootstrap;
      if (!b.device) { await clearBootstrap(); setBoot(null); setState("setup"); return; }
      await saveBootstrap(b);
      setBoot(b);
      setOnline(true);
      setState(!b.user ? "pin" : !b.shift ? "shift" : "sell");
    } catch {
      // Offline: carry on with the last catalogue and signed-in cashier.
      const b = await loadBootstrap();
      setOnline(false);
      if (!b) { setState("setup"); return; }
      setBoot(b);
      setState(b.user && b.shift && b.settings.enableOfflineMode ? "sell" : "pin");
    }
  }, []);

  useEffect(() => {
    load();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const sync = async () => {
      const r = await flush();
      setPending(r.remaining);
      setOnline(navigator.onLine);
    };
    sync();
    const t = setInterval(sync, 15000);
    const on = () => { setOnline(true); sync(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { clearInterval(t); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [load]);

  if (state === "loading") return <Splash text="Starting till…" />;
  if (state === "setup") return <DeviceSetup onDone={load} />;
  if (!boot) return <Splash text="Loading…" />;
  if (state === "pin") return <PinScreen boot={boot} online={online} onDone={load} />;
  if (state === "shift") return <OpenShift boot={boot} onDone={load} onSignOut={async () => { await post("/api/till/logout", {}); load(); }} />;

  return (
    <>
      <Selling boot={boot} online={online} pending={pending} setPending={setPending} notify={notify} reload={load} />
      {toast && (
        <div className={`no-print fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl px-5 py-3 font-semibold text-white shadow-xl ${toast.bad ? "bg-red-600" : "bg-slate-900"}`}>{toast.text}</div>
      )}
    </>
  );
}

function Splash({ text }: { text: string }) {
  return <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-900 text-white"><Logo className="text-3xl text-white" /><p className="text-slate-400">{text}</p></div>;
}

// ---------------- Device setup ----------------

function DeviceSetup({ onDone }: { onDone: () => void }) {
  const [stores, setStores] = useState<{ id: string; name: string; code: string; registers: { id: string; name: string }[] }[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/till/device").then(async (r) => {
      const b = await r.json();
      if (!r.ok) setError(b.error); else setStores(b.stores);
    }).catch(() => setError("You're offline. Connect to the internet to set up this till."));
  }, []);
  const choose = async (registerId: string) => {
    const r = await post("/api/till/device", { registerId });
    if (r.ok) onDone(); else setError(r.body.error);
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="card w-full max-w-lg">
        <Logo className="mb-4 text-2xl" />
        <h1 className="text-xl font-bold">Set up this device as a till</h1>
        <p className="mt-1 text-sm text-slate-600">Any tablet, laptop or PC with a browser works. Plug in a USB or Bluetooth barcode scanner and it will just work.</p>
        {error && (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {error} <a className="font-semibold underline" href="/login?next=/till">Sign in as a manager</a>
          </div>
        )}
        {stores?.map((s) => (
          <div key={s.id} className="mt-4">
            <div className="label">{s.name} ({s.code})</div>
            <div className="grid grid-cols-2 gap-2">
              {s.registers.map((r) => <button key={r.id} onClick={() => choose(r.id)} className="btn-secondary h-14">{r.name}</button>)}
            </div>
          </div>
        ))}
        {stores?.length === 0 && <p className="mt-4 text-sm">Add a store and till in the back office first.</p>}
      </div>
    </div>
  );
}

// ---------------- PIN ----------------

function PinScreen({ boot, online, onDone }: { boot: Bootstrap; online: boolean; onDone: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (pin.length < 4 || busy) return;
    setBusy(true);
    try {
      const r = await post("/api/till/pin", { pin });
      if (r.ok) onDone(); else { setError(r.body.error ?? "PIN not recognised"); beep(false); }
    } catch { setError("You're offline. Signing in needs a connection."); }
    setPin("");
    setBusy(false);
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 text-center">
          <Logo className="text-xl" />
          <div className="mt-2 text-sm text-slate-500">{boot.org.name} · {boot.store.name} · {boot.register.name}</div>
          {!online && <div className="mt-2 rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">Offline</div>}
        </div>
        <p className="mb-2 text-center font-semibold">Enter your PIN</p>
        <Keypad value={pin} onChange={(v) => { setError(""); setPin(v); }} onEnter={submit} mask maxLength={6} enterLabel={busy ? "Checking…" : "Sign in"} />
        {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-between text-xs text-slate-400">
          <a href="/admin" className="hover:text-slate-700">Back office</a>
          <button onClick={async () => { if (confirm("Unlink this device from the till?")) { await fetch("/api/till/device", { method: "DELETE" }); location.reload(); } }} className="hover:text-slate-700">Unlink device</button>
        </div>
        <PoweredBy className="mt-4 text-center" link={false} />
      </div>
    </div>
  );
}

function OpenShift({ boot, onDone, onSignOut }: { boot: Bootstrap; onDone: () => void; onSignOut: () => void }) {
  const [v, setV] = useState("");
  const amount = v ? parseGBP(v.includes(".") ? v : (parseInt(v, 10) / 100).toFixed(2)) ?? 0 : 0;
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h1 className="text-center text-xl font-bold">Open {boot.register.name}</h1>
        <p className="mb-4 text-center text-sm text-slate-500">Hi {boot.user?.name}. Count the cash float in the drawer.</p>
        <Keypad value={v} onChange={setV} decimal maxLength={8} enterLabel={`Open with ${formatGBP(amount)} float`} onEnter={async () => { await post("/api/till/shift", { action: "open", floatPence: amount }); onDone(); }} />
        <button onClick={onSignOut} className="btn-secondary mt-2 w-full">Sign out</button>
      </div>
    </div>
  );
}

// ---------------- Selling ----------------

function Selling({ boot, online, pending, setPending, notify, reload }: {
  boot: Bootstrap; online: boolean; pending: number; setPending: (n: number) => void; notify: (t: string, bad?: boolean) => void; reload: () => void;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [scan, setScan] = useState("");
  const [category, setCategory] = useState<string | "quick">("quick");
  const [ageVerified, setAgeVerified] = useState(false);
  const [customer, setCustomer] = useState<{ id: string; name: string; points: number } | null>(null);
  const [refundOf, setRefundOf] = useState<{ id: string; receiptNo: string } | null>(null);
  const [saleId, setSaleId] = useState(uuid);
  // Signed supervisor approvals for this sale; the server needs them to accept a discount or refund.
  const [approvals, setApprovals] = useState<string[]>([]);
  const [stock, setStock] = useState<Record<string, number | null>>(() => Object.fromEntries(boot.products.map((p) => [p.id, p.stock])));
  const scanRef = useRef<HTMLInputElement>(null);
  const s = boot.settings;
  const user = boot.user!;
  const isRefund = !!refundOf;

  const index = useMemo(() => {
    const barcode = new Map<string, { p: TillProduct; pack: number }>();
    const plu = new Map<string, TillProduct>();
    const sku = new Map<string, TillProduct>();
    for (const p of boot.products) {
      p.barcodes.forEach((b) => barcode.set(b.code, { p, pack: b.packQty }));
      if (p.plu) plu.set(p.plu, p);
      if (p.sku) sku.set(p.sku.toUpperCase(), p);
    }
    return { barcode, plu, sku };
  }, [boot.products]);

  const basket = useMemo(() => {
    if (isRefund) {
      // Refunds use the prices actually paid on the original receipt.
      const b = priceBasket(lines, []);
      return b;
    }
    return priceBasket(lines, s.enablePromotions ? boot.promotions : []);
  }, [lines, boot.promotions, s.enablePromotions, isRefund]);

  // Keep focus on the scan box so any keyboard-style scanner works without clicking.
  useEffect(() => {
    if (overlay) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) scanRef.current?.focus();
      if (e.key === "F12" || (e.key === "Enter" && e.ctrlKey)) { e.preventDefault(); if (lines.length) startPayment(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  useEffect(() => { if (!overlay) scanRef.current?.focus(); }, [overlay]);

  function addLine(p: TillProduct, opts: { qty?: number; grams?: number; fixedPricePence?: number } = {}) {
    if (isRefund) { notify("Finish or cancel the refund first", true); return; }
    if (p.unit === "PER_KG" && opts.grams == null && opts.fixedPricePence == null) {
      if (!s.enableWeighedItems) { notify("Weighed items are switched off", true); return; }
      setOverlay({ kind: "weight", product: p });
      return;
    }
    beep();
    setLines((prev) => {
      if (p.unit === "EACH" && opts.fixedPricePence == null) {
        const existing = prev.find((l) => l.productId === p.id && l.fixedPricePence == null && !l.manualDiscountPence);
        if (existing) {
          setSelected(existing.lineId);
          return prev.map((l) => (l === existing ? { ...l, quantity: l.quantity + (opts.qty ?? 1) } : l));
        }
      }
      const lineId = uuid();
      setSelected(lineId);
      const grams = opts.grams ?? (opts.fixedPricePence != null && p.unit === "PER_KG" ? Math.round((opts.fixedPricePence * 1000) / Math.max(1, p.pricePence)) : undefined);
      return [...prev, {
        lineId, productId: p.id, name: p.name, unit: p.unit, quantity: p.unit === "PER_KG" ? grams ?? 0 : opts.qty ?? 1,
        unitPricePence: p.pricePence, vatCode: p.vatCode, minAge: s.enableAgeCheck ? p.minAge : null,
        fixedPricePence: opts.fixedPricePence ?? null, stock: stock[p.id],
      }];
    });
    setAgeVerified((v) => (p.minAge ? false : v));
  }

  function onScan(raw: string) {
    const { quantity, code } = parseScanInput(raw);
    if (!code) return;
    const hit = index.barcode.get(code);
    if (hit) return addLine(hit.p, { qty: quantity * hit.pack });
    const emb = parseEmbeddedBarcode(code, s.embeddedBarcodeMode);
    if (emb) {
      const p = index.plu.get(emb.plu);
      if (p) return emb.mode === "PRICE" ? addLine(p, { fixedPricePence: emb.value }) : addLine(p, { grams: emb.value });
    }
    const byPlu = index.plu.get(code) ?? index.sku.get(code.toUpperCase());
    if (byPlu) return addLine(byPlu, { qty: quantity });
    beep(false);
    if (/[a-z]/i.test(code)) { setCategory("search"); return; }
    notify(`Item not found: ${code}`, true);
  }

  const visibleProducts = useMemo(() => {
    const q = scan.trim().toLowerCase();
    if (q.length >= 2 && /[a-z]/i.test(q)) return boot.products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 40);
    if (category === "quick") return boot.products.filter((p) => p.quickKey);
    return boot.products.filter((p) => p.categoryId === category);
  }, [scan, category, boot.products]);

  const sel = lines.find((l) => l.lineId === selected) ?? null;

  function needsOverride(setting: boolean) {
    return setting && user.role === "CASHIER";
  }

  function withOverride(title: string, action: string, setting: boolean, fn: (approver: string) => void) {
    if (needsOverride(setting)) setOverlay({ kind: "override", title, action, then: (name, token) => { if (token) setApprovals((a) => [...a, token]); fn(name); } });
    else fn(user.name);
  }

  function clearSale() {
    setLines([]); setSelected(null); setAgeVerified(false); setCustomer(null); setRefundOf(null); setSaleId(uuid()); setApprovals([]); setScan("");
  }

  function startPayment() {
    if (!lines.length) return;
    if (lines.some((l) => l.unit === "PER_KG" && l.quantity === 0 && l.fixedPricePence == null)) { notify("Weigh all loose items first", true); return; }
    if (!isRefund && s.enableAgeCheck && basket.requiredAge > 0 && !ageVerified) { setOverlay({ kind: "age", age: basket.requiredAge }); return; }
    setOverlay({ kind: "pay" });
  }

  async function complete(tenders: Tender[], changePence: number) {
    const sign = isRefund ? -1 : 1;
    const receiptNo = await nextReceiptNo(boot.store.code, boot.register.number, boot.lastSeq);
    const names = new Map(basket.promotions.map((p) => [p.name, p]));
    const sale: QueuedSale = {
      id: saleId, receiptNo, kind: isRefund ? "REFUND" : "SALE", originalSaleId: refundOf?.id ?? null, shiftId: boot.shift?.id ?? null, userId: user.id,
      customerId: customer?.id ?? null, createdAt: new Date().toISOString(),
      subtotalPence: sign * basket.subtotalPence, discountPence: sign * basket.discountPence, totalPence: sign * basket.totalPence, vatPence: sign * basket.vatPence,
      changePence, ageVerified,
      lines: basket.lines.map((l) => ({
        productId: l.productId, name: l.name, quantity: sign * l.quantity, unit: l.unit, unitPricePence: l.unitPricePence,
        grossPence: sign * l.grossPence, discountPence: sign * l.discountPence, netPence: sign * l.netPence, vatCode: l.vatCode, vatRate: l.vatRate,
        promotionName: l.promotionNames.join(", ") || (l.manualDiscountPence ? "Staff discount" : null),
      })),
      vat: basket.vat.map((v) => ({ vatCode: v.vatCode, vatRate: v.vatRate, grossPence: sign * v.grossPence, vatPence: sign * v.vatPence })),
      payments: tenders.map((t) => ({ ...t, amountPence: sign * t.amountPence })),
      pricingId: boot.pricingId ?? null, cashierProof: boot.cashierProof ?? null, approvals,
      _cashier: user.name, _promotions: [...names.values()].map((p) => ({ name: p.name, savingPence: p.savingPence })), _customer: customer?.name ?? null,
    };
    await enqueue(sale);
    // Update local stock so the till shows live counts even when offline.
    setStock((st) => {
      const next = { ...st };
      for (const l of basket.lines) if (l.productId && next[l.productId] != null) next[l.productId] = (next[l.productId] as number) - sign * l.quantity;
      return next;
    });
    flush().then((r) => setPending(r.remaining)).catch(() => {});
    queued().then((q) => setPending(q.length));
    setOverlay({ kind: "receipt", sale });
    clearSale();
  }

  async function showReport(closing = false) {
    try {
      await flush();
      const r = await fetch("/api/till/shift").then((x) => x.json());
      setOverlay({ kind: "report", report: r.report, closing });
    } catch { notify("Reports need a connection", true); }
  }

  const signOut = async () => {
    if (lines.length && !confirm("There is an unfinished sale. Sign out anyway?")) return;
    await post("/api/till/logout", {}).catch(() => {});
    reload();
  };

  return (
    <div className="flex h-dvh flex-col bg-slate-100 lg:flex-row">
      {/* Basket */}
      <section className="flex min-h-0 flex-1 flex-col border-r border-slate-200 bg-white lg:w-[420px] lg:flex-none xl:w-[460px]">
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-900 px-4 py-2 text-white">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{boot.store.name} · {boot.register.name}</div>
            <div className="truncate text-xs text-slate-400">{user.name}{customer ? ` · ${customer.name} (${customer.points} pts)` : ""}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`badge ${online ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>{online ? "Online" : "Offline"}</span>
            {pending > 0 && <span className="badge bg-sky-500/20 text-sky-300">{pending} to sync</span>}
            <button onClick={() => setOverlay({ kind: "menu" })} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20">Menu</button>
          </div>
        </header>
        {isRefund && <div className="bg-red-600 px-4 py-1.5 text-sm font-semibold text-white">Refund against receipt {refundOf!.receiptNo}</div>}
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {basket.lines.length === 0 && <li className="p-10 text-center text-slate-400">Scan an item or tap a product to start</li>}
          {basket.lines.map((l) => (
            <li key={l.lineId} onClick={() => setSelected(l.lineId)} className={`cursor-pointer border-b border-slate-100 px-4 py-2.5 ${selected === l.lineId ? "bg-brand-50" : ""}`}>
              <div className="flex justify-between gap-3">
                <span className="font-medium">{l.name}{l.minAge ? <span className="badge ml-2 bg-red-100 text-red-700">{l.minAge}+</span> : null}</span>
                <span className="font-semibold tabular-nums">{formatGBP(l.grossPence)} <span className="text-xs text-slate-400">{VAT_LETTERS[l.vatCode]}</span></span>
              </div>
              <div className="text-xs text-slate-500">
                {l.fixedPricePence != null ? "Price from label" : l.unit === "PER_KG" ? `${formatWeight(l.quantity)} @ ${formatGBP(l.unitPricePence)}/kg` : `${l.quantity} × ${formatGBP(l.unitPricePence)}`}
                {l.stock != null && s.enableStockControl && l.stock - (l.unit === "EACH" ? l.quantity : 0) < 0 && <span className="ml-2 text-amber-600">low stock</span>}
              </div>
              {l.discountPence > 0 && (
                <div className="flex justify-between text-xs font-semibold text-emerald-700"><span>{l.promotionNames.join(", ") || "Discount"}</span><span>-{formatGBP(l.discountPence)}</span></div>
              )}
            </li>
          ))}
        </ul>
        {/* Line actions */}
        <div className="grid grid-cols-5 gap-1 border-t border-slate-200 p-2 text-xs">
          <ActionBtn disabled={!sel || sel.unit !== "EACH" || isRefund} onClick={() => sel && setLines((p) => p.map((l) => (l.lineId === sel.lineId ? { ...l, quantity: Math.max(1, l.quantity - 1) } : l)))}>−1</ActionBtn>
          <ActionBtn disabled={!sel || sel.unit !== "EACH" || isRefund} onClick={() => sel && setLines((p) => p.map((l) => (l.lineId === sel.lineId ? { ...l, quantity: l.quantity + 1 } : l)))}>+1</ActionBtn>
          <ActionBtn disabled={!sel || sel.unit !== "EACH" || isRefund} onClick={() => sel && setOverlay({ kind: "qty", lineId: sel.lineId })}>Qty</ActionBtn>
          <ActionBtn disabled={!sel || isRefund} onClick={() => sel && withOverride("Approve discount", "discount", true, () => setOverlay({ kind: "price", lineId: sel.lineId }))}>Discount</ActionBtn>
          <ActionBtn danger disabled={!sel} onClick={() => { if (!sel) return; setLines((p) => p.filter((l) => l.lineId !== sel.lineId)); setSelected(null); }}>Remove</ActionBtn>
        </div>
        {/* Totals */}
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
          {basket.discountPence > 0 && <div className="flex justify-between text-sm text-emerald-700"><span>Savings</span><span>-{formatGBP(basket.discountPence)}</span></div>}
          <div className="flex justify-between text-sm text-slate-500"><span>VAT included</span><span>{formatGBP(basket.vatPence)}</span></div>
          <div className="flex items-end justify-between">
            <span className="text-sm text-slate-500">{basket.itemCount} item{basket.itemCount === 1 ? "" : "s"}</span>
            <span className="text-3xl font-extrabold tabular-nums">{isRefund ? "-" : ""}{formatGBP(basket.totalPence)}</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <button disabled={!lines.length} onClick={() => withOverride("Approve voiding the sale", "void-sale", s.requireManagerForVoid, clearSale)} className="btn-secondary h-14">Void</button>
            <button disabled={!lines.length} onClick={startPayment} className={`col-span-2 h-14 rounded-xl text-xl font-bold text-white disabled:opacity-40 ${isRefund ? "bg-red-600" : "bg-brand-700 hover:bg-brand-800"}`}>
              {isRefund ? "Refund" : "Pay"} {formatGBP(basket.totalPence)}
            </button>
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="flex min-h-0 flex-[1.4] flex-col">
        <form onSubmit={(e) => { e.preventDefault(); onScan(scan); if (!/[a-z]/i.test(scan)) setScan(""); }} className="flex gap-2 p-3">
          <input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan barcode, type PLU, or search (e.g. 6*barcode)" className="input h-12 text-base" autoComplete="off" autoFocus />
          <button className="btn-primary h-12 px-5">Enter</button>
        </form>
        <div className="flex gap-2 overflow-x-auto px-3 pb-2">
          <CatBtn active={category === "quick" && !scan} onClick={() => { setScan(""); setCategory("quick"); }} color="#0f766e">★ Quick</CatBtn>
          {boot.categories.map((c) => <CatBtn key={c.id} active={category === c.id && !scan} onClick={() => { setScan(""); setCategory(c.id); }} color={c.color}>{c.name}</CatBtn>)}
        </div>
        <div className="grid min-h-0 flex-1 auto-rows-[96px] grid-cols-2 gap-2 overflow-y-auto p-3 pt-1 sm:grid-cols-3 xl:grid-cols-4">
          {visibleProducts.map((p) => {
            const c = boot.categories.find((x) => x.id === p.categoryId)?.color ?? "#64748b";
            return (
              <button key={p.id} onClick={() => { addLine(p); setScan(""); }} className="relative flex flex-col justify-between overflow-hidden rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 active:scale-[.98]" style={{ borderTop: `4px solid ${c}` }}>
                <span className="line-clamp-2 text-sm font-semibold leading-tight">{p.name}</span>
                <span className="flex items-end justify-between">
                  <span className="font-bold text-brand-800">{formatGBP(p.pricePence)}{p.unit === "PER_KG" ? "/kg" : ""}</span>
                  {s.enableStockControl && stock[p.id] != null && <span className={`text-[10px] ${(stock[p.id] as number) <= 0 ? "text-red-600" : "text-slate-400"}`}>{p.unit === "PER_KG" ? `${((stock[p.id] as number) / 1000).toFixed(1)}kg` : stock[p.id]}</span>}
                </span>
                {p.minAge && <span className="badge absolute right-1 top-1 bg-red-100 text-[10px] text-red-700">{p.minAge}+</span>}
              </button>
            );
          })}
          {visibleProducts.length === 0 && <p className="col-span-full p-6 text-center text-slate-400">No products here.</p>}
        </div>
      </section>

      {/* ---------- Overlays ---------- */}
      {overlay?.kind === "weight" && <WeightModal product={overlay.product} onClose={() => setOverlay(null)} onDone={(g) => { setOverlay(null); addLine(overlay.product, { grams: g }); }} />}

      {overlay?.kind === "age" && (
        <Modal title="Age check" onClose={() => setOverlay(null)}>
          <AgeCheck age={overlay.age} threshold={s.ageCheckThreshold} onOk={() => { setAgeVerified(true); setOverlay({ kind: "pay" }); }}
            onRefuse={() => { setLines((p) => p.filter((l) => !l.minAge)); setOverlay(null); notify("Age-restricted items removed"); }} />
        </Modal>
      )}

      {overlay?.kind === "pay" && (
        <PaymentModal boot={boot} totalPence={basket.totalPence} saleId={saleId} refund={isRefund} onCancel={() => setOverlay(null)} onComplete={complete} />
      )}

      {overlay?.kind === "receipt" && (
        <Modal title={overlay.sale.changePence > 0 ? `Change due ${formatGBP(overlay.sale.changePence)}` : overlay.sale.kind === "REFUND" ? "Refund complete" : "Sale complete"} onClose={() => setOverlay(null)}>
          {overlay.sale.changePence > 0 && <div className="mb-4 rounded-2xl bg-emerald-50 p-4 text-center"><div className="text-sm text-emerald-700">Give change</div><div className="text-5xl font-extrabold text-emerald-800">{formatGBP(overlay.sale.changePence)}</div></div>}
          <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-slate-200"><Receipt sale={overlay.sale} boot={boot} /></div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="btn-secondary h-12" onClick={() => window.print()}>Print receipt</button>
            <button className="btn-primary h-12" onClick={() => setOverlay(null)} autoFocus>Next customer</button>
          </div>
        </Modal>
      )}

      {overlay?.kind === "override" && (
        <OverrideModal title={overlay.title} action={overlay.action} saleId={saleId} onClose={() => setOverlay(null)} onApproved={(name, token) => { const fn = overlay.then; setOverlay(null); fn(name, token); }} />
      )}

      {overlay?.kind === "qty" && (
        <NumberModal title="Quantity" onClose={() => setOverlay(null)} onDone={(n) => { setLines((p) => p.map((l) => (l.lineId === overlay.lineId ? { ...l, quantity: Math.max(1, n) } : l))); setOverlay(null); }} />
      )}

      {overlay?.kind === "price" && (() => {
        const l = basket.lines.find((x) => x.lineId === overlay.lineId);
        if (!l) return null;
        return (
          <DiscountModal line={l} onClose={() => setOverlay(null)} onDone={(pence) => { setLines((p) => p.map((x) => (x.lineId === l.lineId ? { ...x, manualDiscountPence: pence } : x))); setOverlay(null); }} />
        );
      })()}

      {overlay?.kind === "customer" && (
        <CustomerModal onClose={() => setOverlay(null)} onPick={(c) => { setCustomer(c); setOverlay(null); notify(`${c.name} added`); }} />
      )}

      {overlay?.kind === "refund" && (
        <RefundModal onClose={() => setOverlay(null)} onPick={(sale, picked) => {
          setRefundOf({ id: sale.id, receiptNo: sale.receiptNo });
          setLines(picked);
          setOverlay(null);
        }} />
      )}

      {overlay?.kind === "cash" && (
        <CashMoveModal direction={overlay.direction} needsApproval={overlay.direction < 0 && user.role === "CASHIER"} onClose={() => setOverlay(null)} onDone={() => { setOverlay(null); notify("Recorded"); }} />
      )}

      {overlay?.kind === "report" && (
        <ReportModal report={overlay.report} closing={overlay.closing} canClose={user.role !== "CASHIER"} onClose={() => setOverlay(null)} onClosed={() => { setOverlay(null); reload(); }} />
      )}

      {overlay?.kind === "menu" && (
        <Modal title="Menu" onClose={() => setOverlay(null)}>
          <div className="grid grid-cols-2 gap-2">
            {s.enableLoyalty && <MenuBtn onClick={() => setOverlay({ kind: "customer" })}>Loyalty customer</MenuBtn>}
            <MenuBtn onClick={() => { if (lines.length) { notify("Finish the current sale first", true); return; } withOverride("Approve refund", "refund", s.requireManagerForRefund, () => setOverlay({ kind: "refund" })); }}>Refund from receipt</MenuBtn>
            <MenuBtn onClick={() => setOverlay({ kind: "lookup" })}>Price check</MenuBtn>
            <MenuBtn onClick={() => setOverlay({ kind: "misc" })}>Open price item</MenuBtn>
            <MenuBtn onClick={() => withOverride("Approve no sale", "no-sale", true, () => { setOverlay(null); notify("Drawer opened (no sale)"); })}>No sale</MenuBtn>
            <MenuBtn onClick={() => setOverlay({ kind: "cash", direction: 1 })}>Cash in</MenuBtn>
            <MenuBtn onClick={() => setOverlay({ kind: "cash", direction: -1 })}>Cash out / safe drop</MenuBtn>
            <MenuBtn onClick={() => showReport(false)}>X report</MenuBtn>
            <MenuBtn onClick={() => showReport(true)}>Close till (Z report)</MenuBtn>
            <MenuBtn onClick={async () => { setOverlay(null); const r = await flush(); setPending(r.remaining); notify(r.remaining ? `${r.remaining} still waiting` : "All sales synced"); }}>Sync now</MenuBtn>
            <MenuBtn onClick={() => location.assign("/admin")}>Back office</MenuBtn>
            <MenuBtn onClick={signOut}>Sign out</MenuBtn>
          </div>
        </Modal>
      )}

      {overlay?.kind === "lookup" && <PriceCheck products={boot.products} index={index} onClose={() => setOverlay(null)} />}

      {overlay?.kind === "misc" && (
        <MiscItemModal onClose={() => setOverlay(null)} onDone={(name, pence, vatCode) => {
          setLines((p) => [...p, { lineId: uuid(), productId: null, name, unit: "EACH", quantity: 1, unitPricePence: pence, vatCode }]);
          setOverlay(null);
        }} />
      )}
    </div>
  );
}

// ---------------- Small pieces ----------------

function ActionBtn({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button disabled={disabled} onClick={onClick} className={`h-11 rounded-lg font-semibold ring-1 disabled:opacity-30 ${danger ? "text-red-700 ring-red-200" : "text-slate-700 ring-slate-200"}`}>{children}</button>;
}
function CatBtn({ children, active, onClick, color }: { children: React.ReactNode; active: boolean; onClick: () => void; color: string }) {
  return <button onClick={onClick} className="h-10 shrink-0 rounded-full px-4 text-sm font-semibold ring-1" style={active ? { background: color, color: "#fff", borderColor: color } : { background: "#fff", color: "#334155" }}>{children}</button>;
}
function MenuBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="h-16 rounded-xl bg-slate-50 px-3 text-sm font-semibold ring-1 ring-slate-200 hover:bg-slate-100">{children}</button>;
}

function WeightModal({ product, onClose, onDone }: { product: TillProduct; onClose: () => void; onDone: (grams: number) => void }) {
  const [v, setV] = useState("");
  const grams = Math.round(parseFloat(v || "0") * 1000);
  return (
    <Modal title={`Weigh: ${product.name}`} onClose={onClose}>
      <p className="mb-2 text-center text-sm text-slate-500">{formatGBP(product.pricePence)} per kg. Enter weight in kg from the scale.</p>
      <Keypad value={v} onChange={setV} decimal maxLength={6} onEnter={() => grams > 0 && onDone(grams)} enterLabel={grams > 0 ? `Add ${formatWeight(grams)} = ${formatGBP(Math.round((product.pricePence * grams) / 1000))}` : "Enter weight"} />
    </Modal>
  );
}

function AgeCheck({ age, threshold, onOk, onRefuse }: { age: number; threshold: number; onOk: () => void; onRefuse: () => void }) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-3xl font-extrabold text-red-700">{age}+</div>
      <p className="text-lg font-semibold">Challenge {threshold}: does the customer look under {threshold}?</p>
      <p className="text-slate-600">Ask for photo ID with a PASS hologram, a passport or a driving licence. They must be born on or before <b>{d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</b>.</p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onRefuse} className="btn-danger h-14">Refuse sale</button>
        <button onClick={onOk} className="btn-primary h-14">Age confirmed</button>
      </div>
    </div>
  );
}

function OverrideModal({ title, action, saleId, onClose, onApproved }: { title: string; action: string; saleId: string; onClose: () => void; onApproved: (name: string, token?: string | null) => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const go = async () => {
    const r = await post("/api/till/authorize", { pin, action, saleId }).catch(() => ({ ok: false, body: { error: "Needs a connection" } }));
    if (r.ok) onApproved(r.body.approver.name, r.body.token); else { setErr(r.body.error); setPin(""); beep(false); }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <p className="mb-2 text-center text-sm text-slate-500">A supervisor or manager enters their PIN</p>
      <Keypad value={pin} onChange={setPin} mask maxLength={6} onEnter={go} enterLabel="Approve" />
      {err && <p className="mt-2 text-center text-sm text-red-600">{err}</p>}
    </Modal>
  );
}

function NumberModal({ title, onClose, onDone }: { title: string; onClose: () => void; onDone: (n: number) => void }) {
  const [v, setV] = useState("");
  return <Modal title={title} onClose={onClose}><Keypad value={v} onChange={setV} maxLength={3} onEnter={() => v && onDone(parseInt(v, 10))} /></Modal>;
}

function DiscountModal({ line, onClose, onDone }: { line: { name: string; grossPence: number; discountPence: number }; onClose: () => void; onDone: (pence: number) => void }) {
  const [mode, setMode] = useState<"pct" | "gbp">("pct");
  const [v, setV] = useState("");
  const pence = mode === "pct" ? Math.round((line.grossPence * Math.min(100, parseInt(v || "0", 10))) / 100) : Math.min(line.grossPence, parseGBP(v.includes(".") ? v : ((parseInt(v || "0", 10)) / 100).toFixed(2)) ?? 0);
  return (
    <Modal title={`Discount: ${line.name}`} onClose={onClose}>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button onClick={() => { setMode("pct"); setV(""); }} className={mode === "pct" ? "btn-primary" : "btn-secondary"}>% off</button>
        <button onClick={() => { setMode("gbp"); setV(""); }} className={mode === "gbp" ? "btn-primary" : "btn-secondary"}>£ off</button>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {[10, 25, 50, 75].map((n) => <button key={n} onClick={() => { setMode("pct"); setV(String(n)); }} className="btn-secondary flex-1">{n}%</button>)}
      </div>
      <Keypad value={v} onChange={setV} decimal={mode === "gbp"} maxLength={mode === "pct" ? 3 : 7} onEnter={() => onDone(pence)} enterLabel={`Take ${formatGBP(pence)} off`} />
      <button onClick={() => onDone(0)} className="btn-secondary mt-2 w-full">Remove discount</button>
    </Modal>
  );
}

function MiscItemModal({ onClose, onDone }: { onClose: () => void; onDone: (name: string, pence: number, vat: "STANDARD" | "REDUCED" | "ZERO" | "EXEMPT") => void }) {
  const [v, setV] = useState("");
  const [name, setName] = useState("Miscellaneous");
  const [vat, setVat] = useState<"STANDARD" | "REDUCED" | "ZERO" | "EXEMPT">("STANDARD");
  const pence = v ? parseGBP(v.includes(".") ? v : (parseInt(v, 10) / 100).toFixed(2)) ?? 0 : 0;
  return (
    <Modal title="Open price item" onClose={onClose}>
      <input className="input mb-2" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="mb-3 grid grid-cols-4 gap-1">
        {(["STANDARD", "REDUCED", "ZERO", "EXEMPT"] as const).map((c) => <button key={c} onClick={() => setVat(c)} className={`h-10 rounded-lg text-xs font-semibold ring-1 ${vat === c ? "bg-brand-700 text-white" : "ring-slate-200"}`}>{c === "STANDARD" ? "20%" : c === "REDUCED" ? "5%" : c === "ZERO" ? "0%" : "Exempt"}</button>)}
      </div>
      <Keypad value={v} onChange={setV} decimal maxLength={7} onEnter={() => pence > 0 && onDone(name || "Miscellaneous", pence, vat)} enterLabel={`Add ${formatGBP(pence)}`} />
    </Modal>
  );
}

function PriceCheck({ products, index, onClose }: { products: TillProduct[]; index: { barcode: Map<string, { p: TillProduct }>; plu: Map<string, TillProduct> }; onClose: () => void }) {
  const [q, setQ] = useState("");
  const hit = index.barcode.get(q.trim())?.p ?? index.plu.get(q.trim());
  const list = hit ? [hit] : q.length >= 2 ? products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 10) : [];
  return (
    <Modal title="Price check" onClose={onClose}>
      <input autoFocus className="input mb-3 h-12" placeholder="Scan or type" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="divide-y">
        {list.map((p) => <li key={p.id} className="flex justify-between py-2"><span>{p.name}</span><b>{formatGBP(p.pricePence)}{p.unit === "PER_KG" ? "/kg" : ""}</b></li>)}
      </ul>
    </Modal>
  );
}

function CustomerModal({ onClose, onPick }: { onClose: () => void; onPick: (c: { id: string; name: string; points: number }) => void }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<{ id: string; name: string; loyaltyCode: string | null; points: number }[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.length < 3) return setList([]);
      fetch(`/api/till/customers?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((b) => setList(b.customers ?? [])).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Modal title="Loyalty customer" onClose={onClose}>
      <input autoFocus className="input mb-3 h-12" placeholder="Scan card, or search name, phone or email" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="divide-y">
        {list.map((c) => <li key={c.id}><button className="flex w-full justify-between py-3 text-left" onClick={() => onPick(c)}><span>{c.name} <span className="text-xs text-slate-400">{c.loyaltyCode}</span></span><b>{c.points} pts</b></button></li>)}
      </ul>
    </Modal>
  );
}

type FoundSale = { id: string; receiptNo: string; createdAt: string; totalPence: number; lines: { productId: string | null; name: string; quantity: number; unit: "EACH" | "PER_KG"; unitPricePence: number; grossPence: number; netPence: number; vatCode: "STANDARD" | "REDUCED" | "ZERO" | "EXEMPT" }[] };

function RefundModal({ onClose, onPick }: { onClose: () => void; onPick: (sale: FoundSale, lines: Line[]) => void }) {
  const [q, setQ] = useState("");
  const [sale, setSale] = useState<FoundSale | null>(null);
  const [refunded, setRefunded] = useState<Record<string, number>>({});
  const [qty, setQty] = useState<Record<number, number>>({});
  const [err, setErr] = useState("");
  const find = async () => {
    setErr("");
    const r = await fetch(`/api/till/sales?receipt=${encodeURIComponent(q)}`).then(async (x) => ({ ok: x.ok, b: await x.json() })).catch(() => ({ ok: false, b: { error: "Needs a connection" } }));
    if (!r.ok) { setErr(r.b.error); return; }
    setSale(r.b.sale);
    setRefunded(r.b.refunded);
    setQty({});
  };
  const build = (): Line[] => {
    if (!sale) return [];
    return sale.lines.flatMap((l, i) => {
      const n = qty[i] ?? 0;
      if (!n) return [];
      // Refund at the price actually paid (after offers), split per unit.
      const isWeighed = l.unit === "PER_KG";
      const perUnitNet = isWeighed ? l.netPence : Math.round(l.netPence / l.quantity);
      return [{ lineId: uuid(), productId: l.productId, name: l.name, unit: "EACH" as const, quantity: isWeighed ? 1 : n, unitPricePence: perUnitNet, vatCode: l.vatCode, fixedPricePence: isWeighed ? l.netPence : null }];
    });
  };
  return (
    <Modal title="Refund from receipt" onClose={onClose} wide>
      <form onSubmit={(e) => { e.preventDefault(); find(); }} className="mb-3 flex gap-2">
        <input autoFocus className="input h-12" placeholder="Scan or type receipt number, e.g. LDN1-1-000123" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary h-12">Find</button>
      </form>
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      {sale && (
        <>
          <p className="mb-2 text-sm text-slate-500">{new Date(sale.createdAt).toLocaleString("en-GB")} · {formatGBP(sale.totalPence)}</p>
          <table className="table">
            <thead><tr><th>Item</th><th>Paid</th><th>Bought</th><th>Refund</th></tr></thead>
            <tbody>
              {sale.lines.map((l, i) => {
                const max = Math.max(0, l.unit === "PER_KG" ? (refunded[l.productId ?? l.name] ? 0 : 1) : l.quantity - (refunded[l.productId ?? l.name] ?? 0));
                return (
                  <tr key={i}>
                    <td>{l.name}</td><td>{formatGBP(l.netPence)}</td><td>{l.unit === "PER_KG" ? formatWeight(l.quantity) : l.quantity}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button className="btn-secondary h-9 w-9 p-0" onClick={() => setQty((x) => ({ ...x, [i]: Math.max(0, (x[i] ?? 0) - 1) }))}>−</button>
                        <span className="w-6 text-center">{qty[i] ?? 0}</span>
                        <button className="btn-secondary h-9 w-9 p-0" disabled={(qty[i] ?? 0) >= max} onClick={() => setQty((x) => ({ ...x, [i]: Math.min(max, (x[i] ?? 0) + 1) }))}>+</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button className="btn-danger mt-4 h-12 w-full" disabled={!Object.values(qty).some(Boolean)} onClick={() => onPick(sale, build())}>Continue to refund</button>
        </>
      )}
    </Modal>
  );
}

function CashMoveModal({ direction, needsApproval, onClose, onDone }: { direction: 1 | -1; needsApproval: boolean; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState("");
  const [reason, setReason] = useState(direction > 0 ? "Float top-up" : "Safe drop");
  const [err, setErr] = useState("");
  // Cash leaving the drawer needs a supervisor's PIN when a cashier is signed in. The approval is for this one movement.
  const [moveId] = useState(() => crypto.randomUUID());
  const [pinStep, setPinStep] = useState(false);
  const [pin, setPin] = useState("");
  const pence = v ? parseGBP(v.includes(".") ? v : (parseInt(v, 10) / 100).toFixed(2)) ?? 0 : 0;
  const record = async (approval?: string | null) => {
    const r = await post("/api/till/shift", { action: "cash", amountPence: direction * pence, reason, moveId, approval }).catch(() => ({ ok: false, body: { error: "Needs a connection" } }));
    if (r.ok) onDone(); else setErr(r.body.error);
  };
  const approve = async () => {
    const r = await post("/api/till/authorize", { pin, action: "paidout", saleId: moveId, detail: `${formatGBP(pence)} ${reason}` }).catch(() => ({ ok: false, body: { error: "Needs a connection" } }));
    setPin("");
    if (r.ok) await record(r.body.token); else { setErr(r.body.error); beep(false); }
  };
  if (pinStep) return (
    <Modal title={`Approve cash out of ${formatGBP(pence)}`} onClose={onClose}>
      <p className="mb-2 text-center text-sm text-slate-500">A supervisor or manager enters their PIN</p>
      <Keypad value={pin} onChange={setPin} mask maxLength={6} onEnter={approve} enterLabel="Approve" />
      {err && <p className="mt-2 text-center text-sm text-red-600">{err}</p>}
    </Modal>
  );
  return (
    <Modal title={direction > 0 ? "Cash in" : "Cash out / safe drop"} onClose={onClose}>
      <input className="input mb-3" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
      <Keypad value={v} onChange={setV} decimal maxLength={8} enterLabel={`Record ${formatGBP(pence)}`} onEnter={async () => {
        if (!pence) return;
        if (needsApproval) { setErr(""); setPinStep(true); return; }
        await record();
      }} />
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </Modal>
  );
}

const METHOD: Record<string, string> = { CASH: "Cash", CARD_MANUAL: "Card (keyed)", STRIPE_TERMINAL: "Stripe", SUMUP: "SumUp", DOJO: "Dojo", VOUCHER: "Voucher" };

function ReportModal({ report, closing, canClose, onClose, onClosed }: { report: Report | null; closing?: boolean; canClose: boolean; onClose: () => void; onClosed: () => void }) {
  const [counted, setCounted] = useState("");
  const [final, setFinal] = useState<Report | null>(null);
  const r = final ?? report;
  if (!r) return <Modal title="Report" onClose={onClose}><p>No shift is open.</p></Modal>;
  const countedPence = counted ? parseGBP(counted.includes(".") ? counted : (parseInt(counted, 10) / 100).toFixed(2)) ?? 0 : 0;
  return (
    <Modal title={final ? `Z report #${final.shift.zNumber}` : closing ? "Close till" : "X report"} onClose={final ? onClosed : onClose} wide>
      <div className="print-area grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 text-sm">
          <div className="font-bold">{r.shift.store} · {r.shift.register}</div>
          <div>Opened {new Date(r.shift.openedAt).toLocaleString("en-GB")} by {r.shift.user}</div>
          {r.shift.closedAt && <div>Closed {new Date(r.shift.closedAt).toLocaleString("en-GB")}</div>}
          <hr className="my-2" />
          <Line2 l={`Sales (${r.salesCount})`} r={formatGBP(r.salesTotal)} />
          <Line2 l={`Refunds (${r.refundsCount})`} r={formatGBP(r.refundsTotal)} />
          <Line2 l="Net takings" r={formatGBP(r.netTotal)} bold />
          <Line2 l="Discounts given" r={formatGBP(r.discounts)} />
          <hr className="my-2" />
          {Object.entries(r.byMethod).map(([m, v]) => <Line2 key={m} l={METHOD[m] ?? m} r={formatGBP(v)} />)}
        </div>
        <div className="space-y-1 text-sm">
          <div className="font-bold">Cash drawer</div>
          <Line2 l="Opening float" r={formatGBP(r.shift.openingFloatPence)} />
          <Line2 l="Cash taken" r={formatGBP(r.byMethod.CASH ?? 0)} />
          <Line2 l="Change given" r={`-${formatGBP(r.changeGiven)}`} />
          <Line2 l="Cash in / out" r={formatGBP(r.cashMovements)} />
          <Line2 l="Expected in drawer" r={formatGBP(r.expectedCash)} bold />
          {r.shift.countedCashPence != null && <><Line2 l="Counted" r={formatGBP(r.shift.countedCashPence)} /><Line2 l="Over / short" r={formatGBP(r.shift.countedCashPence - r.expectedCash)} bold /></>}
          <hr className="my-2" />
          <div className="font-bold">VAT</div>
          {Object.entries(r.vat).map(([c, v]) => <Line2 key={c} l={`${c.toLowerCase()} ${v.vatRate / 100}%`} r={`${formatGBP(v.grossPence)} / VAT ${formatGBP(v.vatPence)}`} />)}
        </div>
      </div>
      {closing && !final && (
        canClose ? (
          <div className="no-print mt-5 border-t pt-4">
            <p className="mb-2 text-sm font-semibold">Count the cash in the drawer</p>
            <Keypad value={counted} onChange={setCounted} decimal maxLength={8} enterLabel={`Close till with ${formatGBP(countedPence)} counted`} onEnter={async () => {
              const res = await post("/api/till/shift", { action: "close", countedCashPence: countedPence });
              if (res.ok) setFinal(res.body.report);
            }} />
          </div>
        ) : <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">A supervisor or manager needs to sign in to close the till.</p>
      )}
      <div className="no-print mt-4 grid grid-cols-2 gap-2">
        <button className="btn-secondary h-12" onClick={() => window.print()}>Print</button>
        <button className="btn-primary h-12" onClick={final ? onClosed : onClose}>{final ? "Done" : "Close"}</button>
      </div>
    </Modal>
  );
}

function Line2({ l, r, bold }: { l: string; r: string; bold?: boolean }) {
  return <div className={`flex justify-between gap-4 ${bold ? "font-bold" : ""}`}><span className="capitalize">{l}</span><span className="tabular-nums">{r}</span></div>;
}

import Link from "next/link";
import { LegalPage, Contact } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";
import { TRIAL_DAYS } from "@/lib/plans";

export const metadata = { title: "Terms of service" };

export default function Terms() {
  return (
    <LegalPage title="Terms of service">
      <p>These terms are an agreement between {LEGAL.company} (&quot;we&quot;) and the business that signs up for {LEGAL.product} (&quot;you&quot;). By creating an account you accept them on behalf of your business. {LEGAL.product} is for business use, so consumer protection rules for individual buyers don&apos;t apply.</p>

      <h2>1. The service</h2>
      <p>{LEGAL.product} is point of sale and back office software that runs in a web browser. We may improve and change features over time. We&apos;ll give you reasonable notice of any change that removes something important you rely on.</p>

      <h2>2. Trial, plans and payment</h2>
      <ul>
        <li>New accounts get a free trial of {TRIAL_DAYS} days. No card is needed.</li>
        <li>After the trial, you pay for the plan you choose, monthly or yearly, as shown on our <Link href="/#pricing" className="text-brand-700">pricing</Link>. Prices exclude VAT.</li>
        <li>We invoice you and payment is due within 14 days. If an invoice is unpaid, we may suspend your account after giving you notice. Your data stays safe while suspended.</li>
        <li>We&apos;ll give you at least 30 days&apos; notice of any price change.</li>
      </ul>

      <h2>3. Your responsibilities</h2>
      <ul>
        <li>Keep passwords and PINs secret, give each member of staff their own PIN, and remove staff who leave.</li>
        <li>Make sure the prices, VAT rates and age limits you set are correct. You remain responsible for your VAT returns, records and legal obligations as a retailer, including age-restricted sales.</li>
        <li>Use the service lawfully, and don&apos;t try to break, overload or access other businesses&apos; data.</li>
        <li>Your agreements with card providers (Stripe, SumUp, Dojo or others) are between you and them.</li>
      </ul>

      <h2>4. Your data</h2>
      <p>Your business data belongs to you. We process it only to provide the service, as set out in our <Link href="/dpa" className="text-brand-700">data processing agreement</Link>, which forms part of these terms. You can download all of it at any time. See our <Link href="/privacy" className="text-brand-700">privacy policy</Link> for how we handle personal data.</p>

      <h2>5. Availability and offline use</h2>
      <p>We aim to keep {LEGAL.product} running at all times but can&apos;t promise it will never be interrupted, for example during maintenance or problems with internet providers. The till keeps selling offline and sends sales when the connection returns. Integrated card readers need an internet connection.</p>

      <h2>6. Cancelling</h2>
      <ul>
        <li>You can close your account at any time under <b>Plan &amp; billing</b>. Your data is permanently deleted 30 days later.</li>
        <li>Fees already paid for the current period are not refunded, unless the law requires it.</li>
        <li>We may close an account that seriously or repeatedly breaks these terms, after giving notice where possible.</li>
      </ul>

      <h2>7. Liability</h2>
      <ul>
        <li>Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or anything else that can&apos;t be limited by law.</li>
        <li>We aren&apos;t liable for loss of profit, revenue, business or goodwill, or for indirect losses.</li>
        <li>Otherwise, our total liability in any 12 months is limited to the fees you paid us in that period.</li>
      </ul>

      <h2>8. Changes to these terms</h2>
      <p>If we change these terms, we&apos;ll tell you in the back office and ask you to accept the new version.</p>

      <h2>9. Law</h2>
      <p>These terms are governed by the law of England and Wales, and the courts of England and Wales have jurisdiction.</p>

      <h2>Contact</h2>
      <p>{LEGAL.company}. Email <Contact />.</p>
    </LegalPage>
  );
}

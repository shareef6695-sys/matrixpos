import Link from "next/link";
import { LegalPage, Contact } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Privacy policy" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>This policy explains how {LEGAL.company} (&quot;we&quot;) handles personal data in {LEGAL.product}, under the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018.</p>

      <h2>Two roles</h2>
      <ul>
        <li><b>We are the controller</b> for the details of the people who sign up and use the back office: the business owner, managers and their sign-in details, and the billing relationship with us.</li>
        <li><b>Each shop is the controller</b> for the data it puts into {LEGAL.product}: its staff, its loyalty customers and its sales. We process that data only on the shop&apos;s instructions, under our <Link href="/dpa" className="text-brand-700">data processing agreement</Link>. Shoppers with questions about their data should contact the shop first.</li>
      </ul>

      <h2>What we collect about account holders</h2>
      <ul>
        <li>Name, email address, business name, shop address and VAT or company number you give us.</li>
        <li>Your password and till PIN, stored only as one-way hashes that nobody can read.</li>
        <li>Sign-in records: time, success or failure, and a one-way coded form of your email and network address (never the address itself), used to protect accounts. Kept for 24 hours.</li>
        <li>Your plan, trial dates and invoices.</li>
        <li>Records of important actions in your account, such as refunds and setting changes, so you can see who did what.</li>
      </ul>

      <h2>Why we use it, and our lawful basis</h2>
      <ul>
        <li><b>To provide the service you signed up for</b> (contract): running your account, tills and back office, and sending emails you need, such as confirming your address and resetting your password.</li>
        <li><b>To bill you</b> (contract and legal obligation): invoices and keeping accounting records for HMRC.</li>
        <li><b>To keep the service secure</b> (legitimate interests): limiting sign-in attempts and spotting misuse.</li>
        <li><b>To tell you about important changes</b> to the service or these terms (legitimate interests). We don&apos;t send marketing without your consent.</li>
      </ul>

      <h2>Where it is kept and who helps us</h2>
      <p>The {LEGAL.product} database runs on servers in the United Kingdom. We use these service providers, each bound by a contract to protect the data:</p>
      <ul>
        <li>LightNode, which hosts the database and its nightly backups on a server in the United Kingdom.</li>
        <li>Vercel, which runs the website from its London region. Vercel is a US company. Any transfer outside the UK is covered by the UK International Data Transfer Addendum or the UK–US data bridge.</li>
        <li>Our email delivery provider, which sends account emails. It receives your name, email address and the email itself.</li>
        <li>Stripe, if you pay your subscription by card. It receives your business name, email address and an internal account reference; you give your card and billing address to Stripe directly.</li>
      </ul>
      <p>Card payments are handled by the card provider each shop chooses, such as Stripe, SumUp or Dojo. Card numbers never reach {LEGAL.product}.</p>
      <p>We never sell personal data.</p>

      <h2>How long we keep it</h2>
      <ul>
        <li>While your account is open, and for 30 days after you close it. Then your business data is permanently deleted. Backups roll over within 14 days after that.</li>
        <li>Our own invoices and billing records are kept for 6 years after the end of the financial year, as UK tax law requires, even after your account is deleted. The email address on them is removed when the account is deleted.</li>
      </ul>

      <h2>Cookies</h2>
      <p>{LEGAL.product} only uses cookies that are strictly necessary for it to work, so we don&apos;t ask for consent:</p>
      <ul>
        <li><code>mpos_admin</code> keeps you signed in to the back office (12 hours).</li>
        <li><code>mpos_device</code> remembers which till a device is (1 year).</li>
        <li><code>mpos_till</code> keeps a cashier signed in at the till (14 hours).</li>
        <li><code>mpos_mfa</code> holds a sign-in for 5 minutes while you enter a two-step code.</li>
      </ul>
      <p>The till also stores its product list and unsent sales in the browser so it can keep working offline. We use no advertising or tracking cookies.</p>

      <h2>Your rights</h2>
      <p>You can ask to see, correct, delete or receive a copy of your personal data, to object to how we use it, or to restrict it. Owners can download all their business data and close the account themselves under <b>Plan &amp; billing</b>. For anything else, email <Contact />. We reply within one month.</p>
      <p>If you&apos;re unhappy with how we handle your data, you can complain to the Information Commissioner&apos;s Office at <a href="https://ico.org.uk/make-a-complaint/" className="text-brand-700">ico.org.uk</a>.</p>

      <h2>Security</h2>
      <p>Connections are encrypted, passwords and PINs are hashed, each business&apos;s data is kept separate, sign-in attempts are limited, and owners can switch on two-step sign-in. If a breach affects your data, we&apos;ll tell you without undue delay.</p>

      <h2>Contact</h2>
      <p>{LEGAL.company}, registered in England and Wales, company number {LEGAL.companyNumber}. Registered office: {LEGAL.address}. Email <Contact />.</p>
    </LegalPage>
  );
}

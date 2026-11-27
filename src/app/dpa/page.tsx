import { LegalPage, Contact } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Data processing agreement" };

export default function Dpa() {
  return (
    <LegalPage title="Data processing agreement">
      <p>This agreement forms part of the {LEGAL.product} terms of service. It applies when {LEGAL.company} (the &quot;processor&quot;) processes personal data on behalf of the business using {LEGAL.product} (the &quot;controller&quot;), as required by Article 28 of the UK GDPR.</p>

      <h2>1. What we process</h2>
      <ul>
        <li><b>Purpose:</b> providing the {LEGAL.product} point of sale and back office service.</li>
        <li><b>People:</b> your staff, your loyalty customers, and contacts at your suppliers.</li>
        <li><b>Data:</b> names, email addresses, phone numbers, staff roles and hashed PINs, loyalty points, purchase history, and records of actions in the system. No card numbers. No special category data is needed.</li>
        <li><b>Duration:</b> for as long as you use {LEGAL.product}, then 30 days after you close your account.</li>
      </ul>

      <h2>2. Our commitments</h2>
      <ul>
        <li>We process the data only on your documented instructions, which are given by how you use {LEGAL.product}, unless UK law requires otherwise. We&apos;ll tell you if we think an instruction breaks the law.</li>
        <li>Everyone at {LEGAL.company} who can access the data is bound by confidentiality.</li>
        <li>We keep appropriate technical and organisational security: encrypted connections, hashed passwords and PINs, separation between businesses, limited sign-in attempts, optional two-step sign-in, nightly backups and access only by authorised people.</li>
        <li>We help you respond to people exercising their rights. You can export, correct and erase customer data yourself in the back office.</li>
        <li>We help you with security, breach notification and data protection impact assessments where they relate to our service.</li>
        <li>We notify you without undue delay, and within 48 hours where we can, after becoming aware of a personal data breach affecting your data.</li>
        <li>At the end of the service, we delete your data 30 days after you close your account. You can download it before then.</li>
        <li>We make available the information needed to show we meet these commitments, and allow reasonable audits with notice.</li>
      </ul>

      <h2>3. Sub-processors</h2>
      <p>You give general authorisation for us to use these sub-processors. We&apos;ll tell you before adding or replacing one, so you can object.</p>
      <ul>
        <li>LightNode: database hosting and backups, on a server in the United Kingdom.</li>
        <li>Vercel Inc.: application hosting, London region. Transfers are covered by the UK International Data Transfer Addendum or the UK–US data bridge.</li>
        <li>Our email delivery provider: sending account emails.</li>
      </ul>
      <p>We put the same data protection obligations on each sub-processor, and stay responsible for them.</p>

      <h2>4. Transfers outside the UK</h2>
      <p>The database is kept in the United Kingdom. We only transfer personal data outside the UK with appropriate safeguards under the UK GDPR.</p>

      <h2>5. Your responsibilities</h2>
      <p>You are responsible for having a lawful basis to collect the data you put into {LEGAL.product}, for telling your customers and staff how you use it, and for the instructions you give us.</p>

      <h2>Contact</h2>
      <p>Questions about this agreement: <Contact />.</p>
    </LegalPage>
  );
}

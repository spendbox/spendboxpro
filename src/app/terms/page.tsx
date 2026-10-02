import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { SUPPORT_EMAIL } from "@/lib/email";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="2 October 2026">
      <p>
        These terms are an agreement between you and Spendbox (&ldquo;we&rdquo;, &ldquo;us&rdquo;) for using the
        Spendbox website and app. By creating an account or using Spendbox you agree to them. If you don&apos;t agree,
        please don&apos;t use Spendbox. How we handle personal data is explained in our{" "}
        <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>What Spendbox is</h2>
      <p>
        Spendbox lets businesses keep a customer list, count purchases and offer perks, and lets customers keep the
        businesses they buy from in one place. <strong>Spendbox does not process payments</strong> and never holds or
        moves money. Payments happen directly between customers and businesses.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You sign in with your phone number and a PIN. Keep your PIN private; you are responsible for what happens in your account.</li>
        <li>Use your own phone number and give accurate information.</li>
        <li>You must be at least 13 years old, or have a parent&apos;s or guardian&apos;s permission where the law requires it.</li>
        <li>Tell us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> if you think someone else is using your account.</li>
      </ul>

      <h2>Perks</h2>
      <ul>
        <li>
          Perks are offered by each business, not by Spendbox. The business decides what a perk is, its conditions and
          how long it lasts, and is responsible for honouring it.
        </li>
        <li>Perks have no cash value, can&apos;t be sold or transferred, and are used at the business that offered them.</li>
        <li>A perk ends when it is used, when its time limit passes, or if the purchases that earned it are reversed.</li>
        <li>Businesses can change, pause or end their perks; perks you have already earned stay valid until they expire.</li>
      </ul>

      <h2>Payments from your bank</h2>
      <ul>
        <li>
          Businesses can connect their bank accounts through Mono. Access is read-only: Spendbox sees payments coming
          in and can never move money. A business can disconnect at any time in Settings.
        </li>
        <li>
          Payments are matched to members by the sender&apos;s name and the accounts recognised as them. Matching can
          sometimes be wrong; a business can mark a payment as the wrong customer, and a customer can tap &ldquo;Not
          me&rdquo;.
        </li>
        <li>Only the business&apos;s own accounts may be connected, by someone allowed to do so.</li>
      </ul>

      <h2>Receipts</h2>
      <ul>
        <li>Only upload genuine receipts for payments you made yourself.</li>
        <li>
          Receipts are read automatically and may sometimes be read wrongly. A business can mark a payment as not
          received, which removes it and any unused perks it earned.
        </li>
        <li>
          Uploading fake, edited or someone else&apos;s receipts, or reusing a receipt, is not allowed and can lead to
          your account being closed.
        </li>
      </ul>

      <h2>For businesses</h2>
      <ul>
        <li>You must be authorised to act for the business and to add its bank accounts.</li>
        <li>Honour the perks you offer, and describe them honestly.</li>
        <li>
          Use customers&apos; shared details only to serve them and in line with data protection law. Don&apos;t send
          spam or share customer data with others.
        </li>
        <li>You keep ownership of your name, logo and content, and let us show them in Spendbox so the service works.</li>
      </ul>

      <h2>Free trial and fees</h2>
      <p>
        Businesses start on a free trial. We plan to introduce paid plans after the trial. We will tell you the price
        and give you notice before any fee applies, and you will never be charged without agreeing first. Spendbox is
        free for customers.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Don&apos;t misuse Spendbox: no fraud, no attempts to access other people&apos;s data or accounts, no interfering
        with the service, no automated scraping, and nothing illegal.
      </p>

      <h2>Ending your use</h2>
      <p>
        You can delete your account at any time. We may suspend or close accounts that break these terms or put others
        at risk; where reasonable, we will tell you why.
      </p>

      <h2>Service and liability</h2>
      <p>
        We work hard to keep Spendbox running well, but it is provided &ldquo;as is&rdquo; and may sometimes be
        unavailable or make mistakes. We are not responsible for disputes between businesses and customers, including
        over payments, products or perks. To the extent the law allows, we are not liable for indirect or consequential
        losses, and our total liability to you is limited to the amount you paid us in the 12 months before the claim
        (or ₦50,000 if you paid nothing). Nothing in these terms limits rights you have under consumer protection law
        that cannot be excluded.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. We&apos;ll change the date above and tell you about important changes in the app or
        by email. Continuing to use Spendbox after changes take effect means you accept them.
      </p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of the Federal Republic of Nigeria.</p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>
    </LegalPage>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { SUPPORT_EMAIL } from "@/lib/email";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="4 October 2026">
      <p>
        These terms are an agreement between you and Spendbox (&ldquo;we&rdquo;, &ldquo;us&rdquo;) for using the
        Spendbox website and app. By creating an account or using Spendbox you agree to them. If you don&apos;t agree,
        please don&apos;t use Spendbox. How we handle personal data is explained in our{" "}
        <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>What Spendbox is</h2>
      <p>
        Spendbox lets businesses keep a customer list, offer simple perks and team up with other businesses, and lets
        customers post requests for what they need so the businesses they trust can reach out. <strong>Spendbox does not process payments</strong> and never holds or
        moves money. Payments happen directly between customers and businesses.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You sign in with your email and a password. Keep your password private; you are responsible for what happens in your account.</li>
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
        <li>A perk ends when it is used or when its time limit passes.</li>
        <li>Businesses can change, pause or end their perks; perks you have already earned stay valid until they expire.</li>
      </ul>

      <h2>Requests</h2>
      <ul>
        <li>
          Customers can post requests describing what they need, with a budget and optional photos. A request is shown
          for 24 hours to the businesses the customer joined and, depending on their plan, to those businesses&apos;
          partners. It can be posted again after it ends.
        </li>
        <li>
          Only post genuine requests, with photos you have the right to share. No illegal, offensive or misleading
          content, and no other people&apos;s personal details.
        </li>
        <li>
          Businesses who can see a request can contact the customer using the methods the customer picked for it. Keep
          it relevant and respectful; no spam.
        </li>
        <li>
          Any deal is between the customer and the business. Spendbox is not part of it and doesn&apos;t guarantee
          prices, quality or delivery.
        </li>
      </ul>

      <h2>For businesses</h2>
      <ul>
        <li>You must be authorised to act for the business.</li>
        <li>Honour the perks you offer, and describe them honestly, including to customers who join you through a partner.</li>
        <li>
          If you switch on cross-promotion, other businesses on Spendbox can see your name, categories, area and number
          of customers, and your perks show to your partners&apos; customers. On Plus, partners see each other&apos;s
          customers&apos; requests. You can end a partnership at any time.
        </li>
        <li>
          Use customers&apos; shared details only to serve them and in line with data protection law. Don&apos;t send
          spam or share customer data with others.
        </li>
        <li>You keep ownership of your name, logo and content, and let us show them in Spendbox so the service works.</li>
      </ul>

      <h2>Free trial, plans and fair use</h2>
      <p>
        Businesses start on a free trial. After it, Spendbox is a monthly plan: Starter (requests from your own
        customers) or Plus (also requests from your partners&apos; customers). Current prices are shown in your dashboard under Settings → Plan &amp; billing, and you only pay
        when you choose to, through Paystack. Price changes apply to your next payment, never to months you&apos;ve
        already paid for. Spendbox is free for customers.
      </p>
      <p>
        <strong>Fair use.</strong> If a plan isn&apos;t paid within 14 days after the trial or the last paid month ends,
        we pause the business: new customers can&apos;t join and requests stop showing. Your customers keep their perks,
        and paying switches the business back on straight away.
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
        over requests, prices, products or perks. To the extent the law allows, we are not liable for indirect or consequential
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

import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { SUPPORT_EMAIL } from "@/lib/email";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="4 October 2026">
      <p>
        Spendbox (&ldquo;we&rdquo;, &ldquo;us&rdquo;) helps small businesses keep a list of their customers, count
        purchases and reward customers with perks. This policy explains what personal data we collect, why, who we share
        it with and the choices you have. We follow the Nigeria Data Protection Act 2023 (NDPA) and, where it applies,
        other data protection laws.
      </p>
      <p>
        Questions or requests: email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>

      <h2>Who is responsible for your data</h2>
      <p>
        Spendbox is responsible (the &ldquo;data controller&rdquo;) for the account data described here. Each business
        you join is separately responsible for how it uses the details you choose to share with it, for example to call
        you or wish you a happy birthday.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account:</strong> your email, a password you choose (stored in scrambled form, never in plain text) and,
          if you add it, your phone number. We email you a link to confirm your email address.
        </li>
        <li>
          <strong>Bank accounts you pay from:</strong> the bank, account number and the account name your bank gives us
          (through Paystack). Your Spendbox name comes from your first account. We use them only to recognise your
          payments; businesses never see them.
        </li>
        <li>
          <strong>Profile (optional):</strong> your birthday, gender and email address.
        </li>
        <li>
          <strong>Memberships:</strong> which businesses you joined, when, your member number, and who invited you.
        </li>
        <li>
          <strong>Payments and purchases:</strong> when a business connects its bank account, the payments that come
          into it (amount, date and time, and the bank&apos;s note, which usually includes the sender&apos;s name and
          sometimes their account number); purchases a business records for you; and, if receipt uploads are on, receipt
          images you upload and what we read from them.
        </li>
        <li>
          <strong>Bank accounts recognised as you:</strong> the sender name (and account number, when the bank shows
          it) of transfers that were counted for you, so your next transfers count by themselves. You can see and remove
          these in Profile &amp; privacy.
        </li>
        <li>
          <strong>Perks:</strong> the perks you earn and use.
        </li>
        <li>
          <strong>Businesses:</strong> business name, categories, area, WhatsApp number, email, logo and the bank
          accounts customers pay into (bank name, account number and account name).
        </li>
        <li>
          <strong>Technical data:</strong> login cookies that keep you signed in, and basic logs (such as IP address and
          time of a request) kept by our hosting providers for security.
        </li>
      </ul>

      <h2>How we use it, and why we are allowed to</h2>
      <ul>
        <li>To run your account and the memberships you ask for — this is needed to provide the service (contract).</li>
        <li>
          To see who paid a business, count purchases toward perks and remember the accounts you pay from — needed to
          provide the service, and in the legitimate interest of you and the business in having purchases counted without
          paperwork.
        </li>
        <li>
          To send emails about perks and purchases, if you add an email and leave notifications on — your consent. You
          can switch this off at any time in Profile &amp; privacy.
        </li>
        <li>To share your name, phone, email, gender and birthday with a business — only if you switch sharing on for it (your consent).</li>
        <li>To prevent fraud, such as using the same receipt twice — our legitimate interest in keeping perks fair.</li>
        <li>To meet legal obligations where we must.</li>
      </ul>
      <p>We do not sell your personal data, and we do not use it for advertising.</p>

      <h2>How payments are matched to you</h2>
      <p>
        A business connects its bank account through Mono with read-only access: we can see money coming in, never move
        it. When a payment arrives, we compare the sender&apos;s name with the names of that business&apos;s members, and
        with bank accounts already recognised as members. If it is clearly you, the purchase counts for you; if it is
        unclear, the business picks who paid. The business sees the sender exactly as its own bank shows it. We then
        remember that sender as you, so future transfers from it count for you at any business you have joined. If a
        payment was counted for you by mistake, tap &ldquo;Not me&rdquo; in Profile &amp; privacy.
      </p>

      <h2>Audits</h2>
      <p>
        We keep an automatic record of what businesses do with your purchases and perks (recorded, confirmed, deleted,
        given and so on). You can see it under Audits, and the business sees the same events for its customers. Nobody
        can edit it. It is deleted with your account.
      </p>

      <h2>What businesses can see</h2>
      <p>
        A business you join always sees your member number, when you joined, your purchases with it (including receipts
        you uploaded for it) and the perks you earned there. It sees your name, phone number, email, gender and birthday{" "}
        <strong>only if you switch sharing on</strong> for that business. Businesses never see your
        password, the list of bank accounts recognised as you, or anything about other businesses you belong to.
      </p>

      <h2>Partner businesses</h2>
      <p>
        Businesses can team up on Spendbox (&ldquo;cross-promotion&rdquo;). When they do, you may see a partner&apos;s
        perks marked &ldquo;from our partners&rdquo;. No personal data passes between partner businesses: a partner
        doesn&apos;t learn that you exist unless you join it yourself. Businesses that switch on cross-promotion see each
        other&apos;s name, categories, area and how many customers they have (a number only).
      </p>

      <h2>Who else processes your data</h2>
      <p>We use trusted service providers who process data for us under contract:</p>
      <ul>
        <li>Supabase — database, login and file storage.</li>
        <li>Vercel — hosting of the website.</li>
        <li>Mono — connects a business&apos;s bank account (read-only) and sends us the payments that come into it.</li>
        <li>Anthropic (Claude) — reads receipt images, when receipt uploads are on. Images are sent only to extract payment details.</li>
        <li>Paystack — confirms the name on bank accounts you add (and on a business&apos;s accounts for receipts).</li>
        <li>Resend — sends notification emails.</li>
      </ul>
      <p>
        Some of these providers store or process data outside Nigeria. Where that happens we rely on safeguards allowed
        by the NDPA, such as contractual protections.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your data while your account is open. If you leave a business, your membership, purchases and unused
        perks with it are deleted. If you delete your account, we delete your profile, memberships, purchases, perks, bank
        accounts recognised as you and receipt images straight away; copies in backups are removed as the backups expire.
      </p>

      <h2>Your rights</h2>
      <p>You can:</p>
      <ul>
        <li>see and correct your details in Profile &amp; privacy;</li>
        <li>turn sharing on or off for each business, and turn emails off;</li>
        <li>delete your account and its data at any time from Profile &amp; privacy;</li>
        <li>ask for a copy of your data, ask us to restrict or stop certain uses, or object to them;</li>
        <li>withdraw consent at any time (this doesn&apos;t affect what happened before);</li>
        <li>complain to the Nigeria Data Protection Commission (NDPC) if you think we have mishandled your data.</li>
      </ul>
      <p>
        To use any right we can&apos;t handle in the app, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        We reply within 30 days.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit, access is limited by strict database rules, receipt images are stored privately
        and only opened through short-lived links. No system is perfectly secure; if a breach affects you, we will tell
        you and the regulator as the law requires.
      </p>

      <h2>Children</h2>
      <p>Spendbox is not meant for children under 13. If you believe a child has an account, contact us and we will delete it.</p>

      <h2>Changes</h2>
      <p>
        We may update this policy. We&apos;ll change the date above and, for important changes, tell you in the app or by
        email.
      </p>
    </LegalPage>
  );
}

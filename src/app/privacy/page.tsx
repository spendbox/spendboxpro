import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { SUPPORT_EMAIL } from "@/lib/email";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="4 October 2026">
      <p>
        Spendbox (&ldquo;we&rdquo;, &ldquo;us&rdquo;) helps small businesses keep a list of their customers and reward
        them with perks, and lets customers post requests so the businesses they trust can reach out. This policy explains what personal data we collect, why, who we share
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
          <strong>Profile:</strong> the name you type, and if you add them, your birthday and gender.
        </li>
        <li>
          <strong>Memberships:</strong> which businesses you joined, when, your member number, and who invited you.
        </li>
        <li>
          <strong>Requests:</strong> what you ask for, your budget, the category and area, any photos you add, the
          contact methods you pick for each request, and which businesses tapped to reach out to you.
        </li>
        <li>
          <strong>Perks:</strong> the perks you earn and use.
        </li>
        <li>
          <strong>Businesses:</strong> business name, categories, area, WhatsApp number, email and logo.
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
          To show your requests to the businesses you joined (and, on their plan, their partners), with the contact
          methods you picked — needed to provide the service you asked for when you post.
        </li>
        <li>
          To send emails about your requests and perks, if you add an email and leave notifications on — your consent. You
          can switch this off at any time in Profile &amp; privacy.
        </li>
        <li>To share your name, phone, email, gender and birthday with a business — only if you switch sharing on for it (your consent).</li>
        <li>
          To understand what you need: from your requests we keep a summary of what you ask for (categories, key words,
          usual budget, areas and how you like to be reached), even after a request ends or is deleted. We use it to
          improve Spendbox and what it suggests to you — our legitimate interest in making Spendbox useful. Businesses
          never see this summary.
        </li>
        <li>To prevent abuse, such as spam requests — our legitimate interest in keeping Spendbox safe.</li>
        <li>To meet legal obligations where we must.</li>
      </ul>
      <p>We do not sell your personal data, and we do not use it for advertising.</p>

      <h2>What businesses can see</h2>
      <p>
        A business you join always sees your member number, when you joined and the perks you earned there. It sees
        your name, phone number, email, gender and birthday <strong>only if you switch sharing on</strong> for that
        business. When you post a request, the businesses that can see it get your first name, the request, its photos
        and only the contact details you picked for it (phone for WhatsApp or calls, email for email). Businesses never
        see your password or anything about other businesses you belong to.
      </p>

      <h2>Partner businesses</h2>
      <p>
        Businesses can team up on Spendbox (&ldquo;cross-promotion&rdquo;). When they do, you may see a partner&apos;s
        perks marked &ldquo;from our partners&rdquo;. Partners don&apos;t get your member details. If a business you
        joined is on the Plus plan, its partners can also see your live requests, with the contact methods you picked
        for them. Businesses that switch on cross-promotion see each
        other&apos;s name, categories, area and how many customers they have (a number only).
      </p>

      <h2>Who else processes your data</h2>
      <p>We use trusted service providers who process data for us under contract:</p>
      <ul>
        <li>Supabase — database, login and file storage.</li>
        <li>Vercel — hosting of the website.</li>
        <li>Paystack — takes payments from businesses for their Spendbox plan.</li>
        <li>Resend — sends notification emails.</li>
      </ul>
      <p>
        Some of these providers store or process data outside Nigeria. Where that happens we rely on safeguards allowed
        by the NDPA, such as contractual protections.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your data while your account is open. Requests stop showing after 24 hours; you can delete
        them, with their photos, at any time (the summary of what you ask for stays until you delete your account). If you leave a business, your membership and unused perks with it are
        deleted. If you delete your account, we delete your profile, memberships, requests, photos, perks and that summary straight
        away; copies in backups are removed as the backups expire.
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
        Data is encrypted in transit, and access is limited by strict database rules. Request photos are shown only
        inside Spendbox, at hard-to-guess addresses. No system is perfectly secure; if a breach affects you, we will tell
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

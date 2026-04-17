import type { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "Terms and conditions for using the Stroby platform.",
};

export default function TermsPage() {
  return (
    <>
      <MarketingHeader />

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Terms &amp; Conditions
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: April 16, 2026
        </p>

        <div className="prose prose-neutral mt-10 max-w-none dark:prose-invert [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-medium">
          <h2>1. Introduction</h2>
          <p>
            Welcome to Stroby, operated by Stroby AI Inc. (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). Stroby is an AI-powered platform that connects businesses with influencers, content creators, and other marketing professionals for brand distribution partnerships. By accessing or using our website at stroby.ai and any related services (collectively, the &ldquo;Service&rdquo;), you agree to be bound by these Terms &amp; Conditions (&ldquo;Terms&rdquo;).
          </p>
          <p>
            If you do not agree to these Terms, please do not use the Service.
          </p>

          <h2>2. Definitions</h2>
          <ul>
            <li><strong>&ldquo;User&rdquo;</strong> means any individual or entity that accesses the Service, including businesses, influencers, content creators, and other professionals.</li>
            <li><strong>&ldquo;Profile&rdquo;</strong> means the information you provide during onboarding, including but not limited to name, email, phone number, company details, audience data, and niche information.</li>
            <li><strong>&ldquo;Match&rdquo;</strong> means a suggested connection between a business and an influencer or creator facilitated by our AI.</li>
            <li><strong>&ldquo;Platform Data&rdquo;</strong> means all data collected through the Service, including Profile information, usage data, and communication records.</li>
          </ul>

          <h2>3. Eligibility</h2>
          <p>
            You must be at least 18 years of age to use the Service. By using Stroby, you represent and warrant that you are at least 18 years old and have the legal capacity to enter into these Terms. If you are using the Service on behalf of an organization, you represent that you have the authority to bind that organization to these Terms.
          </p>

          <h2>4. Account Registration &amp; Onboarding</h2>
          <p>
            To use the Service, you must complete our onboarding process, which involves providing information about yourself and your business or audience through our chat interface. You agree to:
          </p>
          <ul>
            <li>Provide accurate, current, and complete information during onboarding.</li>
            <li>Not impersonate any person or entity or misrepresent your affiliation.</li>
            <li>Keep your contact information up to date.</li>
          </ul>
          <p>
            We reserve the right to reject or suspend any account if we believe the information provided is inaccurate, misleading, or violates these Terms.
          </p>

          <h2>5. How the Service Works</h2>
          <p>
            Stroby uses artificial intelligence to analyze your Profile and match you with relevant businesses, influencers, or other professionals. Our AI considers factors such as niche, audience demographics, budget, and campaign goals to suggest potential partnerships.
          </p>
          <p>
            Matches are suggestions only. We do not guarantee that any match will result in a partnership, revenue, or any specific outcome. Both parties must mutually agree before any introduction or partnership proceeds.
          </p>

          <h2>6. Data Collection &amp; Usage</h2>
          <p>
            By using the Service, you consent to the collection and use of your data as follows:
          </p>
          <h3>6.1 Matching Purposes</h3>
          <p>
            Your Profile data will be used by our AI to identify and suggest relevant matches. This includes sharing relevant portions of your Profile with potential matches (e.g., your niche, audience size, and general description). Your email address and phone number will not be shared with other users without your explicit consent.
          </p>
          <h3>6.2 Communication</h3>
          <p>
            We will communicate with you via WhatsApp and/or email to deliver match suggestions, platform updates, and service-related messages. By providing your WhatsApp number, you consent to receiving messages from Stroby through WhatsApp.
          </p>
          <h3>6.3 AI Training &amp; Improvement</h3>
          <p>
            We may use anonymized and aggregated Platform Data to train, improve, and refine our AI matching algorithms and overall service quality. This data is stripped of personally identifiable information before being used for training purposes.
          </p>
          <h3>6.4 Third-Party Processors</h3>
          <p>
            We use third-party services to operate the platform, including:
          </p>
          <ul>
            <li><strong>Meta / WhatsApp Business Platform</strong> for WhatsApp messaging</li>
            <li><strong>Supabase</strong> for data storage</li>
            <li><strong>Stripe</strong> for payment processing</li>
            <li><strong>Anthropic (Claude)</strong> for AI-powered matching and conversation</li>
            <li><strong>Vercel</strong> for hosting</li>
          </ul>
          <p>
            Your data may be processed by these third parties in accordance with their respective privacy policies.
          </p>

          <h2>7. Stroby Pay</h2>
          <p>
            Stroby Pay is our escrow payment system, powered and secured by Stripe Connect. Stroby is free to join for influencers and creators. For businesses, we charge a commission on successful partnerships. When a partnership is booked:
          </p>
          <ul>
            <li>Payment is held in escrow via Stroby Pay until the placement is completed and verified.</li>
            <li>Funds are released to the influencer or creator after proof of placement is submitted and verified.</li>
            <li>If performance metrics fall significantly short of what was agreed, a partial or full refund may be issued from the escrowed funds.</li>
          </ul>
          <p>
            Detailed payment terms, including commission rates and refund policies, will be communicated before any transaction is finalized.
          </p>

          <h2>8. Affiliate Program</h2>
          <p>
            Stroby offers an affiliate program that allows approved participants to earn a share of Stroby&rsquo;s platform fees on successful deals involving brands or creators they introduce to the platform.
          </p>
          <h3>8.1 Launch Campaign Rates</h3>
          <p>
            During our launch campaign, affiliates earn up to 50% of Stroby&rsquo;s platform fees per deal:
          </p>
          <ul>
            <li><strong>25%</strong> of Stroby&rsquo;s fee if you referred one side of the deal (either the brand or the creator).</li>
            <li><strong>50%</strong> of Stroby&rsquo;s fee if you referred both sides of the deal (the brand and the creator).</li>
          </ul>
          <h3>8.2 Rate Lock Guarantee</h3>
          <p>
            Affiliates who are approved during the launch campaign period lock in their commission rate for a minimum of 12 months from their approval date, regardless of any subsequent changes to the program&rsquo;s standard rates.
          </p>
          <h3>8.3 General Terms</h3>
          <ul>
            <li>Launch campaign rates are subject to change or discontinuation at any time for new applicants. Existing affiliates retain their locked rate per Section 8.2.</li>
            <li>Commissions are earned only on completed, verified deals that go through the Stroby platform.</li>
            <li>Commission is paid from Stroby&rsquo;s platform fee — never deducted from the creator&rsquo;s payout.</li>
            <li>Minimum payout threshold is $50. Payouts are processed monthly via Stroby Pay.</li>
            <li>Stroby reserves the right to modify program terms or terminate any affiliate account with 30 days&rsquo; notice, subject to the rate lock guarantee above.</li>
            <li>Affiliates must not engage in misleading advertising, spam, or any practice that misrepresents Stroby or its services.</li>
          </ul>

          <h2>9. User Conduct</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Service for any unlawful purpose or in violation of any applicable laws.</li>
            <li>Provide false, misleading, or inflated metrics about your audience or business.</li>
            <li>Harass, abuse, or send unsolicited communications to other users.</li>
            <li>Attempt to circumvent the platform to avoid fees or bypass the matching system.</li>
            <li>Reverse-engineer, scrape, or extract data from the Service.</li>
            <li>Use the Service to send spam or unsolicited marketing communications.</li>
          </ul>
          <p>
            We reserve the right to suspend or terminate your account for violations of these Terms.
          </p>

          <h2>10. Intellectual Property</h2>
          <p>
            All content, features, and functionality of the Service — including but not limited to the Stroby name, logo, AI algorithms, design, and code — are owned by Stroby and are protected by copyright, trademark, and other intellectual property laws. You may not copy, modify, distribute, or create derivative works based on any part of the Service without our prior written consent.
          </p>

          <h2>11. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by applicable law:
          </p>
          <ul>
            <li>The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, whether express or implied.</li>
            <li>We do not guarantee the accuracy of AI-generated matches or the quality of any partnership that results from the Service.</li>
            <li>We are not liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service.</li>
            <li>Our total liability for any claims arising from these Terms or the Service shall not exceed the amount you have paid to Stroby in the 12 months preceding the claim.</li>
          </ul>

          <h2>12. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless Stroby, its officers, directors, employees, and agents from any claims, losses, damages, liabilities, and expenses (including reasonable legal fees) arising from your use of the Service, your violation of these Terms, or your violation of any rights of a third party.
          </p>

          <h2>13. Termination</h2>
          <p>
            You may stop using the Service at any time. You may request deletion of your account and associated data by contacting us at privacy@stroby.ai. We may suspend or terminate your access to the Service at any time, with or without cause, and with or without notice.
          </p>

          <h2>14. GDPR &amp; Data Protection Rights</h2>
          <p>
            If you are located in the European Economic Area (EEA), United Kingdom, or other jurisdiction with applicable data protection laws, you have the following rights:
          </p>
          <ul>
            <li><strong>Right of Access</strong> — request a copy of your personal data.</li>
            <li><strong>Right to Rectification</strong> — request correction of inaccurate data.</li>
            <li><strong>Right to Erasure</strong> — request deletion of your personal data.</li>
            <li><strong>Right to Data Portability</strong> — receive your data in a structured, machine-readable format.</li>
            <li><strong>Right to Object</strong> — object to processing of your data for certain purposes.</li>
            <li><strong>Right to Withdraw Consent</strong> — withdraw your consent at any time where processing is based on consent.</li>
          </ul>
          <p>
            To exercise any of these rights, contact us at privacy@stroby.ai. We will respond within 30 days.
          </p>

          <h2>15. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. If we make material changes, we will notify you via email or WhatsApp at least 30 days before the changes take effect. Your continued use of the Service after the effective date constitutes acceptance of the updated Terms.
          </p>

          <h2>16. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of Canada, without regard to conflict of law principles. Where applicable, GDPR and other local data protection regulations shall take precedence over conflicting provisions.
          </p>

          <h2>16. Contact Us</h2>
          <p>If you have any questions about these Terms, please contact us:</p>
          <ul>
            <li>Email: <a href="mailto:legal@stroby.ai">legal@stroby.ai</a></li>
            <li>Privacy inquiries: <a href="mailto:privacy@stroby.ai">privacy@stroby.ai</a></li>
          </ul>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

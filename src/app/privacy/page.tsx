import type { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy policy for the Stroby platform.",
};

export default function PrivacyPage() {
  return (
    <>
      <MarketingHeader />

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: April 15, 2026
        </p>

        <div className="prose prose-neutral mt-10 max-w-none dark:prose-invert [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-medium">
          <h2>1. Overview</h2>
          <p>
            Stroby AI Inc. (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the website stroby.ai and related services (the &ldquo;Service&rdquo;). This Privacy Policy explains how we collect, use, disclose, and protect your personal information when you use our Service.
          </p>
          <p>
            We are committed to protecting your privacy and handling your data transparently. This policy complies with the General Data Protection Regulation (GDPR), the California Consumer Privacy Act (CCPA), the Personal Information Protection and Electronic Documents Act (PIPEDA), and other applicable data protection laws.
          </p>

          <h2>2. Facebook Login &amp; WhatsApp Business Platform</h2>
          <p>
            Stroby uses the <strong>Meta WhatsApp Business Platform</strong> (via the WhatsApp Cloud API) to communicate with users. When you message Stroby on WhatsApp, we receive and process your WhatsApp phone number and messages to provide our Service.
          </p>
          <p>
            We do <strong>not</strong> use Facebook Login or access your Facebook profile. All interactions occur through WhatsApp messaging and our website at stroby.ai.
          </p>
          <h3>2.1 Meta Platform Data</h3>
          <p>Through the WhatsApp Business Platform, we access:</p>
          <ul>
            <li>Your WhatsApp phone number (provided by you during onboarding)</li>
            <li>Messages you send to our WhatsApp Business number</li>
            <li>Message delivery and read status</li>
          </ul>
          <p>
            We do <strong>not</strong> access your WhatsApp contacts, profile photo, status, or any other WhatsApp data beyond the messages you send directly to us. We do not share Meta Platform Data with third parties except as necessary to provide the Service (e.g., processing messages through our AI).
          </p>

          <h2>3. Information We Collect</h2>
          <h3>3.1 Information You Provide</h3>
          <p>When you use our onboarding chat or interact with the Service, we collect:</p>
          <ul>
            <li><strong>Identity Information:</strong> Your name, email address, and WhatsApp phone number.</li>
            <li><strong>Business Information:</strong> Company name, role, product description, target customer, niche, budget, and campaign goals.</li>
            <li><strong>Audience Information:</strong> Platform, channel name, audience size, engagement rates, content niche, partnership preferences, and pricing.</li>
            <li><strong>Communication Data:</strong> Messages exchanged through our chat interface and WhatsApp.</li>
          </ul>

          <h3>3.2 Information Collected Automatically</h3>
          <p>When you visit our website, we may automatically collect:</p>
          <ul>
            <li><strong>Device Information:</strong> Browser type, operating system, and device identifiers.</li>
            <li><strong>Usage Data:</strong> Pages visited, time spent, clicks, and navigation patterns.</li>
            <li><strong>Log Data:</strong> IP address, access times, and referring URLs.</li>
          </ul>

          <h2>4. How We Use Your Information</h2>
          <p>We use your information for the following purposes:</p>
          <ul>
            <li><strong>Matching:</strong> To power our AI matching engine and connect you with relevant businesses, influencers, or other professionals.</li>
            <li><strong>Communication:</strong> To send match suggestions, platform updates, and service-related messages via WhatsApp and email.</li>
            <li><strong>Payments:</strong> To process transactions via Stroby Pay (our escrow payment system, powered and secured by Stripe Connect) and handle payouts.</li>
            <li><strong>Service Improvement:</strong> To analyze usage patterns and improve the platform experience.</li>
            <li><strong>AI Training:</strong> To train and improve our AI matching algorithms using anonymized and aggregated data that has been stripped of personally identifiable information.</li>
            <li><strong>Legal Compliance:</strong> To comply with applicable laws, regulations, and legal processes.</li>
          </ul>

          <h2>5. Legal Basis for Processing (GDPR)</h2>
          <p>If you are in the EEA or UK, we process your data based on:</p>
          <ul>
            <li><strong>Consent:</strong> You consent to data processing when you complete onboarding and agree to these terms.</li>
            <li><strong>Contract Performance:</strong> Processing is necessary to provide the Service you requested.</li>
            <li><strong>Legitimate Interests:</strong> To improve our Service, prevent fraud, and ensure platform security.</li>
            <li><strong>Legal Obligation:</strong> To comply with applicable laws and regulations.</li>
          </ul>

          <h2>6. Data Sharing &amp; Third Parties</h2>
          <h3>6.1 With Other Users</h3>
          <p>
            When we suggest a match, we share relevant Profile information (such as niche, audience description, and general metrics) with the potential match. We do not share your email, phone number, or WhatsApp number with other users unless both parties have explicitly opted in to an introduction.
          </p>

          <h3>6.2 Service Providers</h3>
          <p>We share data with trusted third-party service providers who help us operate the platform:</p>
          <ul>
            <li><strong>Meta / WhatsApp Business Platform</strong> (messaging) &mdash; delivers WhatsApp messages via the Cloud API.</li>
            <li><strong>Supabase</strong> (database hosting) &mdash; stores your Profile and platform data.</li>
            <li><strong>Stroby Pay</strong> (payments) &mdash; our escrow payment system, powered by Stripe Connect, that processes payments and manages fund release.</li>
            <li><strong>Anthropic</strong> (AI) &mdash; powers our AI matching and conversational features.</li>
            <li><strong>Vercel</strong> (hosting) &mdash; hosts the Stroby website and API.</li>
          </ul>
          <p>
            These providers process data only as necessary to perform their services and are contractually obligated to protect your information.
          </p>

          <h3>6.3 Legal Requirements</h3>
          <p>
            We may disclose your information if required by law, regulation, legal process, or governmental request, or to protect the rights, property, or safety of Stroby, our users, or others.
          </p>

          <h2>7. Data Retention</h2>
          <p>
            We retain your personal data for as long as your account is active or as needed to provide the Service. If you request account deletion, we will delete your personal data within 30 days, except where retention is required by law or for legitimate business purposes (e.g., resolving disputes, enforcing agreements).
          </p>
          <p>
            Anonymized and aggregated data used for AI training and analytics may be retained indefinitely as it cannot be linked back to you.
          </p>

          <h2>8. Data Deletion</h2>
          <p>
            You may request deletion of your account and all associated personal data at any time by:
          </p>
          <ul>
            <li>Messaging Stroby on WhatsApp with &ldquo;Delete my account&rdquo;</li>
            <li>Emailing <a href="mailto:privacy@stroby.ai">privacy@stroby.ai</a> with &ldquo;Account Deletion Request&rdquo; as the subject</li>
          </ul>
          <p>
            Upon receiving a deletion request, we will delete your personal data from our systems within 30 days. This includes your Profile data, message history, and any associated records. Data that has already been anonymized and aggregated for analytics purposes cannot be deleted as it is no longer linked to your identity.
          </p>
          <p>
            If you have active transactions in escrow, deletion will be processed after all pending transactions are resolved.
          </p>

          <h2>9. Data Security</h2>
          <p>
            We implement appropriate technical and organizational measures to protect your personal data, including:
          </p>
          <ul>
            <li>Encryption of data in transit (TLS/HTTPS) and at rest.</li>
            <li>Access controls limiting data access to authorized personnel.</li>
            <li>Regular security reviews of our infrastructure and third-party providers.</li>
            <li>Secure payment processing through Stripe (PCI DSS compliant).</li>
          </ul>
          <p>
            While we take reasonable measures to protect your data, no method of transmission or storage is 100% secure. We cannot guarantee absolute security.
          </p>

          <h2>10. Your Rights</h2>
          <p>Depending on your location, you may have the following rights regarding your personal data:</p>
          <ul>
            <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
            <li><strong>Rectification:</strong> Request correction of inaccurate or incomplete data.</li>
            <li><strong>Erasure:</strong> Request deletion of your personal data (&ldquo;right to be forgotten&rdquo;).</li>
            <li><strong>Portability:</strong> Receive your data in a structured, machine-readable format.</li>
            <li><strong>Objection:</strong> Object to processing based on legitimate interests or for direct marketing.</li>
            <li><strong>Restriction:</strong> Request that we limit processing of your data in certain circumstances.</li>
            <li><strong>Withdraw Consent:</strong> Withdraw previously given consent at any time.</li>
          </ul>
          <p>
            To exercise any of these rights, email us at <a href="mailto:privacy@stroby.ai">privacy@stroby.ai</a>. We will respond within 30 days.
          </p>

          <h3>10.1 California Residents (CCPA)</h3>
          <p>
            California residents have the right to know what personal information is collected, request deletion, and opt out of the sale of personal information. We do not sell your personal information.
          </p>

          <h3>10.2 Canadian Residents (PIPEDA)</h3>
          <p>
            Canadian residents have the right to access their personal information, challenge its accuracy, and withdraw consent for its collection, use, or disclosure, subject to legal or contractual restrictions.
          </p>

          <h2>11. Cookies &amp; Tracking</h2>
          <p>
            We use minimal cookies and local storage necessary for the functioning of the Service (e.g., saving your onboarding progress). We do not use third-party tracking cookies for advertising. We may use analytics tools to understand how the Service is used, with data collected in an anonymized manner.
          </p>

          <h2>12. International Data Transfers</h2>
          <p>
            Your data may be transferred to and processed in countries outside your country of residence, including the United States and Canada, where our service providers operate. We ensure appropriate safeguards are in place, such as Standard Contractual Clauses (SCCs) approved by the European Commission, to protect your data during international transfers.
          </p>

          <h2>13. Pre-Launch Directory (Shadow Profiles)</h2>
          <p>
            To give new users valuable matches from their first day on Stroby, we maintain a pre-launch directory of companies and newsletter creators that publicly identify as newsletter-marketing-relevant. Entries in this directory are compiled from publicly available sources (company websites, publicly listed newsletters, public marketplace data). These profiles are not active user accounts — they are not surfaced to the public, are not included in our public-facing metrics or analytics, and are only used internally by our matching engine to help real users discover potentially relevant partners.
          </p>
          <p>
            When our matching engine surfaces a directory profile as a potential match to a real user, we will reach out to the directory entity (via publicly listed contact methods) inviting them to activate their profile. If they activate, the match proceeds via our normal double-opt-in flow. If they never activate, their directory entry expires after 180 days of non-engagement and is deleted.
          </p>
          <p>
            If you are listed in our pre-launch directory and do not wish to be, email <a href="mailto:privacy@stroby.ai">privacy@stroby.ai</a> with the name of your company or newsletter and we will remove your entry within 72 hours. We will honor this request permanently — we will not re-add removed entities to future directory compilations.
          </p>

          <h2>14. Children&apos;s Privacy</h2>
          <p>
            The Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have collected data from a minor, please contact us at <a href="mailto:privacy@stroby.ai">privacy@stroby.ai</a> and we will promptly delete it.
          </p>

          <h2>15. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. If we make material changes, we will notify you via email or WhatsApp at least 30 days before the changes take effect. Your continued use of the Service after the effective date constitutes acceptance of the updated policy.
          </p>

          <h2>16. Contact Us</h2>
          <p>If you have any questions about this Privacy Policy or your personal data, contact us:</p>
          <ul>
            <li>Email: <a href="mailto:privacy@stroby.ai">privacy@stroby.ai</a></li>
            <li>General inquiries: <a href="mailto:hello@stroby.ai">hello@stroby.ai</a></li>
          </ul>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

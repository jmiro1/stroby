import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy policy for the Stroby platform.",
};

export default function PrivacyPage() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            <span className="text-sm">Back</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="relative size-8 overflow-hidden rounded-lg bg-primary">
              <Image
                src="/logo-emoji.png"
                alt="Stroby"
                width={32}
                height={32}
                className="size-full object-cover"
              />
            </div>
            <span className="text-lg font-semibold tracking-tight">Stroby</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: March 31, 2026
        </p>

        <div className="prose prose-neutral mt-10 max-w-none dark:prose-invert [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-medium">
          <h2>1. Overview</h2>
          <p>
            Stroby AI Inc. (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the website stroby.ai and related services (the &ldquo;Service&rdquo;). This Privacy Policy explains how we collect, use, disclose, and protect your personal information when you use our Service.
          </p>
          <p>
            We are committed to protecting your privacy and handling your data transparently. This policy complies with the General Data Protection Regulation (GDPR), the California Consumer Privacy Act (CCPA), the Personal Information Protection and Electronic Documents Act (PIPEDA), and other applicable data protection laws.
          </p>

          <h2>2. Information We Collect</h2>
          <h3>2.1 Information You Provide</h3>
          <p>When you use our onboarding chat or interact with the Service, we collect:</p>
          <ul>
            <li><strong>Identity Information:</strong> Your name, email address, and WhatsApp phone number.</li>
            <li><strong>Business Information:</strong> Company name, role, product description, target customer, niche, budget, and campaign goals.</li>
            <li><strong>Audience Information:</strong> Platform, channel name, audience size, engagement rates, content niche, partnership preferences, and pricing.</li>
            <li><strong>Communication Data:</strong> Messages exchanged through our chat interface and WhatsApp.</li>
          </ul>

          <h3>2.2 Information Collected Automatically</h3>
          <p>When you visit our website, we may automatically collect:</p>
          <ul>
            <li><strong>Device Information:</strong> Browser type, operating system, and device identifiers.</li>
            <li><strong>Usage Data:</strong> Pages visited, time spent, clicks, and navigation patterns.</li>
            <li><strong>Log Data:</strong> IP address, access times, and referring URLs.</li>
          </ul>

          <h2>3. How We Use Your Information</h2>
          <p>We use your information for the following purposes:</p>
          <ul>
            <li><strong>Matching:</strong> To power our AI matching engine and connect you with relevant businesses, influencers, or other professionals.</li>
            <li><strong>Communication:</strong> To send match suggestions, platform updates, and service-related messages via WhatsApp and email.</li>
            <li><strong>Payments:</strong> To process transactions, manage escrow, and handle payouts through Stripe.</li>
            <li><strong>Service Improvement:</strong> To analyze usage patterns and improve the platform experience.</li>
            <li><strong>AI Training:</strong> To train and improve our AI matching algorithms using anonymized and aggregated data that has been stripped of personally identifiable information.</li>
            <li><strong>Legal Compliance:</strong> To comply with applicable laws, regulations, and legal processes.</li>
          </ul>

          <h2>4. Legal Basis for Processing (GDPR)</h2>
          <p>If you are in the EEA or UK, we process your data based on:</p>
          <ul>
            <li><strong>Consent:</strong> You consent to data processing when you complete onboarding and agree to these terms.</li>
            <li><strong>Contract Performance:</strong> Processing is necessary to provide the Service you requested.</li>
            <li><strong>Legitimate Interests:</strong> To improve our Service, prevent fraud, and ensure platform security.</li>
            <li><strong>Legal Obligation:</strong> To comply with applicable laws and regulations.</li>
          </ul>

          <h2>5. Data Sharing &amp; Third Parties</h2>
          <h3>5.1 With Other Users</h3>
          <p>
            When we suggest a match, we share relevant Profile information (such as niche, audience description, and general metrics) with the potential match. We do not share your email, phone number, or WhatsApp number with other users unless both parties have explicitly opted in to an introduction.
          </p>

          <h3>5.2 Service Providers</h3>
          <p>We share data with trusted third-party service providers who help us operate the platform:</p>
          <ul>
            <li><strong>Supabase</strong> (database hosting) &mdash; stores your Profile and platform data.</li>
            <li><strong>Stripe</strong> (payments) &mdash; processes payments and manages escrow.</li>
            <li><strong>Twilio</strong> (messaging) &mdash; delivers WhatsApp messages.</li>
            <li><strong>Anthropic</strong> (AI) &mdash; powers our AI matching and conversational features.</li>
            <li><strong>Vercel</strong> (hosting) &mdash; hosts the Stroby website and API.</li>
          </ul>
          <p>
            These providers process data only as necessary to perform their services and are contractually obligated to protect your information.
          </p>

          <h3>5.3 Legal Requirements</h3>
          <p>
            We may disclose your information if required by law, regulation, legal process, or governmental request, or to protect the rights, property, or safety of Stroby, our users, or others.
          </p>

          <h2>6. Data Retention</h2>
          <p>
            We retain your personal data for as long as your account is active or as needed to provide the Service. If you request account deletion, we will delete your personal data within 30 days, except where retention is required by law or for legitimate business purposes (e.g., resolving disputes, enforcing agreements).
          </p>
          <p>
            Anonymized and aggregated data used for AI training and analytics may be retained indefinitely as it cannot be linked back to you.
          </p>

          <h2>7. Data Security</h2>
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

          <h2>8. Your Rights</h2>
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

          <h3>8.1 California Residents (CCPA)</h3>
          <p>
            California residents have the right to know what personal information is collected, request deletion, and opt out of the sale of personal information. We do not sell your personal information.
          </p>

          <h3>8.2 Canadian Residents (PIPEDA)</h3>
          <p>
            Canadian residents have the right to access their personal information, challenge its accuracy, and withdraw consent for its collection, use, or disclosure, subject to legal or contractual restrictions.
          </p>

          <h2>9. Cookies &amp; Tracking</h2>
          <p>
            We use minimal cookies and local storage necessary for the functioning of the Service (e.g., saving your onboarding progress). We do not use third-party tracking cookies for advertising. We may use analytics tools to understand how the Service is used, with data collected in an anonymized manner.
          </p>

          <h2>10. International Data Transfers</h2>
          <p>
            Your data may be transferred to and processed in countries outside your country of residence, including the United States and Canada, where our service providers operate. We ensure appropriate safeguards are in place, such as Standard Contractual Clauses (SCCs) approved by the European Commission, to protect your data during international transfers.
          </p>

          <h2>11. Children&apos;s Privacy</h2>
          <p>
            The Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have collected data from a minor, please contact us at <a href="mailto:privacy@stroby.ai">privacy@stroby.ai</a> and we will promptly delete it.
          </p>

          <h2>12. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. If we make material changes, we will notify you via email or WhatsApp at least 30 days before the changes take effect. Your continued use of the Service after the effective date constitutes acceptance of the updated policy.
          </p>

          <h2>13. Contact Us</h2>
          <p>If you have any questions about this Privacy Policy or your personal data, contact us:</p>
          <ul>
            <li>Email: <a href="mailto:privacy@stroby.ai">privacy@stroby.ai</a></li>
            <li>General inquiries: <a href="mailto:hello@stroby.ai">hello@stroby.ai</a></li>
          </ul>
        </div>
      </main>
    </>
  );
}

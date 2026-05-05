import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privatlivspolitik",
  description: "BetterLectios privatlivspolitik.",
}

export default function PrivatlivPage() {
  return (
    <div className="brand-root brand-root--text">
      <div className="bg-grid" />

      <div className="metadata meta-tl">
        <Link href="/" className="back-link">
          ← TILBAGE
        </Link>
      </div>

      <main className="text-page">
        <h1 className="text-page-title">
          <span className="title-top">Privacy</span>
          <span className="title-bottom">Policy</span>
        </h1>

        <p className="text-page-meta">Last updated: March 24, 2026</p>

        <div className="text-page-prose">
          <h2>Overview</h2>
          <p>
            BetterLectio is a browser extension that enhances the visual appearance and
            functionality of Lectio (lectio.dk). This privacy policy explains what data
            BetterLectio uses, why it is used, and how it is handled.
          </p>

          <h2>Data Use</h2>
          <p>
            BetterLectio is designed to keep data use to a minimum. We do not sell your data, we do
            not share your data for advertising, and we do not use your data for profiling or
            marketing.
          </p>
          <p>
            We only use limited data when it is necessary to provide BetterLectio features that
            Lectio does not offer on its own.
          </p>

          <h3>What the extension accesses</h3>
          <ul>
            <li>
              <strong>Lectio pages:</strong> The extension runs on lectio.dk pages to improve the
              interface and add BetterLectio features.
            </li>
            <li>
              <strong>Local storage:</strong> We use browser local storage to save preferences and
              cached extension data. This data stays in your browser unless a feature explicitly
              depends on an external service.
            </li>
          </ul>

          <h3>Services we use</h3>
          <ul>
            <li>
              <strong>Supabase:</strong> We use Supabase to power optional BetterLectio features
              that require server-side storage, such as profile pages and private classroom chats.
              If you use those features, relevant data is stored in Supabase so the feature can
              work.
            </li>
            <li>
              <strong>PostHog:</strong> We use PostHog only for error tracking and basic extension
              health monitoring for signed-in users. This helps us diagnose bugs and improve
              stability.
            </li>
            <li>
              <strong>UserJot:</strong> We use UserJot for user feedback and bug reporting through{" "}
              <code>betterlectio.userjot.com</code>. It is only used if you explicitly open the
              widget and submit feedback, bug reports, or similar messages.
            </li>
          </ul>

          <h3>What data may be sent to external services</h3>
          <ul>
            <li>
              <strong>For Supabase-backed features:</strong> Data you choose to create or update in
              BetterLectio features, such as profile information and private classroom chat
              content.
            </li>
            <li>
              <strong>For authentication and account linking:</strong> Limited information needed
              to connect your BetterLectio account to your Lectio identity, such as your student
              ID, school, and basic profile details.
            </li>
            <li>
              <strong>For error tracking:</strong> Technical information related to crashes and
              errors, plus limited account and school context needed to understand and fix the
              problem.
            </li>
            <li>
              <strong>For feedback and bug reports:</strong> Information you explicitly choose to
              submit through the UserJot widget.
            </li>
          </ul>
          <p>
            We do not use this data for advertising, data brokerage, or cross-site tracking. We
            only use it to make BetterLectio features work and to keep the extension reliable.
          </p>
          <p>
            UserJot is not used for passive tracking. If you do not open the widget and submit
            something yourself, no feedback or bug report is sent.
          </p>

          <h3>What we do NOT do</h3>
          <ul>
            <li>We do not sell your data</li>
            <li>We do not share your data with advertisers or data brokers</li>
            <li>We do not track your browsing activity</li>
            <li>We do not access your Lectio credentials</li>
            <li>We do not use your data for advertising or marketing</li>
            <li>We do not use cookies for tracking</li>
          </ul>

          <h2>Permissions Explained</h2>
          <ul>
            <li>
              <strong>storage:</strong> Used to save local preferences, cached data, and state
              needed for BetterLectio features.
            </li>
            <li>
              <strong>Network access to BetterLectio services:</strong> Used only when a feature
              needs Supabase or when error information is sent to PostHog.
            </li>
          </ul>

          <h2>Third Parties</h2>
          <p>
            BetterLectio uses the following service providers only to operate BetterLectio
            features:
          </p>
          <ul>
            <li>
              <strong>Supabase</strong> — data storage and authentication for optional BetterLectio
              features
            </li>
            <li>
              <strong>PostHog</strong> — error tracking and reliability monitoring
            </li>
            <li>
              <strong>UserJot</strong> — voluntary feedback and bug reporting
            </li>
          </ul>
          <p>
            We do not sell personal data. We do not share personal data with third parties for
            advertising purposes.
          </p>

          <h2>Open Source</h2>
          <p>
            BetterLectio is open source. You can review the complete source code at{" "}
            <a
              href="https://github.com/jonbng/betterlectio"
              target="_blank"
              rel="noreferrer noopener"
            >
              github.com/jonbng/betterlectio
            </a>
            .
          </p>

          <h2>Changes to This Policy</h2>
          <p>
            If we make changes to this privacy policy, we will update the &ldquo;Last
            updated&rdquo; date above.
          </p>

          <h2>Contact</h2>
          <p>
            If you have questions about this privacy policy, please open an issue on our GitHub
            repository:{" "}
            <a
              href="https://github.com/jonbng/betterlectio/issues"
              target="_blank"
              rel="noreferrer noopener"
            >
              github.com/jonbng/betterlectio/issues
            </a>
            .
          </p>

          <hr />

          <div className="summary">
            <strong>Summary</strong>
            BetterLectio keeps data use minimal. We do not sell or share your data for advertising.
            We only use Supabase for optional BetterLectio features like profile pages and private
            classroom chats, PostHog for error tracking and stability, and UserJot if you
            explicitly submit feedback or bug reports.
          </div>
        </div>
      </main>
    </div>
  )
}

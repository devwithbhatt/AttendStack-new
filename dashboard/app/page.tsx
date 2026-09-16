import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  IconArrowRight,
  IconBeach,
  IconBuilding,
  IconChartBar,
  IconCheck,
  IconClock,
  IconFingerprint,
  IconListCheck,
  IconShield,
  IconUsers,
  IconWallet,
} from "@tabler/icons-react";
import MarketingFooter from "components/marketing/MarketingFooter";
import MarketingHeader from "components/marketing/MarketingHeader";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "AttendStack | Modern Workforce Management",
  description:
    "Manage attendance, employees, leave, holidays, payroll, and workforce reporting from one clear workspace.",
};

const capabilities = [
  {
    icon: IconFingerprint,
    title: "Smart attendance",
    description:
      "Make daily check-ins simple with live status, working hours, and location-aware attendance.",
  },
  {
    icon: IconUsers,
    title: "Employee records",
    description:
      "Keep employee profiles, employment details, documents, and bank information organized.",
  },
  {
    icon: IconListCheck,
    title: "Leave workflows",
    description:
      "Give employees a clear way to request leave and managers a focused approval workspace.",
  },
  {
    icon: IconWallet,
    title: "Salary & payslips",
    description:
      "Bring salary records, payout breakdowns, and employee payslips into the same system.",
  },
  {
    icon: IconChartBar,
    title: "Workforce insights",
    description:
      "Understand attendance patterns, department activity, and monthly trends at a glance.",
  },
  {
    icon: IconBeach,
    title: "Holidays & rulebooks",
    description:
      "Keep company calendars and attendance policies visible to the whole workforce.",
  },
];

const workflow = [
  {
    number: "01",
    title: "Set up your workforce",
    description:
      "Organize employee profiles, departments, schedules, attendance rules, and company holidays.",
  },
  {
    number: "02",
    title: "Run the day in real time",
    description:
      "Employees check in, managers see live status, and leave requests move through one clear flow.",
  },
  {
    number: "03",
    title: "Review with confidence",
    description:
      "Use attendance reports, salary records, and activity insights to make informed decisions.",
  },
];

export default function Home() {
  return (
    <main className={styles.home}>
      <MarketingHeader />

      <section className={styles.hero} id="platform">
        <div className={styles.heroGlowOne} />
        <div className={styles.heroGlowTwo} />
        <div className={styles.container}>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}>
                <span className={styles.eyebrowDot} />
                Modern workforce operations
              </div>
              <h1>
                Your people.
                <br />
                Your workday.
                <br />
                <span>One clear system.</span>
              </h1>
              <p className={styles.heroDescription}>
                AttendStack brings attendance, employee operations, leave, and
                payroll visibility together so your team can focus on work that
                matters.
              </p>
              <div className={styles.heroActions}>
                <Link href="/sign-in" className={styles.primaryButton}>
                  Employee login
                  <IconArrowRight size={19} strokeWidth={2} />
                </Link>
                {/* <Link href="/register-organization" className={styles.secondaryButton}>
                  Set up your company
                </Link> */}
              </div>
              <div className={styles.heroPoints}>
                <span>
                  <IconCheck size={17} strokeWidth={2.5} />
                  Role-based access
                </span>
                <span>
                  <IconCheck size={17} strokeWidth={2.5} />
                  Live attendance
                </span>
                <span>
                  <IconCheck size={17} strokeWidth={2.5} />
                  Centralized records
                </span>
              </div>
            </div>

            <div className={styles.heroVisual} aria-label="AttendStack company dashboard preview">
              <div className={styles.visualBadge}>
                <IconBuilding size={17} strokeWidth={2} />
                Company workspace
              </div>
              <div className={`${styles.productFrame} ${styles.companyFrame}`}>
                <div className={styles.browserBar}>
                  <div className={styles.browserDots} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span>Company dashboard</span>
                  <IconShield size={15} strokeWidth={2} />
                </div>
                <Image
                  src="/images/product/company-dashboard.png"
                  alt="AttendStack company dashboard showing workforce metrics, attendance overview, and live activity"
                  width={1364}
                  height={646}
                  className={styles.productScreenshot}
                  sizes="(max-width: 1080px) 92vw, 55vw"
                  priority
                />
              </div>
              <div className={styles.statusBadge}>
                <span><IconCheck size={16} strokeWidth={3} /></span>
                <div>
                  <strong>Live workforce visibility</strong>
                  <small>Attendance, leave, and payroll</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.valueStrip} aria-label="Platform benefits">
        <div className={styles.container}>
          <div className={styles.valueGrid}>
            <div>
              <IconBuilding size={23} strokeWidth={1.8} />
              <span><strong>One workspace</strong><small>For the whole organization</small></span>
            </div>
            <div>
              <IconClock size={23} strokeWidth={1.8} />
              <span><strong>Real-time clarity</strong><small>Across every workday</small></span>
            </div>
            <div>
              <IconShield size={23} strokeWidth={1.8} />
              <span><strong>Role-based views</strong><small>For admins and employees</small></span>
            </div>
            <div>
              <IconChartBar size={23} strokeWidth={1.8} />
              <span><strong>Useful reporting</strong><small>For better decisions</small></span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.featuresSection} id="features">
        <div className={styles.container}>
          <div className={styles.sectionIntro}>
            <span className={styles.sectionLabel}>Built for the workday</span>
            <h2>Everything your workforce needs, without the clutter.</h2>
            <p>
              A connected set of tools for the daily tasks that keep your
              organization moving.
            </p>
          </div>

          <div className={styles.featureGrid}>
            {capabilities.map((feature) => {
              const FeatureIcon = feature.icon;
              return (
                <article className={styles.featureCard} key={feature.title}>
                  <span className={styles.featureIcon}>
                    <FeatureIcon size={24} strokeWidth={1.8} />
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className={styles.rolesSection}>
        <div className={styles.container}>
          <div className={styles.rolesGrid}>
            <div className={styles.rolesCopy}>
              <span className={styles.sectionLabel}>Designed around people</span>
              <h2>Clear for managers. Effortless for employees.</h2>
              <p>
                Everyone gets a focused view of what they need, with fewer
                handoffs and less time spent chasing updates.
              </p>

              <div className={styles.roleList}>
                <div>
                  <span><IconBuilding size={21} /></span>
                  <div>
                    <strong>Company workspace</strong>
                    <p>Manage people, attendance, requests, salary records, and policies.</p>
                  </div>
                </div>
                <div>
                  <span><IconFingerprint size={21} /></span>
                  <div>
                    <strong>Employee workspace</strong>
                    <p>Check in, request leave, review reports, and access payslips.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.employeeShowcase}>
              <div className={styles.employeeTop}>
                <div>
                  <span className={styles.onlineDot} />
                  Employee workspace
                </div>
                <IconFingerprint size={22} />
              </div>
              <div className={`${styles.productFrame} ${styles.employeeFrame}`}>
                <div className={styles.browserBar}>
                  <div className={styles.browserDots} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span>Employee dashboard</span>
                  <IconShield size={15} strokeWidth={2} />
                </div>
                <Image
                  src="/images/product/employee-dashboard.png"
                  alt="AttendStack employee dashboard showing attendance punch, live activity, and work readiness"
                  width={1366}
                  height={642}
                  className={styles.productScreenshot}
                  sizes="(max-width: 1080px) 92vw, 58vw"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.workflowSection} id="workflow">
        <div className={styles.container}>
          <div className={styles.sectionIntro}>
            <span className={styles.sectionLabel}>A simpler operating rhythm</span>
            <h2>From setup to insight in one connected flow.</h2>
          </div>
          <div className={styles.workflowGrid}>
            {workflow.map((step) => (
              <article className={styles.workflowCard} key={step.number}>
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.ctaSection}>
        <div className={styles.container}>
          <div className={styles.ctaCard}>
            <div className={styles.ctaGlow} />
            <div>
              <span className={styles.ctaLabel}>Ready for a clearer workday?</span>
              <h2>Bring your workforce into one organized system.</h2>
              <p>
                Access the workspace built for your role and keep the whole
                organization moving together.
              </p>
            </div>
            <div className={styles.ctaActions}>
              <Link href="/sign-in" className={styles.ctaPrimary}>
                Employee login
                <IconArrowRight size={18} />
              </Link>
              <Link href="/register-organization" className={styles.ctaSecondary}>
                Set up your company
              </Link>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}

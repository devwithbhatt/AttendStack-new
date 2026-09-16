import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  IconArrowRight,
  IconBeach,
  IconBuilding,
  IconCalendarCheck,
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
import styles from "../marketing-pages.module.css";

export const metadata: Metadata = {
  title: "AttendStack Capabilities | Workforce Management Platform",
  description:
    "Explore AttendStack capabilities for attendance, employees, leave, holidays, payroll visibility, reporting, and role-based workforce access.",
};

const capabilityCards = [
  {
    icon: IconFingerprint,
    title: "Attendance operations",
    description: "Keep daily attendance accurate, visible, and easy to review.",
    points: ["Check-in and check-out", "Live attendance status", "Working-hour records"],
  },
  {
    icon: IconUsers,
    title: "Employee management",
    description: "Organize the records that support every employee journey.",
    points: ["Employee profiles", "Employment details", "Documents and bank records"],
  },
  {
    icon: IconListCheck,
    title: "Leave workflows",
    description: "Make leave requests and company approvals clear for everyone.",
    points: ["Employee requests", "Manager approvals", "Leave visibility"],
  },
  {
    icon: IconWallet,
    title: "Salary visibility",
    description: "Keep salary history and payslip information available in one place.",
    points: ["Salary records", "Payslip access", "Payout breakdowns"],
  },
  {
    icon: IconChartBar,
    title: "Reports and insights",
    description: "Turn workforce activity into information teams can use.",
    points: ["Attendance reports", "Monthly trends", "Department overview"],
  },
  {
    icon: IconBeach,
    title: "Holidays and policies",
    description: "Keep work calendars and attendance rules easy to find.",
    points: ["Holiday calendar", "Company rulebook", "Shared policy access"],
  },
];

export default function CapabilitiesPage() {
  return (
    <main className={styles.page}>
      <MarketingHeader />

      <section className={styles.pageHero}>
        <div className={styles.container}>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <span className={styles.eyebrow}>
                <span />
                AttendStack capabilities
              </span>
              <h1>
                One platform for the <span>whole workday.</span>
              </h1>
              <p>
                Connect attendance, employee information, leave, salary
                visibility, and workforce reporting in focused company and
                employee workspaces.
              </p>
              <div className={styles.heroActions}>
                <Link href="/sign-in" className={styles.primaryAction}>
                  Employee login
                  <IconArrowRight size={18} />
                </Link>
                <Link href="/admin/sign-in" className={styles.secondaryAction}>
                  Company login
                </Link>
              </div>
            </div>

            <div className={styles.screenshotFrame}>
              <div className={styles.browserBar}>
                <div className={styles.browserDots} aria-hidden="true"><span /><span /><span /></div>
                <span>Company workspace</span>
                <IconShield size={15} />
              </div>
              <Image
                src="/images/product/company-dashboard.png"
                alt="AttendStack company dashboard"
                width={1364}
                height={646}
                priority
              />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeadingCentered}>
            <span className={styles.sectionLabel}>Connected workforce tools</span>
            <h2>Built for the tasks that happen every day.</h2>
            <p>
              Each AttendStack capability works as part of one organized system,
              reducing handoffs and keeping important information connected.
            </p>
          </div>
          <div className={styles.capabilityGrid}>
            {capabilityCards.map((capability) => {
              const CapabilityIcon = capability.icon;
              return (
                <article className={styles.capabilityCard} key={capability.title}>
                  <span className={styles.cardIcon}>
                    <CapabilityIcon size={23} strokeWidth={1.8} />
                  </span>
                  <h3>{capability.title}</h3>
                  <p>{capability.description}</p>
                  <ul>
                    {capability.points.map((point) => (
                      <li key={point}><IconCheck size={12} />{point}</li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className={styles.softSection}>
        <div className={styles.container}>
          <div className={styles.detailGrid}>
            <div className={styles.detailCopy}>
              <span className={styles.sectionLabel}>For employees</span>
              <h2>A personal workspace that keeps workday essentials close.</h2>
              <p>
                Employees can manage their own attendance and access workplace
                information without waiting for routine updates from HR.
              </p>
              <div className={styles.detailList}>
                <div><span><IconFingerprint size={13} /></span>Daily attendance punch and live status</div>
                <div><span><IconCalendarCheck size={13} /></span>Attendance history and monthly reports</div>
                <div><span><IconListCheck size={13} /></span>Leave requests, holidays, and rulebooks</div>
                <div><span><IconWallet size={13} /></span>Salary records and payslip access</div>
              </div>
            </div>
            <div className={styles.screenshotFrame}>
              <div className={styles.browserBar}>
                <div className={styles.browserDots} aria-hidden="true"><span /><span /><span /></div>
                <span>Employee workspace</span>
                <IconFingerprint size={15} />
              </div>
              <Image
                src="/images/product/employee-dashboard.png"
                alt="AttendStack employee dashboard"
                width={1366}
                height={642}
              />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={`${styles.detailGrid} ${styles.detailGridReverse}`}>
            <div className={styles.screenshotFrame}>
              <div className={styles.browserBar}>
                <div className={styles.browserDots} aria-hidden="true"><span /><span /><span /></div>
                <span>Company workspace</span>
                <IconBuilding size={15} />
              </div>
              <Image
                src="/images/product/company-dashboard.png"
                alt="AttendStack company workforce dashboard"
                width={1364}
                height={646}
              />
            </div>
            <div className={styles.detailCopy}>
              <span className={styles.sectionLabel}>For companies</span>
              <h2>Operational visibility without chasing updates.</h2>
              <p>
                Company teams get a clear view of workforce activity and the
                tools to manage the records, requests, and policies behind it.
              </p>
              <div className={styles.detailList}>
                <div><span><IconUsers size={13} /></span>Employee records and workforce directory</div>
                <div><span><IconClock size={13} /></span>Live attendance and today&apos;s activity</div>
                <div><span><IconChartBar size={13} /></span>Reports and department-level insight</div>
                <div><span><IconShield size={13} /></span>Focused role-based access</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.ctaSection}>
        <div className={styles.container}>
          <div className={styles.ctaCard}>
            <div>
              <span className={styles.sectionLabel}>Access AttendStack</span>
              <h2>Your workforce tools are ready in one connected system.</h2>
              <p>
                Employee access is always easy to find, with company operations
                available through the dedicated company portal.
              </p>
            </div>
            <div className={styles.ctaActions}>
              <Link href="/sign-in" className={styles.ctaPrimary}>Employee login</Link>
              <Link href="/admin/sign-in" className={styles.ctaSecondary}>Company login</Link>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}

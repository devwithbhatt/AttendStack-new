import type { Metadata } from "next";
import Link from "next/link";
import {
  IconArrowRight,
  IconCheck,
  IconRocket,
} from "@tabler/icons-react";
import MarketingFooter from "components/marketing/MarketingFooter";
import MarketingHeader from "components/marketing/MarketingHeader";
import styles from "../marketing-pages.module.css";

export const metadata: Metadata = {
  title: "Plans & Pricing | ZuperHR Workforce Management",
  description:
    "Simple, employee-wise ZuperHR pricing. Every plan includes a base set of employee seats, with extra seats billed per employee — cheaper when your organization is linked to SimplyJob.",
  alternates: {
    canonical: "https://zuperhr.in/pricing",
  },
  openGraph: {
    title: "Plans & Pricing | ZuperHR",
    description:
      "Employee-wise ZuperHR pricing with a discounted per-seat rate for organizations hiring on SimplyJob.",
    url: "https://zuperhr.in/pricing",
    siteName: "ZuperHR",
    type: "website",
  },
};

interface PlanItem {
  id: number;
  name: string;
  slug: string;
  description: string;
  monthly_price: number | string;
  yearly_price: number | string;
  included_employees: number;
  direct_overage_price_per_employee: number | string | null;
  simplyjob_overage_price_per_employee: number | string;
  badge_text: string;
  is_popular: boolean;
  requires_contact_sales: boolean;
  sort_order: number;
  features_list: string[];
}

async function getPlans(): Promise<PlanItem[]> {
  const base = process.env.NEXT_PUBLIC_API_ENDPOINT || "";
  try {
    const res = await fetch(`${base}/api/v1/plans/`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    const list: PlanItem[] = Array.isArray(data) ? data : data.results || [];
    return list
      .filter((p: any) => p.is_active !== false)
      .sort((a, b) => a.sort_order - b.sort_order);
  } catch {
    return [];
  }
}

export default async function PlansPage() {
  const plans = await getPlans();

  return (
    <main className={styles.page}>
      <MarketingHeader />

      <section className={styles.pageHero}>
        <div className={styles.container}>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <span className={styles.eyebrow}>
                <span />
                Plans &amp; Pricing
              </span>
              <h1>
                Pay for the seats <span>you actually use.</span>
              </h1>
              <p>
                Every ZuperHR plan includes a base set of employee seats.
                Need more? Extra seats are billed per employee — and cost
                less for organizations hiring on SimplyJob.
              </p>
              <div className={styles.heroActions}>
                <Link href="/register-organization" className={styles.primaryAction}>
                  Get started
                  <IconArrowRight size={18} />
                </Link>
                <Link href="/admin/sign-in" className={styles.secondaryAction}>
                  Company login
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.softSection}>
        <div className={styles.container}>
          {plans.length > 0 ? (
            <div className={styles.pricingGrid}>
              {plans.map((plan) => {
                const contactSales = plan.requires_contact_sales;
                return (
                  <div
                    key={plan.id}
                    className={`${styles.pricingCard} ${
                      plan.is_popular ? styles.pricingCardPopular : ""
                    }`}
                  >
                    {plan.badge_text && (
                      <span className={styles.pricingBadge}>{plan.badge_text}</span>
                    )}
                    <h3 className={styles.pricingName}>{plan.name}</h3>
                    <p className={styles.pricingDescription}>{plan.description}</p>

                    <div className={styles.pricingPriceRow}>
                      {contactSales ? (
                        <span className={styles.pricingPrice}>Custom</span>
                      ) : (
                        <>
                          <span className={styles.pricingPrice}>₹{plan.monthly_price}</span>
                          <span className={styles.pricingPeriod}>/month</span>
                        </>
                      )}
                    </div>
                    <div className={styles.pricingSeats}>
                      Includes {plan.included_employees} employee seats
                    </div>

                    <div className={styles.pricingOverageBox}>
                      <div className={styles.pricingOverageRow}>
                        <span>Extra seat, direct</span>
                        <strong>
                          {plan.direct_overage_price_per_employee != null
                            ? `₹${plan.direct_overage_price_per_employee}`
                            : "Contact Sales"}
                        </strong>
                      </div>
                      <div className={`${styles.pricingOverageRow} ${styles.pricingOverageSimplyJob}`}>
                        <span>Extra seat, via SimplyJob</span>
                        <strong>₹{plan.simplyjob_overage_price_per_employee}</strong>
                      </div>
                    </div>

                    <div className={styles.checkList}>
                      {plan.features_list.map((feature) => (
                        <div key={feature}>
                          <span><IconCheck size={12} strokeWidth={3} /></span>
                          {feature}
                        </div>
                      ))}
                    </div>

                    {contactSales ? (
                      <a
                        href="mailto:onboarding@bhattsquare.com?subject=ZuperHR%20Enterprise%20Plan"
                        className={`${styles.pricingCta} ${styles.pricingCtaOutline}`}
                      >
                        Contact Sales
                      </a>
                    ) : (
                      <Link href="/register-organization" className={styles.pricingCta}>
                        Get started
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={styles.pricingSeats}>
              Pricing is temporarily unavailable. Please check back shortly.
            </p>
          )}

          <div className={styles.pricingSimplyJobBand}>
            <div>
              <h3>Hiring on SimplyJob?</h3>
              <p>
                Link your SimplyJob organization ID and every extra employee
                seat drops to ₹250/month across every ZuperHR plan —
                cheaper than buying seats directly here.
              </p>
            </div>
            <a
              href="https://simplyjob.in"
              target="_blank"
              rel="noreferrer"
              className={styles.pricingCta}
            >
              <IconRocket size={16} />
              Open SimplyJob
            </a>
          </div>
        </div>
      </section>

      <section className={styles.ctaSection}>
        <div className={styles.container}>
          <div className={styles.ctaCard}>
            <div>
              <span className={styles.sectionLabel}>Ready when you are</span>
              <h2>Start your ZuperHR workspace today.</h2>
              <p>
                Set up your organization, invite employees, and start
                tracking attendance in minutes.
              </p>
            </div>
            <div className={styles.ctaActions}>
              <Link href="/register-organization" className={styles.ctaPrimary}>Get started</Link>
              <Link href="/admin/sign-in" className={styles.ctaSecondary}>Company login</Link>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}

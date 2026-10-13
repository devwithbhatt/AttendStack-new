import Image from "next/image";
import Link from "next/link";
import {
  IconArrowRight,
  IconBuilding,
  IconFingerprint,
  IconShieldCheck,
} from "@tabler/icons-react";
import styles from "./marketing.module.css";

export default function MarketingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerContainer}>
        <div className={styles.footerTop}>
          <div className={styles.footerBrandColumn}>
            <Link href="/" className={styles.footerBrand}>
              <Image
                src="/images/brand/logo/logo-white-bg.jpg"
                alt="ZuperHR"
                width={140}
                height={42}
                style={{ height: "42px", width: "auto", borderRadius: "6px" }}
              />
            </Link>
            <p>
              A clear, connected workspace for attendance, people operations,
              leave, payroll visibility, and the everyday employee experience.
            </p>
            <a
              href="https://bhattsquare.com"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.bhattSquareLink}
            >
              Visit Bhatt Square
              <IconArrowRight size={15} />
            </a>
          </div>

          <div className={styles.footerColumn}>
            <h2>Product</h2>
            <Link href="/capabilities">Capabilities</Link>
            <Link href="/#platform">Platform overview</Link>
            <Link href="/#workflow">How it works</Link>
            <Link href="/#features">Workforce tools</Link>
          </div>

          <div className={styles.footerColumn}>
            <h2>Company</h2>
            <Link href="/about">About us</Link>
            <a href="https://bhattsquare.com" target="_blank" rel="noopener noreferrer">
              Bhatt Square
            </a>
            <Link href="/forgot-password">Account recovery</Link>
          </div>

          <div className={styles.accessColumn}>
            <h2>Access ZuperHR</h2>
            <p>Choose the workspace built for your role.</p>
            <Link href="/sign-in" className={styles.footerEmployeeLogin}>
              <span>
                <IconFingerprint size={19} />
                <span>
                  <strong>Employee login</strong>
                  <small>Attendance, leaves, salary, and profile</small>
                </span>
              </span>
              <IconArrowRight size={17} />
            </Link>
            <Link href="/admin/sign-in" className={styles.footerCompanyLogin}>
              <IconBuilding size={17} />
              Company login
            </Link>
            {/* <Link href="/super-admin/login" className={styles.footerCompanyLogin} style={{ color: "#f59e0b", marginTop: "10px" }}>
              <IconShieldCheck size={17} />
              Super Admin login
            </Link> */}

          </div>
        </div>

        <div className={styles.footerBottom}>
          <div className={styles.footerCopyright}>
            <span>&copy; {new Date().getFullYear()} ZuperHR. All rights reserved.</span>
            <Link href="/super-admin/login" className={styles.footerTrust} style={{ textDecoration: "none", color: "inherit" }} title="Super Admin Access">
              <IconShieldCheck size={15} />
            </Link>
          </div>
          <span className={styles.footerCredits}>
            <span>
              Built by{" "}
              <a href="https://bhattsquare.com" target="_blank" rel="noopener noreferrer">
                Bhatt Square Pvt. Ltd.
              </a>
            </span>
          </span>
        </div>
      </div>
    </footer>
  );
}

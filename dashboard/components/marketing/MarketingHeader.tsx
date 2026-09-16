"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  IconArrowUpRight,
  IconBuilding,
  IconLogin2,
  IconMenu2,
  IconX,
} from "@tabler/icons-react";
import styles from "./marketing.module.css";

export default function MarketingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link
          href="/"
          className={styles.brand}
          aria-label="AttendStack home"
          onClick={closeMenu}
        >
          <span className={styles.logoWrap}>
            <Image
              src="/images/brand/logo/android-chrome-192x192.png"
              alt=""
              width={38}
              height={38}
              priority
            />
          </span>
          <span className={styles.brandCopy}>
            <strong>AttendStack</strong>
            <small>A product of Bhatt Square</small>
          </span>
        </Link>

        <nav className={styles.navLinks} aria-label="Website navigation">
          <Link href="/">Home</Link>
          <Link href="/about">About us</Link>
          <Link href="/capabilities">Capabilities</Link>
          <Link href="/#workflow">How it works</Link>
        </nav>

        <div className={styles.navActions}>
          <Link href="/admin/sign-in" className={styles.companyLogin}>
            Company login
          </Link>
          <Link href="/sign-in" className={styles.employeeLogin}>
            <IconLogin2 size={17} strokeWidth={2} />
            Employee login
            <IconArrowUpRight size={15} strokeWidth={2} />
          </Link>
          <button
            type="button"
            className={styles.menuToggle}
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="marketing-mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <IconX size={21} /> : <IconMenu2 size={21} />}
          </button>
        </div>

        <div
          id="marketing-mobile-menu"
          className={`${styles.mobileMenu} ${menuOpen ? styles.mobileMenuOpen : ""}`}
        >
          <nav className={styles.mobileNavLinks} aria-label="Mobile website navigation">
            <Link href="/" onClick={closeMenu}>Home</Link>
            <Link href="/about" onClick={closeMenu}>About us</Link>
            <Link href="/capabilities" onClick={closeMenu}>Capabilities</Link>
            <Link href="/#workflow" onClick={closeMenu}>How it works</Link>
          </nav>
          <div className={styles.mobileMenuActions}>
            <Link
              href="/sign-in"
              className={styles.mobileEmployeeLogin}
              onClick={closeMenu}
            >
              <span>
                <IconLogin2 size={18} />
                <span>
                  <strong>Employee login</strong>
                  <small>Access your workday</small>
                </span>
              </span>
              <IconArrowUpRight size={17} />
            </Link>
            <Link
              href="/admin/sign-in"
              className={styles.mobileCompanyLogin}
              onClick={closeMenu}
            >
              <IconBuilding size={17} />
              Company login
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

import type { Metadata, Viewport } from "next";
import { Public_Sans } from "next/font/google";

import ClientWrapper from "components/common/ClientWrapper";

import "@tabler/icons-webfont/dist/tabler-icons.min.css";
import "simplebar-react/dist/simplebar.min.css";
import "swiper/swiper-bundle.css";
import "styles/theme.scss";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://attendance.nextgenapplication.com"),
  applicationName: "AttendStack",
  title: {
    default: "AttendStack | Enterprise Workforce Management & HRMS Software",
    template: "%s | AttendStack",
  },
  description:
    "Enterprise HRMS & workforce management platform developed by Bhatt Square Pvt. Ltd. Automate geofenced mobile attendance, biometric device sync, multi-shift rosters with grace periods, leave proration, and Indian statutory payroll with PF, ESIC, and TDS compliance.",
  keywords: [
    "AttendStack",
    "Workforce Management Software",
    "HRMS India",
    "Attendance Management System",
    "Geofencing Attendance App",
    "Biometric Attendance System",
    "Multi-Shift Scheduling Software",
    "Shift Roster Management",
    "Automated Payroll Software India",
    "Statutory Payroll PF ESIC PT",
    "Leave Management System",
    "Prorated Leave Entitlement",
    "Employee Self Service Portal",
    "Time and Attendance Tracking",
    "HR Software for Startups and Enterprises",
    "Bhatt Square Pvt Ltd",
    "Bhatt Square",
    "Akshat Bhatt",
    "Aman ktyr",
    "Cloud HRMS Software",
    "Digital Payslip Generator",
  ],
  authors: [
    { name: "Bhatt Square Pvt. Ltd.", url: "https://bhattsquare.com" },
    { name: "Akshat Bhatt" },
  ],
  creator: "Bhatt Square Pvt. Ltd.",
  publisher: "Bhatt Square Pvt. Ltd.",
  category: "Enterprise HRMS & Payroll Software",
  classification: "Business, Workforce Management, Payroll, Enterprise Software",
  manifest: "/manifest.json",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AttendStack",
  },
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/favicon.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.png",
    apple: [
      { url: "/favicon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  alternates: {
    canonical: "https://attendance.nextgenapplication.com",
    languages: {
      "en-IN": "https://attendance.nextgenapplication.com",
      "en-US": "https://attendance.nextgenapplication.com",
      "x-default": "https://attendance.nextgenapplication.com",
    },
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "https://attendance.nextgenapplication.com",
    siteName: "AttendStack",
    title: "AttendStack | Enterprise Workforce Management & HRMS Software",
    description:
      "Automate geofenced attendance, multi-shift rosters with grace periods, leave entitlements, and statutory Indian payroll in one unified platform.",
    images: [
      {
        url: "/images/brand/logo/logo.png",
        width: 1200,
        height: 630,
        alt: "AttendStack Enterprise HRMS & Workforce Management Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AttendStack | Enterprise Workforce Management & HRMS Software",
    description:
      "Automate geofenced attendance, multi-shift rosters with grace periods, leave entitlements, and statutory Indian payroll in one unified platform.",
    images: ["/images/brand/logo/logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "WXgpCm7smrPbuCEaiWjSUBw0P5-NHi7MG_IilJc86t4",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://attendance.nextgenapplication.com/#website",
      url: "https://attendance.nextgenapplication.com",
      name: "AttendStack",
      description: "Modern Workforce Management & Enterprise HRMS Platform",
      publisher: {
        "@id": "https://bhattsquare.com/#organization",
      },
      inLanguage: "en-IN",
    },
    {
      "@type": "Organization",
      "@id": "https://bhattsquare.com/#organization",
      name: "Bhatt Square Pvt. Ltd.",
      legalName: "Bhatt Square Private Limited",
      url: "https://bhattsquare.com",
      logo: "https://attendance.nextgenapplication.com/images/brand/logo/logo.png",
      sameAs: [
        "https://bhattsquare.com",
        "https://attendance.nextgenapplication.com",
      ],
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: "support@bhattsquare.com",
          url: "https://bhattsquare.com",
        },
      ],
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://attendance.nextgenapplication.com/#software",
      name: "AttendStack",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Workforce Management & HRMS",
      operatingSystem: "Web, Android, iOS, Windows, macOS",
      softwareVersion: "2.4.0",
      url: "https://attendance.nextgenapplication.com",
      description:
        "Enterprise cloud HRMS engineered by Bhatt Square Pvt. Ltd. featuring GPS geofencing attendance, biometric device integration, multi-shift scheduling with grace thresholds, leave proration, and Indian statutory payroll with PF, ESIC, and TDS compliance.",
      publisher: {
        "@id": "https://bhattsquare.com/#organization",
      },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "INR",
      },
      featureList: [
        "GPS Geofencing and IP-Restricted Mobile Attendance",
        "Biometric Hardware Sync (ZKTEco, Essl, Matrix)",
        "Multi-Shift Scheduling with Late Grace Thresholds & Early Checkout Penalties",
        "Automated Leave Entitlement with First-Year Proration and Sandwich Rules",
        "Statutory Indian Payroll with PF, ESIC, Professional Tax & TDS Calculation",
        "One-Click Bank Payout Sheets & Digital Payslip Generation",
        "Employee Self-Service (ESS) Portal with Real-Time Attendance Correction",
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClientWrapper>
      <html lang="en" className="expanded" data-scroll-behavior="smooth">
        <head>
          <meta name="google-site-verification" content="WXgpCm7smrPbuCEaiWjSUBw0P5-NHi7MG_IilJc86t4" />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        </head>
        <body className={`${publicSans.variable}`}>
          {children}
          <ToastContainer />
        </body>
      </html>
    </ClientWrapper>
  );
}
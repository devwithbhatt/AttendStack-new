import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join Organization | ZuperHR Employee Onboarding",
  description:
    "Accept your company invitation, set up your employee credentials, and access the ZuperHR workforce portal.",
  alternates: {
    canonical: "https://zuperhr.in/join",
  },
  openGraph: {
    title: "Join Organization | ZuperHR Employee Onboarding",
    description: "Accept your company invitation and set up your ZuperHR employee account.",
    url: "https://zuperhr.in/join",
    siteName: "ZuperHR",
    type: "website",
  },
};

export default function JoinLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

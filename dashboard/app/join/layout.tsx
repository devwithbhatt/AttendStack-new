import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join Organization | AttendStack Employee Onboarding",
  description:
    "Accept your company invitation, set up your employee credentials, and access the AttendStack workforce portal.",
  alternates: {
    canonical: "https://attendance.nextgenapplication.com/join",
  },
  openGraph: {
    title: "Join Organization | AttendStack Employee Onboarding",
    description: "Accept your company invitation and set up your AttendStack employee account.",
    url: "https://attendance.nextgenapplication.com/join",
    siteName: "AttendStack",
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

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Authentication | AttendStack",
  description: "Sign in or register your organization on AttendStack workforce management system.",
  robots: {
    index: true,
    follow: true,
  },
};

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return <div>{children}</div>;
}
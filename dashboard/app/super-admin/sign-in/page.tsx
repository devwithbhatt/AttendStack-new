"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SuperAdminSignInRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/super-admin/login");
  }, [router]);

  return null;
}

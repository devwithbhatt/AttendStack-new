"use client";

import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { BrandingProvider } from "context/BrandingContext";
import Header from "layouts/header/Header";
import SuperAdminSidebar from "layouts/SuperAdminSidebar";
import { Spinner } from "react-bootstrap";

interface SuperAdminLayoutProps {
  children: React.ReactNode;
}

const SuperAdminLayout: React.FC<SuperAdminLayoutProps> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  const isLoginPage = pathname === "/super-admin/login" || pathname === "/super-admin/sign-in";

  useEffect(() => {
    if (isLoginPage) {
      setLoading(false);
      setAuthorized(true);
      return;
    }

    const token = localStorage.getItem("authToken");
    const userData = localStorage.getItem("user");

    if (!token || !userData) {
      router.replace("/super-admin/login");
      return;
    }

    try {
      const parsedUser = JSON.parse(userData);
      if (parsedUser.role === "SUPER_ADMIN" || parsedUser.is_superuser) {
        setAuthorized(true);
      } else {
        router.replace("/dashboard");
      }
    } catch {
      router.replace("/super-admin/login");
    } finally {
      setLoading(false);
    }
  }, [pathname, isLoginPage, router]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (loading || !authorized) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100 bg-dark text-white">
        <div className="text-center">
          <Spinner animation="border" variant="warning" />
          <p className="mt-2 text-white-50 font-monospace small">Verifying Super Admin Access...</p>
        </div>
      </div>
    );
  }

  return (
    <BrandingProvider>
      <div className="super-admin-root-layout">
        <SuperAdminSidebar hideLogo={false} containerId="miniSidebar" currentPath={pathname} />
        <div id="content" className="position-relative h-100 d-flex flex-column" style={{ minHeight: "100vh" }}>
          <Header />
          <div className="custom-container" style={{ flex: "1 0 auto", background: "#f8fafc" }}>
            {children}
          </div>
          <div className="custom-container py-3 border-top bg-white">
            <div className="d-flex justify-content-between align-items-center small text-secondary">
              <span>© 2026 AttendStack Enterprise. <span className="fw-semibold text-dark">Super Admin Command Center</span></span>
              <span>Version - beta 2.0.0 </span>
            </div>
          </div>
        </div>
      </div>
    </BrandingProvider>
  );
};

export default SuperAdminLayout;

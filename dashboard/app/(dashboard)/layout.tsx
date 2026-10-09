"use client"
import { useEffect, useState } from "react";
import { usePathname, useRouter } from 'next/navigation';

import { BrandingProvider } from "context/BrandingContext";
import { getTokenExpiryMs, refreshAccessToken, REFRESH_LEAD_MS } from "helper/authSession";
import Header from "layouts/header/Header";
import Sidebar from "layouts/Sidebar";
import PlanExpiryAlertBanner from "components/PlanExpiryAlertBanner";
import GlobalChatNotificationListener from "components/chat/GlobalChatNotificationListener";

import ModuleAccessDenied from "components/ModuleAccessDeniedPaywall";

interface DashboardProps {
  children: React.ReactNode;
}

const HOME_ROUTE = "/";

const getRouteModuleInfo = (pathname: string): { moduleKey: string | null; title: string; adminOnly?: boolean } | null => {
  if (pathname.startsWith("/plans")) {
    return { moduleKey: null, title: "Plans & Billing", adminOnly: true };
  }
  if (pathname.startsWith("/salary")) {
    return { moduleKey: "salary_area", title: "Salary & Increments" };
  }
  if (pathname.startsWith("/employees")) {
    return { moduleKey: "employees", title: "Employees Directory" };
  }
  if (pathname.startsWith("/attendance")) {
    return { moduleKey: "attendance", title: "Attendance & Shifts" };
  }
  if (pathname.startsWith("/leaves") || pathname.startsWith("/leave-requests")) {
    return { moduleKey: "leaves", title: "Leave Requests" };
  }
  if (pathname.startsWith("/holidays")) {
    return { moduleKey: "holidays", title: "Holidays Calendar" };
  }
  if (pathname.startsWith("/tasks")) {
    return { moduleKey: "tasks", title: "Projects & Tasks" };
  }
  if (pathname.startsWith("/chat")) {
    return { moduleKey: "chat", title: "Chat & Messages" };
  }
  if (pathname.startsWith("/settings")) {
    return { moduleKey: "settings", title: "Company Settings" };
  }
  if (pathname.startsWith("/live-monitoring")) {
    return { moduleKey: "monitoring", title: "Live Monitoring" };
  }
  return null;
};

const clearSession = () => {
  localStorage.removeItem("authToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("user");
};


const DashboardLayout: React.FC<DashboardProps> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        const u = JSON.parse(storedUser);
        setUser(u);
        setUserRole(u?.role || null);
      } catch { }
    }

    const token = localStorage.getItem("authToken");
    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/accounts/profile/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((profile) => {
          if (profile && profile.id) {
            setUser(profile);
            setUserRole(profile.role || null);
            localStorage.setItem("user", JSON.stringify(profile));
          }
        })
        .catch(() => { });
    }
  }, [pathname]);

  // Only a true Admin (Super Admin, or a Role explicitly flagged Full Access)
  // lands on the Admin Dashboard overview page. Plain Employees always get
  // the fixed self-service sidebar. A restricted HR/Sub-Admin role (granted
  // specific module permissions but not Full Access) is NOT a plain Employee
  // sidebar-wise — they get the same admin-style sidebar as a full Admin,
  // just filtered down to only the modules their Role grants View access to
  // (see the moduleKey-based filtering in Sidebar.tsx).
  const isAdminUser = user?.is_admin === true;
  const isEmployeeSidebar = user?.role === "EMPLOYEE";

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    const storedUser = localStorage.getItem("user");

    if (!token || !storedUser) {
      router.replace("/sign-in");
      return;
    }

    // Stay signed in: swap the refresh token for a new access token shortly
    // before it expires (immediately if it already has, e.g. after sleep).
    // Only an invalid refresh token ends the session; offline just retries.
    let expiryTimer: number | undefined;
    let cancelled = false;
    const scheduleRefresh = (accessToken: string | null) => {
      const exp = getTokenExpiryMs(accessToken);
      if (!exp) return;
      window.clearTimeout(expiryTimer);
      expiryTimer = window.setTimeout(runRefresh, Math.max(exp - Date.now() - REFRESH_LEAD_MS, 0));
    };
    const runRefresh = async () => {
      const outcome = await refreshAccessToken();
      if (cancelled) return;
      if (outcome.status === "refreshed") {
        scheduleRefresh(outcome.access);
      } else if (outcome.status === "invalid") {
        clearSession();
        router.replace(HOME_ROUTE);
      } else {
        window.clearTimeout(expiryTimer);
        expiryTimer = window.setTimeout(runRefresh, 60_000);
      }
    };
    // Coming back to the tab (or waking the laptop): catch up if needed.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const exp = getTokenExpiryMs(localStorage.getItem("authToken"));
      if (exp && exp - Date.now() <= REFRESH_LEAD_MS) runRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    scheduleRefresh(token);

    try {
      const parsedUser = JSON.parse(storedUser);
      const isSharedRoute = pathname.startsWith("/chat");
      const parsedIsAdmin = parsedUser?.is_admin === true;
      const isPlainEmployee = parsedUser?.role === "EMPLOYEE";
      const isRestrictedManager = parsedUser?.role === "SUB_ADMIN" && !parsedIsAdmin;

      // Plain Employees always stay within the Employee Dashboard.
      if (isPlainEmployee && !pathname.startsWith("/employee-dashboard") && !isSharedRoute) {
        router.replace("/employee-dashboard");
        return;
      }
      // A restricted HR/Sub-Admin role (granted specific module permissions,
      // but not flagged Full Access) lands on the Employee Dashboard by
      // default, same as a plain Employee — but unlike a plain Employee, they
      // may still visit whichever admin-side module pages their Role grants
      // View access to (checked below), instead of only /employee-dashboard.
      if (isRestrictedManager && (pathname === "/dashboard" || pathname === HOME_ROUTE)) {
        router.replace("/employee-dashboard");
        return;
      }
      if (parsedIsAdmin && pathname.startsWith("/employee-dashboard")) {
        router.replace("/dashboard");
        return;
      }

      // Restricted HR/Sub-Admin roles may only visit a specific admin-side
      // module page (e.g. /employees) if their assigned Role grants at least
      // View access to that module — otherwise they're sent back to their
      // Employee Dashboard, never the full Admin Dashboard overview.
      if (isRestrictedManager) {
        const routeInfo = getRouteModuleInfo(pathname);
        if (routeInfo && routeInfo.moduleKey !== "chat") {
          if (routeInfo.adminOnly) {
            router.replace("/employee-dashboard");
            return;
          }
          if (routeInfo.moduleKey) {
            const userPerms = parsedUser.permissions || {};
            let hasView = false;
            if (routeInfo.moduleKey === "salary_area") {
              const pView = typeof userPerms.payroll === "object" && userPerms.payroll !== null ? Boolean(userPerms.payroll.view) : Boolean(userPerms.payroll);
              const iView = typeof userPerms.increments === "object" && userPerms.increments !== null ? Boolean(userPerms.increments.view) : Boolean(userPerms.increments);
              hasView = pView || iView;
            } else {
              const modPerm = userPerms[routeInfo.moduleKey];
              hasView = typeof modPerm === "object" && modPerm !== null ? Boolean(modPerm.view) : Boolean(modPerm);
            }
            if (!hasView) {
              router.replace("/employee-dashboard");
              return;
            }
          }
        }
      }
    } catch {
      localStorage.removeItem("authToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
      router.replace("/sign-in");
    }

    return () => {
      cancelled = true;
      window.clearTimeout(expiryTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname, router]);

  const isChatPage = pathname.startsWith("/chat");

  // Determine if current route is blocked for sub-admin
  const routeInfo = getRouteModuleInfo(pathname);
  const isSubAdmin = user?.role === "SUB_ADMIN";
  const userPermissions = user?.permissions || {};
  let isAccessDenied = false;
  let deniedTitle = "";

  // Full-access roles see everything; chat is open to everyone.
  if (isSubAdmin && !isAdminUser && routeInfo && routeInfo.moduleKey !== "chat") {
    if (routeInfo.adminOnly) {
      isAccessDenied = true;
      deniedTitle = routeInfo.title;
    } else if (routeInfo.moduleKey) {
      let hasView = false;
      if (routeInfo.moduleKey === "salary_area") {
        const pView = typeof userPermissions.payroll === "object" && userPermissions.payroll !== null ? Boolean(userPermissions.payroll.view) : Boolean(userPermissions.payroll);
        const iView = typeof userPermissions.increments === "object" && userPermissions.increments !== null ? Boolean(userPermissions.increments.view) : Boolean(userPermissions.increments);
        hasView = pView || iView;
      } else {
        const modPerm = userPermissions[routeInfo.moduleKey];
        hasView = typeof modPerm === "object" && modPerm !== null ? Boolean(modPerm.view) : Boolean(modPerm);
      }
      if (!hasView) {
        isAccessDenied = true;
        deniedTitle = routeInfo.title;
      }
    }
  }

  return (
    <BrandingProvider>
      <GlobalChatNotificationListener />
      <div>
        <Sidebar hideLogo={false} containerId='miniSidebar' currentPath={pathname} isEmployee={isEmployeeSidebar} user={user} />
        <div id='content' className={`position-relative d-flex flex-column ${isChatPage ? 'chat-content-wrap' : 'min-vh-100'}`} style={{ minHeight: "100vh" }}>
          <Header />
          <PlanExpiryAlertBanner />
          <div
            className={isChatPage ? "" : "custom-container"}
            style={
              isChatPage
                ? {
                  flex: "1 1 0%",
                  height: "calc(100vh - 60px)",
                  maxHeight: "calc(100vh - 60px)",
                  minHeight: 0,
                  padding: 0,
                  margin: 0,
                  maxWidth: "100%",
                  overflow: "hidden",
                }
                : { flex: "1 0 auto" }
            }
          >
            {isAccessDenied ? <ModuleAccessDenied moduleTitle={deniedTitle} /> : children}
          </div>
          {!isChatPage && (
            <footer className='custom-container mt-auto pt-3 pb-1 text-muted small border-top' style={{ borderColor: '#f1f5f9' }}>
              <span className='me-1'>© 2026 AttendStack. A <a href="https://bhattsquare.com" target="_blank" rel="noopener noreferrer" className="text-primary fw-medium text-decoration-none">Bhatt Square</a> Project. <span className='text-secondary ms-2'>Version 2.7.11</span></span>
            </footer>
          )}
        </div>
      </div>
      {isChatPage && (
        <style jsx global>{`
          html #content.chat-content-wrap,
          html.collapsed #content.chat-content-wrap,
          html.expanded #content.chat-content-wrap {
            padding-top: 60px !important;
            padding-bottom: 0 !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
            height: 100vh !important;
            min-height: 100vh !important;
            max-height: 100vh !important;
            overflow: hidden !important;
          }

          html #content.chat-content-wrap .navbar-glass,
          html.collapsed #content.chat-content-wrap .navbar-glass,
          html.expanded #content.chat-content-wrap .navbar-glass {
            background-color: #ffffff !important;
            backdrop-filter: blur(12px) !important;
            border-bottom: 1px solid #e2e8f0 !important;
            box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.04) !important;
            height: 60px !important;
          }
        `}</style>
      )}
    </BrandingProvider>
  );
};

export default DashboardLayout;

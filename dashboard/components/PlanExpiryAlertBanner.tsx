"use client";

import React, { useEffect, useState } from "react";
import { Alert, Button, Badge } from "react-bootstrap";
import { IconAlertTriangle, IconExternalLink, IconRefresh } from "@tabler/icons-react";
import Link from "next/link";

const BASE_URL = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1`;

const authHeaders = (): HeadersInit => {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function PlanExpiryAlertBanner() {
  const [org, setOrg] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  const fetchPlanStatus = async () => {
    try {
      let res = await fetch(`${BASE_URL}/organizations/me/`, { headers: authHeaders() });
      if (!res.ok) {
        res = await fetch(`${BASE_URL}/organizations/?scope=me`, { headers: authHeaders() });
      }
      if (!res.ok) {
        res = await fetch(`${BASE_URL}/organizations/`, { headers: authHeaders() });
      }
      if (res.ok) {
        const data = await res.json();
        const orgData = Array.isArray(data) ? data[0] : (data.results ? data.results[0] : data);
        if (orgData) {
          setOrg(orgData);
          if (typeof window !== "undefined") {
            localStorage.setItem("organization", JSON.stringify(orgData));
          }
        }
      }
    } catch {
      // Ignore network errors
    }
  };

  useEffect(() => {
    fetchPlanStatus();
    const interval = setInterval(fetchPlanStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  if (dismissed || !org) return null;

  const isExpired = Boolean(org.is_plan_expired);
  const isExpiringSoon = Boolean(org.is_plan_expiring_soon);

  if (!isExpired && !isExpiringSoon) return null;

  const simplyJobUrl =
    process.env.NEXT_PUBLIC_SIMPLYJOB_URL ||
    (typeof window !== "undefined" && window.location.hostname === "localhost"
      ? "http://localhost:3009"
      : "https://simplyjob.in");

  const isSimplyJob = org.plan_source === "SIMPLYJOB";

  return (
    <Alert
      variant={isExpired ? "danger" : "warning"}
      className="m-0 border-0 rounded-0 py-2.5 px-4 shadow-sm"
      style={{
        borderBottom: `2px solid ${isExpired ? "#ef4444" : "#f59e0b"}`,
        zIndex: 1050,
      }}
    >
      <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2">
        <div className="d-flex align-items-center gap-2">
          <IconAlertTriangle size={20} className={isExpired ? "text-danger" : "text-warning"} />
          <div>
            <strong className="me-1">
              {isExpired ? "Subscription Expired:" : "Subscription Expiring Soon:"}
            </strong>
            <span>
              Your <strong>{org.plan_name || "Standard Plan"}</strong>{" "}
              {isExpired
                ? "has expired."
                : `expires in ${org.days_until_plan_expiry ?? 0} days.`}{" "}
              Please renew to prevent interruption to employee onboarding and attendance tracking.
            </span>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          {isSimplyJob ? (
            <Button
              variant={isExpired ? "danger" : "warning"}
              size="sm"
              className="fw-bold d-flex align-items-center gap-1.5 shadow-sm"
              onClick={() => window.open(`${simplyJobUrl}/company/billing`, "_blank")}
            >
              Renew on SimplyJob <IconExternalLink size={15} />
            </Button>
          ) : (
            <Link href="/plans" className={`btn btn-sm fw-bold shadow-sm ${isExpired ? "btn-danger" : "btn-warning"}`}>
              Renew Subscription
            </Link>
          )}
          <Button
            variant="link"
            size="sm"
            className="text-decoration-none text-muted p-0 ms-2"
            onClick={() => setDismissed(true)}
            title="Dismiss for this session"
          >
            ✕
          </Button>
        </div>
      </div>
    </Alert>
  );
}

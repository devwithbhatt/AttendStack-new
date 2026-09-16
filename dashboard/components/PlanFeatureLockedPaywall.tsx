"use client";

import React from "react";
import Link from "next/link";
import { Card, Button, Badge } from "react-bootstrap";
import {
  IconLock,
  IconRocket,
  IconCheck,
  IconShieldLock,
  IconArrowRight,
  IconLayoutDashboard,
} from "@tabler/icons-react";

interface PlanFeatureLockedPaywallProps {
  featureTitle: string;
  featureDescription?: string;
  benefits?: string[];
  requiredTier?: string;
}

export default function PlanFeatureLockedPaywall({
  featureTitle,
  featureDescription = "This feature module is not included in your current workspace subscription. Upgrade your AttendStack plan to unlock instant access.",
  benefits = [
    "Full access to this module for all managers & admins",
    "Automated reporting & PDF/CSV export engine",
    "Real-time synchronization across your workforce",
    "Priority support & SLA guarantee",
  ],
  requiredTier = "Growth Pro or Enterprise",
}: PlanFeatureLockedPaywallProps) {
  return (
    <div className="py-4 py-md-5 d-flex justify-content-center align-items-center">
      <Card
        className="border shadow-sm text-center p-4 p-md-5 rounded-3 bg-white"
        style={{ maxWidth: "620px", width: "100%" }}
      >
        {/* Top Centered Lock Shield */}
        <div className="d-flex justify-content-center mb-3">
          <div
            className="rounded-circle d-flex align-items-center justify-content-center bg-warning-subtle text-warning border border-warning-subtle"
            style={{ width: "64px", height: "64px" }}
          >
            <IconLock size={32} />
          </div>
        </div>

        {/* Upgrade Tag */}
        <div className="mb-3">
          <Badge
            bg="warning-subtle"
            className="text-warning-emphasis border border-warning-subtle px-3 py-1.5 rounded-pill fw-bold text-uppercase"
            style={{ fontSize: "11px", letterSpacing: "0.05em" }}
          >
            <IconShieldLock size={14} className="me-1" />
            Subscription Upgrade Required
          </Badge>
        </div>

        {/* Heading & Subtitle */}
        <h3 className="fw-bold text-dark mb-2">{featureTitle} is Locked</h3>
        <p className="text-muted small mb-4 mx-auto" style={{ maxWidth: "480px" }}>
          {featureDescription} Available on <strong className="text-dark">{requiredTier}</strong>.
        </p>

        {/* Benefits Box - Native AttendStack Style */}
        <div className="bg-light p-3.5 p-md-4 rounded-3 border text-start mb-4">
          <span
            className="text-uppercase text-muted fw-bold small d-block mb-2.5"
            style={{ fontSize: "11px", letterSpacing: "0.05em" }}
          >
            Included with Plan Upgrade:
          </span>
          <div className="d-flex flex-column gap-2">
            {benefits.map((benefit, idx) => (
              <div className="d-flex align-items-center gap-2 small text-dark" key={idx}>
                <span className="text-success flex-shrink-0 d-flex align-items-center">
                  <IconCheck size={16} strokeWidth={2.5} />
                </span>
                <span>{benefit}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="d-flex flex-column flex-sm-row justify-content-center align-items-center gap-2">
          <Link href="/dashboard" className="w-100 w-sm-auto">
            <Button
              variant="outline-secondary"
              className="w-100 fw-semibold px-3 py-2 d-flex align-items-center justify-content-center gap-1.5"
            >
              <IconLayoutDashboard size={16} /> Back to Dashboard
            </Button>
          </Link>
          <Link href="/plans" className="w-100 w-sm-auto">
            <Button
              variant="primary"
              className="w-100 fw-bold px-4 py-2 d-flex align-items-center justify-content-center gap-1.5 shadow-sm"
            >
              <IconRocket size={16} /> Upgrade Plan Now <IconArrowRight size={16} />
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

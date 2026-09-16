"use client";

import React from "react";
import Link from "next/link";
import { Card, Button, Badge } from "react-bootstrap";
import {
  IconLock,
  IconShieldLock,
  IconLayoutDashboard,
  IconAlertTriangle,
} from "@tabler/icons-react";

interface ModuleAccessDeniedProps {
  moduleTitle?: string;
  description?: string;
}

export default function ModuleAccessDenied({
  moduleTitle = "This Module",
  description = "You do not have permission to view or manage this section. Please contact your primary organization administrator to request operational permissions.",
}: ModuleAccessDeniedProps) {
  return (
    <div className="py-4 py-md-5 d-flex justify-content-center align-items-center">
      <Card
        className="border shadow-sm text-center p-4 p-md-5 rounded-3 bg-white"
        style={{ maxWidth: "580px", width: "100%" }}
      >
        <div className="d-flex justify-content-center mb-3">
          <div
            className="rounded-circle d-flex align-items-center justify-content-center bg-danger-subtle text-danger border border-danger-subtle"
            style={{ width: "64px", height: "64px" }}
          >
            <IconShieldLock size={34} />
          </div>
        </div>

        <div className="mb-3">
          <Badge
            bg="danger-subtle"
            className="text-danger border border-danger-subtle px-3 py-1.5 rounded-pill fw-bold text-uppercase"
            style={{ fontSize: "11px", letterSpacing: "0.05em" }}
          >
            <IconAlertTriangle size={14} className="me-1" />
            Access Restricted
          </Badge>
        </div>

        <h3 className="fw-bold text-dark mb-2">
          {moduleTitle} Access Denied
        </h3>

        <p className="text-muted small mb-4 px-md-3">
          {description}
        </p>

        <div className="d-flex justify-content-center gap-2">
          <Link
            href="/dashboard"
            className="btn btn-primary d-flex align-items-center gap-2 px-4 shadow-sm"
          >
            <IconLayoutDashboard size={18} />
            Return to Dashboard
          </Link>
        </div>
      </Card>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import PlanFeatureLockedPaywall from "components/PlanFeatureLockedPaywall";

const TaskWorkspace = dynamic(() => import("components/tasks/TaskWorkspace"), {
  ssr: false,
  loading: () => <div className="py-5 text-center text-secondary">Loading project workspace…</div>,
});

export default function AdminTasksClient() {
  const [organization, setOrganization] = useState<any>(null);

  useEffect(() => {
    const orgData = localStorage.getItem("organization");
    if (orgData) {
      try {
        setOrganization(JSON.parse(orgData));
      } catch {}
    }

    // The cached copy above can be stale (e.g. a Super Admin just granted
    // this company AttendStack access) — re-verify against the backend so a
    // long-lived session doesn't keep showing a paywall that's already lifted.
    const token = localStorage.getItem("authToken");
    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/organizations/me/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((freshOrg) => {
          if (freshOrg && freshOrg.id) {
            setOrganization(freshOrg);
            localStorage.setItem("organization", JSON.stringify(freshOrg));
          }
        })
        .catch(() => {});
    }
  }, []);

  const isFeatureLocked =
    organization?.plan_features && organization.plan_features.allows_projects_tasks === false;

  if (isFeatureLocked) {
    return (
      <PlanFeatureLockedPaywall
        featureTitle="Projects & Tasks Workspace"
        featureDescription="Kanban sprint boards, deadline milestones, and task assignments are locked under your current plan."
        benefits={[
          "Interactive Kanban boards & agile sprints",
          "Employee task assignment & real-time progress tracking",
          "Project delivery milestones & priority tagging",
          "Automated deadline alerts & completion audits",
        ]}
        requiredTier="Growth Pro or Enterprise"
      />
    );
  }

  return <TaskWorkspace />;
}


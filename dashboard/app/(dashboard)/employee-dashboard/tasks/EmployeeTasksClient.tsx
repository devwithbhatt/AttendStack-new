"use client";

import dynamic from "next/dynamic";

const TaskWorkspace = dynamic(() => import("components/tasks/TaskWorkspace"), {
  ssr: false,
  loading: () => <div className="py-5 text-center text-secondary">Loading project workspace…</div>,
});

export default function EmployeeTasksClient() {
  return <TaskWorkspace employeeMode />;
}

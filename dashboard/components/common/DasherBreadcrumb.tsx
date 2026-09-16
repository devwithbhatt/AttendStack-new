"use client";

import React from "react";
import { Breadcrumb } from "react-bootstrap";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHome, IconChevronRight } from "@tabler/icons-react";
import { capitalizedWord } from "helper/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface DasherBreadcrumbProps {
  items?: BreadcrumbItem[];
  className?: string;
}

const ROUTE_LABELS: Record<string, string> = {
  "sub-admins": "Roles & Sub-Admins",
  "create": "Onboard Sub-Admin",
  "new": "Onboard Sub-Admin",
  "edit": "Edit Permissions",
  "employees": "Employees Directory",
  "add": "Add Employee",
  "attendance": "Attendance & Shifts",
  "leaves": "Leave Requests",
  "leave-requests": "Leave Requests",
  "holidays": "Holidays Calendar",
  "salary": "Salary & Payroll",
  "tasks": "Projects & Tasks",
  "chat": "Chat & Announcements",
  "settings": "Company Settings",
  "dashboard": "Dashboard",
  "employee-dashboard": "Employee Portal",
  "plans": "Subscription Plans",
  "super-admin": "Super Admin",
  "admins": "Company Administrators",
};

const DasherBreadcrumb: React.FC<DasherBreadcrumbProps> = ({ items, className = "" }) => {
  const pathname = usePathname();

  const breadcrumbs: BreadcrumbItem[] = React.useMemo(() => {
    if (items && items.length > 0) {
      return items;
    }

    const segments = pathname.split("/").filter(Boolean);
    const generated: BreadcrumbItem[] = [];

    let currentHref = "";
    segments.forEach((seg, index) => {
      currentHref += `/${seg}`;
      const isLast = index === segments.length - 1;
      const formattedLabel = ROUTE_LABELS[seg] || capitalizedWord(seg);

      generated.push({
        label: formattedLabel,
        href: isLast ? undefined : currentHref,
      });
    });

    return generated;
  }, [items, pathname]);

  return (
    <div className={`page-breadcrumb py-2 mb-3 ${className}`}>
      <Breadcrumb className="mb-0 align-items-center flex-wrap" listProps={{ className: "mb-0 align-items-center d-flex flex-wrap p-0 bg-transparent" }}>
        <Breadcrumb.Item linkAs="span" className="d-flex align-items-center">
          <Link href="/" className="text-secondary text-decoration-none d-inline-flex align-items-center gap-1 small fw-medium hover-primary">
            <IconHome size={15} className="text-primary" />
            <span>Dashboard</span>
          </Link>
        </Breadcrumb.Item>

        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1 || !item.href;
          return (
            <React.Fragment key={index}>
              <span className="text-muted mx-2 d-inline-flex align-items-center" style={{ opacity: 0.5 }}>
                <IconChevronRight size={13} />
              </span>
              {isLast ? (
                <Breadcrumb.Item active as="span" className="text-dark fw-semibold small active-breadcrumb">
                  {item.label}
                </Breadcrumb.Item>
              ) : (
                <Breadcrumb.Item linkAs="span">
                  <Link href={item.href!} className="text-secondary text-decoration-none small fw-medium hover-primary">
                    {item.label}
                  </Link>
                </Breadcrumb.Item>
              )}
            </React.Fragment>
          );
        })}
      </Breadcrumb>
    </div>
  );
};

export default DasherBreadcrumb;

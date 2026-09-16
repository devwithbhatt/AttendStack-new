"use client";

import Link from "next/link";
import React, { useState, useEffect } from "react";
import {
  Accordion,
  Badge,
  Image,
  Nav,
  NavItem,
} from "react-bootstrap";
import { MenuItemType } from "types/menuTypes";
import { IconShieldCheck } from "@tabler/icons-react";
import { getAssetPath } from "helper/assetPath";
import { SuperAdminMenu } from "routes/SuperAdminRoute";

interface SuperAdminSidebarProps {
  hideLogo?: boolean;
  containerId?: string;
  currentPath: string;
  onNavigate?: () => void;
}

const SuperAdminSidebar: React.FC<SuperAdminSidebarProps> = ({
  hideLogo = false,
  containerId,
  currentPath,
  onNavigate,
}) => {
  const [user, setUser] = useState<{ full_name: string; email: string } | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      try {
        setUser(JSON.parse(userData));
      } catch (e) {
        console.error("Error parsing user in SuperAdminSidebar", e);
      }
    }
  }, []);

  const generateLink = (item: MenuItemType) => {
    const isactive = currentPath === item.link || (item.link !== "/" && currentPath.startsWith(item.link || ""));
    if (item.logout) {
      const handleLogout = () => {
        onNavigate?.();
        localStorage.removeItem("authToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
        window.location.href = item.link || "/sign-in";
      };
      return (
        <button
          onClick={handleLogout}
          className={`nav-link text-danger ${isactive ? "active" : ""}`}
        >
          {item.icon && <span className="nav-icon">{item.icon}</span>}
          <span className="text">{item.name || item.title}</span>
        </button>
      );
    }
    return (
      <Link
        href={`${item.link}`}
        className={`nav-link ${isactive ? "active" : ""}`}
        onClick={onNavigate}
      >
        {item.icon && <span className="nav-icon">{item.icon}</span>}
        <span className="text">{item.name || item.title}</span>
        {item.badge && (
          <Badge
            className="ms-1"
            bg={item.badgecolor ? item.badgecolor : "primary"}
          >
            {item.badge}
          </Badge>
        )}
      </Link>
    );
  };

  const getActiveMenuIndex = () => {
    const activeMenu = SuperAdminMenu.findIndex((menu) => {
      if (menu.link && currentPath.startsWith(menu.link)) return true;
      return false;
    });
    return activeMenu > -1 ? activeMenu.toString() : "0";
  };

  return (
    <div id={containerId}>
      <div>
        {hideLogo || (
          <div className="brand-logo py-3 px-4 border-bottom border-secondary-subtle">
            <Link
              href="/super-admin/dashboard"
              className="d-flex align-items-center gap-2.5 text-decoration-none"
              onClick={onNavigate}
            >
              <Image
                src={getAssetPath("/images/brand/logo/logo.png")}
                alt="Logo"
                style={{ height: "32px", width: "auto" }}
              />
              <div className="d-flex flex-column align-items-start">
                <span className="fw-bold fs-4 site-logo-text lh-1">AttendStack</span>
                <Badge bg="warning" text="dark" className="font-monospace text-uppercase mt-1" style={{ fontSize: "0.6rem", letterSpacing: "0.05em" }}>
                  SUPER ADMIN
                </Badge>
              </div>
            </Link>
          </div>
        )}

        {/* Sidebar Navigation */}
        <Accordion
          defaultActiveKey={getActiveMenuIndex()}
          as="ul"
          bsPrefix="navbar-nav flex-column"
        >
          {SuperAdminMenu.map((menu, index) => {
            if (menu.grouptitle) {
              return (
                <Nav.Item key={index} as="li">
                  <div className="nav-heading">{menu.title}</div>
                  <hr className="mx-5 nav-line mb-1" />
                </Nav.Item>
              );
            } else {
              return (
                <Nav.Item key={index} as="li">
                  {generateLink(menu)}
                </Nav.Item>
              );
            }
          })}

          <NavItem as="li" bsPrefix="">
            <div className="text-center py-5 upgrade-ui">
              <div>
                <div className="d-inline-flex align-items-center justify-content-center rounded-circle bg-warning text-dark mb-2" style={{ width: 44, height: 44 }}>
                  <IconShieldCheck size={24} />
                </div>
                <div className="my-2">
                  <h5 className="mb-1 fs-6">{user ? user.full_name || "Super Admin" : "Super Admin"}</h5>
                  <span className="d-block text-secondary small">{user ? user.email : "superadmin@attendstack.com"}</span>
                  <Badge bg="success-subtle" text="success" className="border border-success-subtle mt-1">
                    Super Admin Control
                  </Badge>
                </div>
              </div>
            </div>
          </NavItem>
        </Accordion>
      </div>
    </div>
  );
};

export default SuperAdminSidebar;

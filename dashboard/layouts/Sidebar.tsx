"use client";
//import node module libraries
import Link from "next/link";
import React, { Fragment, useState, useEffect, useMemo } from "react";
import {
  Accordion,
  Badge,
  Image,
  ListGroup,
  Nav,
  NavItem,
  OverlayTrigger,
  Tooltip,
} from "react-bootstrap";

//import custom types
import { MenuItemType } from "types/menuTypes";

//import custom components
import { useBranding } from "context/BrandingContext";
import { Avatar } from "components/common/Avatar";
import CustomToggle, { CustomToggleLevel2 } from "./SidebarMenuToggle";

// import required routes
import { IconBuildingSkyscraper, IconLock } from "@tabler/icons-react";
import { getAssetPath } from "helper/assetPath";
import { DashboardMenu } from "routes/DashboardRoute";
import { EmployeeDashboardMenu } from "routes/EmployeeDashboardRoute";

interface SidebarProps {
  hideLogo: boolean;
  isEmployee?: boolean;
  containerId?: string;
  currentPath: string;
  onNavigate?: () => void;
  user?: any;
}

type AdminLiveStatus = {
  is_online: boolean;
  last_seen_at: string | null;
  name: string;
  role: string;
};

const ADMIN_STATUS_API = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/accounts/admin-live-status/`;

const formatLastLiveTime = (value?: string | null) => {
  if (!value) return "No live activity recorded yet";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

const Sidebar: React.FC<SidebarProps> = ({ hideLogo = false, containerId, currentPath, isEmployee, onNavigate, user: propUser }) => {
  const { companyLogo, companyName } = useBranding();
  const [isMounted, setIsMounted] = useState(false);
  const [localUser, setLocalUser] = useState<any>(null);
  const [organization, setOrganization] = useState<any>(null);
  const [adminStatus, setAdminStatus] = useState<AdminLiveStatus | null>(null);

  const currentUser = propUser || localUser;

  const menuItems = useMemo(() => {
    if (!isMounted) return [];
    if (isEmployee) return EmployeeDashboardMenu;

    const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
    const isPrimaryHR = currentUser?.role === "HR";
    const isSubAdmin = currentUser?.role === "SUB_ADMIN";
    const userPermissions = currentUser?.permissions || {};

    const filtered = DashboardMenu.filter((item) => {
      if (item.grouptitle) return true;
      if (item.adminOnly) {
        return isSuperAdmin || isPrimaryHR;
      }
      if (isSubAdmin) {
        if (item.link === "/dashboard" || item.logout) return true;
        if (item.moduleKey) {
          if (item.moduleKey === "dashboard") return true;
          if (item.moduleKey === "payroll") {
            const pView = typeof userPermissions.payroll === "object" && userPermissions.payroll !== null
              ? Boolean(userPermissions.payroll.view)
              : Boolean(userPermissions.payroll);
            const iView = typeof userPermissions.increments === "object" && userPermissions.increments !== null
              ? Boolean(userPermissions.increments.view)
              : Boolean(userPermissions.increments);
            return pView || iView;
          }
          const modPerm = userPermissions[item.moduleKey];
          if (typeof modPerm === "object" && modPerm !== null) {
            return Boolean(modPerm.view);
          }
          if (typeof modPerm === "boolean") {
            return modPerm;
          }
          return false;
        }
        return false;
      }
      return true;
    });

    // Remove empty group titles (e.g. HR MANAGEMENT or SYSTEM if no visible children)
    const result: MenuItemType[] = [];
    for (let i = 0; i < filtered.length; i++) {
      const current = filtered[i];
      if (current.grouptitle) {
        let hasChildren = false;
        for (let j = i + 1; j < filtered.length; j++) {
          if (filtered[j].grouptitle) break;
          hasChildren = true;
          break;
        }
        if (hasChildren) {
          result.push(current);
        }
      } else {
        result.push(current);
      }
    }
    return result;
  }, [isMounted, isEmployee, currentUser]);

  useEffect(() => {
    setIsMounted(true);
    const userData = localStorage.getItem("user");
    if (userData) {
      try {
        const parsedUser = JSON.parse(userData);
        setLocalUser(parsedUser);
      } catch {}
    }
    const orgData = localStorage.getItem("organization");
    if (orgData) {
      try {
        setOrganization(JSON.parse(orgData));
      } catch {}
    }

    // Refresh profile in background to immediately reflect real-time RBAC permission updates
    const token = localStorage.getItem("authToken");
    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/accounts/profile/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((profile) => {
          if (profile && profile.id) {
            setLocalUser(profile);
            localStorage.setItem("user", JSON.stringify(profile));
            if (profile.organization) {
              setOrganization(profile.organization);
              localStorage.setItem("organization", JSON.stringify(profile.organization));
            }
          }
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadAdminStatus = async () => {
      const token = localStorage.getItem("authToken");
      if (!token) return;

      try {
        const response = await fetch(ADMIN_STATUS_API, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data = (await response.json()) as AdminLiveStatus;
        if (isMounted) setAdminStatus(data);
      } catch {
        if (isMounted) setAdminStatus(null);
      }
    };

    loadAdminStatus();
    const intervalId = window.setInterval(loadAdminStatus, 60000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const adminLastSeen = formatLastLiveTime(adminStatus?.last_seen_at);
  const adminStatusTooltip = adminStatus
    ? `${adminStatus.role || "Admin"} - ${adminStatus.is_online ? "Online now" : "Offline"}. Last live: ${adminLastSeen}`
    : "Admin offline. Last live: No live activity recorded yet";

  //Generate Link
  const generateLink = (item: MenuItemType) => {
    const isactive = currentPath === item.link;
    const isLocked =
      Boolean(item.featureKey) &&
      organization?.plan_features &&
      organization.plan_features[item.featureKey!] === false;

    if (item.logout) {
      const handleLogout = () => {
        localStorage.removeItem("authToken");
        localStorage.removeItem("user");
        window.location.href = item.link || "/sign-in";
      };
      return (
        <button
          onClick={handleLogout}
          className={`nav-link ${isactive ? "active" : ""}`}
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
        {isLocked ? (
          <Badge
            bg="warning-subtle"
            className="text-warning-emphasis border border-warning-subtle rounded-pill px-1.5 py-0.5 ms-auto d-inline-flex align-items-center gap-1"
            style={{ fontSize: "10px" }}
          >
            <IconLock size={11} /> PRO
          </Badge>
        ) : item.badge ? (
          <Badge
            className="ms-1"
            bg={item.badgecolor ? item.badgecolor : "primary"}
          >
            {item.badge}
          </Badge>
        ) : null}
      </Link>
    );
  };

  const getActiveMenuIndex = () => {
    const activeMenu = menuItems.findIndex((menu) => {
      if (menu.children) {
        return menu.children.some((child) => child && typeof currentPath === 'string' && currentPath.startsWith(child.link || ''));
      }
      return false;
    });
    return activeMenu > -1 ? activeMenu.toString() : '0';
  };

  return (
    <div id={containerId}>
      <div>
        {hideLogo || (
          <div className='brand-logo'>
            <Link
              href='/'
              className='d-none d-md-flex align-items-center gap-2'
              onClick={onNavigate}>
              <Image
                src={getAssetPath("/images/brand/logo/logo.png")}
                alt=''
                style={{ height: "30px", width: "auto" }}
              />
              <span className='fw-bold fs-4 site-logo-text'>AttendStack</span>
            </Link>
          </div>
        )}

        {/* Sidebar Dashboard Menu */}
        <Accordion
          defaultActiveKey={getActiveMenuIndex()}
          as='ul'
          bsPrefix='navbar-nav flex-column'>
          {menuItems.map(function (menu, index) {
            if (menu.grouptitle) {
              return (
                // Group Title
                <Nav.Item key={index} as='li'>
                  <div className='nav-heading'>{menu.title}</div>
                  <hr className='mx-5 nav-line mb-1' />
                </Nav.Item>
              );
            } else {
              if (menu.children) {
                return (
                  <Fragment key={index}>
                    {/* Dropdown Parent Menu */}
                    <CustomToggle eventKey={index.toString()} icon={menu.icon}>
                      {menu.title}
                    </CustomToggle>
                    <Accordion.Collapse eventKey={index.toString()}>
                      <ListGroup as='ul' className='dropdown-menu flex-column'>
                        {menu.children.map(function (
                          menuLevel1Item,
                          menuLevel1Index
                        ) {
                          if (menuLevel1Item.children) {
                            return (
                              <ListGroup.Item
                                as='li'
                                bsPrefix='nav-item'
                                key={menuLevel1Index}>
                                {/* first level menu started  */}
                                <Accordion
                                  defaultActiveKey='0'
                                  bsPrefix='navbar-nav flex-column'>
                                  <CustomToggleLevel2
                                    eventKey={"0"}
                                    href={"#link"}>
                                    {menuLevel1Item.title}
                                  </CustomToggleLevel2>
                                  <Accordion.Collapse eventKey={"0"}>
                                    <ListGroup
                                      as='ul'
                                      bsPrefix=''
                                      className='nav flex-column'>
                                      {/* second level menu started  */}
                                      {menuLevel1Item.children.map(function (
                                        menuLevel2Item,
                                        menuLevel2Index
                                      ) {
                                        if (menuLevel2Item.children) {
                                          return (
                                            <ListGroup.Item
                                              as='li'
                                              bsPrefix='nav-item'
                                              key={menuLevel2Index}>
                                              {/* second level accordion menu started  */}
                                              <Accordion
                                                defaultActiveKey='0'
                                                className='navbar-nav flex-column'>
                                                <CustomToggleLevel2
                                                  eventKey={"0"}>
                                                  {menuLevel2Item.title}
                                                </CustomToggleLevel2>
                                                <Accordion.Collapse
                                                  eventKey={"0"}
                                                  bsPrefix='nav-item'>
                                                  <ListGroup
                                                    as='ul'
                                                    bsPrefix=''
                                                    className='nav flex-column'>
                                                    {/* third level menu started  */}
                                                    {menuLevel2Item.children.map(
                                                      function (
                                                        menuLevel3Item,
                                                        menuLevel3Index
                                                      ) {
                                                        return (
                                                          <ListGroup.Item
                                                            key={
                                                              menuLevel3Index
                                                            }
                                                            as='li'
                                                            bsPrefix='nav-item'>
                                                            <Link
                                                              href={
                                                                menuLevel3Item.link?.toString() ||
                                                                `/${menuLevel3Item.link}`
                                                              }
                                                              className={`nav-link ${
                                                                currentPath === menuLevel3Item.link
                                                                  ? "active"
                                                                  : ""
                                                              }`}
                                                              onClick={onNavigate}
                                                            >
                                                              {
                                                                menuLevel3Item.name
                                                              }
                                                            </Link>
                                                          </ListGroup.Item>
                                                        );
                                                      }
                                                    )}
                                                    {/* end of third level menu  */}
                                                  </ListGroup>
                                                </Accordion.Collapse>
                                              </Accordion>
                                              {/* end of second level accordion */}
                                            </ListGroup.Item>
                                          );
                                        } else {
                                          return (
                                            <ListGroup.Item
                                              key={menuLevel2Index}
                                              as='li'
                                              bsPrefix='nav-item'>
                                              {generateLink(menuLevel2Item)}
                                            </ListGroup.Item>
                                          );
                                        }
                                      })}
                                      {/* end of second level menu  */}
                                    </ListGroup>
                                  </Accordion.Collapse>
                                </Accordion>
                                {/* end of first level menu */}
                              </ListGroup.Item>
                            );
                          } else {
                            return (
                              <ListGroup.Item
                                as='li'
                                bsPrefix='nav-item'
                                key={menuLevel1Index}>
                                {generateLink(menuLevel1Item)}
                              </ListGroup.Item>
                            );
                          }
                        })}
                      </ListGroup>
                    </Accordion.Collapse>
                    {/* end of main menu / menu level 1 / root items */}
                  </Fragment>
                );
              } else {
                return (
                  <Nav.Item as='li' key={index}>
                    {generateLink(menu)}
                  </Nav.Item>
                );
              }
            }
          })}
          <NavItem as='li' bsPrefix=''>
            <div className='text-center py-5 upgrade-ui'>
              <div>
                <div className='sidebar-company-avatar-wrap'>
                  <div
                    className="d-inline-flex align-items-center justify-content-center rounded-circle border border-2 border-white shadow-sm"
                    style={{
                      width: "48px",
                      height: "48px",
                      background: "linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)",
                      color: "#0284c7",
                      margin: "0 auto",
                    }}
                    title={companyName || "Company Workspace"}
                  >
                    <IconBuildingSkyscraper size={24} strokeWidth={2} />
                  </div>
                  {isEmployee && (
                    <OverlayTrigger
                      placement='top'
                      overlay={<Tooltip id='admin-live-status-tooltip'>{adminStatusTooltip}</Tooltip>}>
                      <span
                        className={`admin-live-dot ${adminStatus?.is_online ? "is-online" : "is-offline"}`}
                        tabIndex={0}
                        aria-label={adminStatusTooltip}
                      />
                    </OverlayTrigger>
                  )}
                </div>
                <div className='my-3'>
                  <h5 className='mb-1 fs-6'>{isMounted ? (companyName || 'AttendStack') : 'AttendStack'}</h5>
                  <span className='d-block text-secondary'>{isMounted && currentUser ? (currentUser.full_name || currentUser.name || currentUser.username) : 'HR Administrator'}</span>
                  <span className='text-secondary'>{isMounted && currentUser ? (currentUser.designation || currentUser.role_display || currentUser.role) : 'Administrator'}</span>
                </div>
              </div>
            </div>
          </NavItem>
        </Accordion>
      </div>
      <style jsx global>{`
        .sidebar-company-avatar-wrap {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .admin-live-dot {
          width: 12px;
          height: 12px;
          border-radius: 999px;
          display: inline-flex;
          flex: 0 0 12px;
          border: 2px solid #fff;
          box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(15, 23, 42, 0.16);
          cursor: help;
        }

        .sidebar-company-avatar-wrap > .admin-live-dot {
          position: absolute;
          right: -2px;
          bottom: 1px;
        }

        .admin-live-dot.is-online {
          background: #16a34a;
        }

        .admin-live-dot.is-offline {
          background: #94a3b8;
        }

        .admin-live-dot:focus {
          outline: 2px solid #93c5fd;
          outline-offset: 2px;
        }

      `}</style>
    </div>
  );
};

export default Sidebar;

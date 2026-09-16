import React, { useEffect, useState } from "react";
import { Dropdown, Image } from "react-bootstrap";
import Link from "next/link";
import { IconLogin2, IconHome2, IconSettings, IconActivity, IconBook, IconUser, IconBuildingSkyscraper, IconShieldLock } from "@tabler/icons-react";
import { useBranding } from "context/BrandingContext";
import { Avatar } from "components/common/Avatar";
import { getAssetPath } from "helper/assetPath";

interface UserToggleProps {
  children?: React.ReactNode;
  onClick?: () => void;
}

const CustomToggle = React.forwardRef<HTMLAnchorElement, UserToggleProps>(
  ({ children, onClick }, ref) => (
    <Link ref={ref} href="#" onClick={onClick}>
      {children}
    </Link>
  )
);

CustomToggle.displayName = "CustomToggle";

const UserMenu = () => {
  const { companyLogo } = useBranding();
  const [user, setUser] = useState<{ full_name: string; email: string; role: string } | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      try {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);

        const fetchLiveProfile = async () => {
          const token = localStorage.getItem("authToken");
          if (!token) return;

          try {
            if (parsedUser.role === "EMPLOYEE") {
              const res = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/employees/me/`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                const data = await res.json();
                if (data.profile_photo_url) {
                  setProfilePhoto(data.profile_photo_url);
                }
              }
            } else {
              const res = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/accounts/profile/`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                const data = await res.json();
                if (data.avatar) {
                  setProfilePhoto(data.avatar);
                }
              }
            }
          } catch {
            // The saved session details remain usable while the API is offline.
          }
        };

        fetchLiveProfile();
      } catch (e) {
        console.error("Error parsing user data", e);
      }
    }
  }, []);

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    localStorage.removeItem("authToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    window.location.href = "/sign-in";
  };

  const isEmployee = user?.role === "EMPLOYEE";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const isHR = user?.role === "HR";
  const isSubAdmin = user?.role === "SUB_ADMIN";
  const isCompanyUser = isHR || user?.role === "ADMIN" || isSuperAdmin;
  const userPermissions = (user as any)?.permissions || {};

  const dynamicMenuItems = isEmployee 
    ? [
        {
          id: "emp-home",
          title: "Dashboard",
          link: "/employee-dashboard",
          icon: <IconHome2 size={18} strokeWidth={1.5} className="text-secondary" />,
        },
        {
          id: "emp-profile",
          title: "My Profile",
          link: "/employee-dashboard/profile",
          icon: <IconSettings size={18} strokeWidth={1.5} className="text-secondary" />,
        },
        {
          id: "emp-rulebook",
          title: "Company Rulebook",
          link: "/employee-dashboard/rulebook",
          icon: <IconBook size={18} strokeWidth={1.5} className="text-secondary" />,
        },
        {
          id: "emp-salary",
          title: "My Salary & Payslips",
          link: "/employee-dashboard/salary",
          icon: <IconActivity size={18} strokeWidth={1.5} className="text-secondary" />,
        },
      ]
    : [
        {
          id: "admin-home",
          title: "Dashboard",
          link: isSuperAdmin ? "/super-admin/dashboard" : "/dashboard",
          icon: <IconHome2 size={18} strokeWidth={1.5} className="text-secondary" />,
        },
        ...(isSuperAdmin || isHR || Boolean(userPermissions.employees?.view)
          ? [
              {
                id: "admin-employees",
                title: "Manage Employees",
                link: "/employees",
                icon: <IconUser size={18} strokeWidth={1.5} className="text-secondary" />,
              },
            ]
          : []),
        ...(isSuperAdmin || isHR
          ? [
              {
                id: "admin-subadmins",
                title: "Roles & Sub-Admins",
                link: "/sub-admins",
                icon: <IconShieldLock size={18} strokeWidth={1.5} className="text-secondary" />,
              },
            ]
          : []),
      ];

  const activePhoto = profilePhoto || (isCompanyUser ? companyLogo : null);

  const renderAvatarBadge = (size: number) => {
    if (activePhoto && !imgError) {
      return (
        <Image
          src={activePhoto}
          alt="Avatar"
          onError={() => setImgError(true)}
          className="rounded-circle border border-2 border-white shadow-sm"
          style={{ width: `${size}px`, height: `${size}px`, objectFit: "cover" }}
        />
      );
    }

    if (isCompanyUser) {
      return (
        <div
          className="d-inline-flex align-items-center justify-content-center rounded-circle border border-2 border-white shadow-sm"
          style={{
            width: `${size}px`,
            height: `${size}px`,
            background: "linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)",
            color: "#0284c7",
            flexShrink: 0,
          }}
          title="Company Workspace"
        >
          <IconBuildingSkyscraper size={size * 0.55} strokeWidth={2} />
        </div>
      );
    }

    return (
      <div
        className="d-inline-flex align-items-center justify-content-center rounded-circle border border-2 border-white shadow-sm"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          background: "linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)",
          color: "#4338ca",
          flexShrink: 0,
        }}
        title="User Profile"
      >
        <IconUser size={size * 0.55} strokeWidth={2} />
      </div>
    );
  };

  return (
    <Dropdown>
      <Dropdown.Toggle as={CustomToggle}>
        {renderAvatarBadge(36)}
      </Dropdown.Toggle>
      <Dropdown.Menu align="end" className="p-0 dropdown-menu-md shadow border-0" style={{ borderRadius: "14px", overflow: "hidden" }}>
        <div className="d-flex gap-3 align-items-center border-bottom px-4 py-4" style={{ backgroundColor: "#fcfdfe", borderBottomStyle: "dashed" }}>
          {renderAvatarBadge(48)}
          <div className="overflow-hidden">
            <h5 className="mb-0 fw-bold text-dark text-truncate">{user ? user.full_name : "AttendStack User"}</h5>
            <p className="mb-0 text-secondary small text-truncate" style={{ fontSize: "0.8rem" }}>
              {user ? user.email : "user@attendstack.com"}
            </p>
            <span className="badge bg-success-subtle text-success border border-success-subtle mt-1.5 font-monospace rounded-pill text-uppercase px-2 py-1" style={{ fontSize: "0.65rem", fontWeight: 600 }}>
              {user ? (user.role === "SUPER_ADMIN" ? "Super Admin" : user.role === "EMPLOYEE" ? "Employee" : user.role) : "Staff"}
            </span>
          </div>
        </div>
        <div className="p-2 d-flex flex-column gap-0.5">
          {dynamicMenuItems.map((item) => (
            <Dropdown.Item
              key={item.id}
              as={Link}
              href={item.link}
              className="d-flex align-items-center gap-2.5 px-3 py-2 rounded-3 dropdown-item-custom"
              style={{ transition: "all 0.15s ease" }}
            >
              <span className="d-flex align-items-center">{item.icon}</span>
              <span className="fw-medium text-dark-emphasis small">{item.title}</span>
            </Dropdown.Item>
          ))}
        </div>
        <div className="border-top mb-3 pt-3 px-4" style={{ borderTopStyle: "dashed" }}>
          <a
            href="#"
            onClick={handleLogout}
            className="text-danger d-flex align-items-center gap-2.5 px-2 py-1 rounded-3 logout-link-custom fw-semibold small text-decoration-none"
            style={{ transition: "all 0.15s ease" }}
          >
            <span className="d-flex align-items-center">
              <IconLogin2 size={18} strokeWidth={1.5} />
            </span>
            <span>Logout</span>
          </a>
        </div>
      </Dropdown.Menu>
      
      <style>{`
        .dropdown-item-custom:hover {
          background-color: #f3f4f6 !important;
        }
        .logout-link-custom:hover {
          color: #dc2626 !important;
          opacity: 0.95;
        }
      `}</style>
    </Dropdown>
  );
};

export default UserMenu;

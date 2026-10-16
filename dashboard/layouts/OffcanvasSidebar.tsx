"use client";
//import node modules libraries
import { useCallback, useEffect, useState } from "react";
import { Image } from "react-bootstrap";
import Offcanvas from "react-bootstrap/Offcanvas";
import OffcanvasBody from "react-bootstrap/OffcanvasBody";
import OffcanvasHeader from "react-bootstrap/OffcanvasHeader";
import Link from "next/link";
import { usePathname } from "next/navigation";

//import custom components
import Sidebar from "./Sidebar";

//import custom hooks
import useMenu from "hooks/useMenu";
import { getAssetPath } from "helper/assetPath";

const OffcanvasSidebar = () => {
  const { showMenu, toggleMenuHandler } = useMenu();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const closeSidebar = useCallback(() => toggleMenuHandler(false), [toggleMenuHandler]);

  useEffect(() => {
    closeSidebar();
  }, [closeSidebar, pathname]);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      try { setUser(JSON.parse(userData)); } catch {}
    }
  }, []);

  const isEmployee = user?.role === "EMPLOYEE";

  return (
    <Offcanvas
      placement={"start"}
      show={showMenu}
      onHide={closeSidebar}
      backdrop={true}
      bsPrefix="offcanvasNav offcanvas offcanvas-start "
    >
      <OffcanvasHeader closeButton>
        <Link href="/" className="d-flex align-items-center gap-2" onClick={closeSidebar}>
          <Image
            src={getAssetPath("/images/brand/logo/logo.png")}
            alt="ZuperHR"
            style={{ height: "36px", width: "auto" }}
          />
        </Link>
      </OffcanvasHeader>
      <OffcanvasBody className="p-0 ">
        <Sidebar hideLogo currentPath={pathname} isEmployee={isEmployee} onNavigate={closeSidebar} user={user} />
      </OffcanvasBody>
    </Offcanvas>
  );
};

export default OffcanvasSidebar;

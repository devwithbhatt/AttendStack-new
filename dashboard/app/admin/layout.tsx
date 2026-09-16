"use client";
import { usePathname } from 'next/navigation';

//import custom components
import { BrandingProvider } from "context/BrandingContext";
import Header from "layouts/header/Header";
import Sidebar from "layouts/Sidebar";
import AdminSidebar from 'layouts/AdminSidebar';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const pathname = usePathname();

  return (
    <BrandingProvider>
      <div>
        <AdminSidebar hideLogo={false} containerId='miniSidebar' currentPath={pathname} />
        <div id='content' className='position-relative min-vh-100 d-flex flex-column' style={{ minHeight: "100vh" }}>
          <Header />
          <div className='custom-container' style={{ flex: '1 0 auto' }}>
            {children}
          </div>
          <footer className='custom-container mt-auto pt-3 pb-1 text-muted small border-top' style={{ borderColor: '#f1f5f9' }}>
            <span className='me-1'>© 2026 AttendStack. A <a href="https://bhattsquare.com" target="_blank" rel="noopener noreferrer" className="text-primary fw-medium text-decoration-none">Bhatt Square</a> Project. <span className='text-secondary ms-2'>Version 2.5.14</span></span>
          </footer>
        </div>
      </div>
    </BrandingProvider>
  );
};

export default AdminLayout;

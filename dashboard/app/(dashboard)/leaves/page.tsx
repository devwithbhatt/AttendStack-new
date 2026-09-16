import AdminLeavesClient from "./AdminLeavesClient";
import DasherBreadcrumb from "components/common/DasherBreadcrumb";

const AdminLeavesPage = () => {
  return (
    <>
      <div className="px-lg-4 pt-2">
        <DasherBreadcrumb />
      </div>
      <AdminLeavesClient />
    </>
  );
};

export default AdminLeavesPage;

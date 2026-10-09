import AdminLeavesClient from "./AdminLeavesClient";
import DasherBreadcrumb from "components/common/DasherBreadcrumb";

const AdminLeavesPage = () => {
  return (
    <>
      <div>
        <DasherBreadcrumb />
      </div>
      <AdminLeavesClient />
    </>
  );
};

export default AdminLeavesPage;

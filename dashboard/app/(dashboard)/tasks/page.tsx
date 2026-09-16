import AdminTasksClient from "./AdminTasksClient";
import DasherBreadcrumb from "components/common/DasherBreadcrumb";

const AdminTasksPage = () => {
  return (
    <>
      <div className="px-lg-4 pt-2">
        <DasherBreadcrumb />
      </div>
      <AdminTasksClient />
    </>
  );
};

export default AdminTasksPage;

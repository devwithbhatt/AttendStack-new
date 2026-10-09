import AdminTasksClient from "./AdminTasksClient";
import DasherBreadcrumb from "components/common/DasherBreadcrumb";

const AdminTasksPage = () => {
  return (
    <>
      <div>
        <DasherBreadcrumb />
      </div>
      <AdminTasksClient />
    </>
  );
};

export default AdminTasksPage;

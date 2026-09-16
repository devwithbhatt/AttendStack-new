import { Fragment } from "react";
import { Metadata } from "next";
import EmployeeFormWizard from "../components/EmployeeFormWizard";
import DasherBreadcrumb from "../../../../components/common/DasherBreadcrumb";

export const metadata: Metadata = {
  title: "Add New Employee | HR Management",
};

const AddEmployeePage = () => {
  return (
    <Fragment>
      <DasherBreadcrumb />
      <EmployeeFormWizard />
    </Fragment>
  );
};

export default AddEmployeePage;
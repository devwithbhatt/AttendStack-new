import { Fragment } from "react";
import { Metadata } from "next";
import EmployeePageClient from "./components/EmployeePageClient";
import DasherBreadcrumb from "components/common/DasherBreadcrumb";

export const metadata: Metadata = {
  title: "Employees Directory | HR Management",
};

const EmployeesPage = () => {
  return (
    <Fragment>
      <div className="px-lg-4 pt-2">
        <DasherBreadcrumb />
      </div>
      <EmployeePageClient />
    </Fragment>
  );
};

export default EmployeesPage;
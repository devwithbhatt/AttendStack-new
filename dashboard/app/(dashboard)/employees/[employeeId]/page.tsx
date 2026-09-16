import { Fragment } from "react";
import { Metadata } from "next";
import DasherBreadcrumb from "../../../../components/common/DasherBreadcrumb";
import EmployeeProfileClient from "../components/EmployeeProfileClient";

export const metadata: Metadata = {
  title: "Employee Profile | HR Management",
};

interface EmployeeProfilePageProps {
  params: Promise<{
    employeeId: string;
  }>;
}

const EmployeeProfilePage = async ({ params }: EmployeeProfilePageProps) => {
  const { employeeId } = await params;

  return (
    <Fragment>
      <DasherBreadcrumb
        className="d-none d-md-block"
        items={[
          { label: "Employees Directory", href: "/employees" },
          { label: "Employee Profile" },
        ]}
      />
      <EmployeeProfileClient employeeId={employeeId} />
    </Fragment>
  );
};

export default EmployeeProfilePage;

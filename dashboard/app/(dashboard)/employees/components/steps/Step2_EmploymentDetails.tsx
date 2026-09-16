"use client";

import { useEffect, useState } from "react";
import { EmployeeFormData, EmployeeFormErrors } from "../EmployeeFormWizard";

type StepProps = {
  data: Partial<EmployeeFormData>;
  errors: EmployeeFormErrors;
  onChange: <TKey extends keyof EmployeeFormData>(field: TKey, value: EmployeeFormData[TKey]) => void;
};

type ShiftOption = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  is_default: boolean;
};

const Step2_EmploymentDetails = ({ data, errors, onChange }: StepProps) => {
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);

  useEffect(() => {
    const fetchShifts = async () => {
      setLoadingShifts(true);
      try {
        const token = localStorage.getItem("authToken");
        const apiEndpoint = (process.env.NEXT_PUBLIC_API_ENDPOINT || "").replace(/\/$/, "");
        const res = await fetch(`${apiEndpoint}/api/v1/attendance/shifts/`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (res.ok) {
          const list = await res.json();
          setShifts(Array.isArray(list) ? list : list.results || []);
        }
      } catch (e) {
        console.error("Failed to load shifts in employee wizard", e);
      } finally {
        setLoadingShifts(false);
      }
    };
    fetchShifts();
  }, []);

  return (
    <div>
      <div className="row g-3">
        <div className="col-md-6">
          <label htmlFor="employeeId" className="form-label">Employee ID</label>
          <input type="text" className="form-control bg-light" id="employeeId" value="Auto-Generated on save" disabled />
        </div>
        <div className="col-md-6">
          <label htmlFor="joiningDate" className="form-label">Joining Date</label>
          <input type="date" className={`form-control ${errors.joiningDate ? "is-invalid" : ""}`} id="joiningDate" value={data.joiningDate} onChange={(event) => onChange("joiningDate", event.target.value)} />
          {errors.joiningDate && <div className="invalid-feedback">{errors.joiningDate}</div>}
        </div>
        <div className="col-md-6">
          <label htmlFor="department" className="form-label">Department</label>
          <select className={`form-select ${errors.department ? "is-invalid" : ""}`} id="department" value={data.department} onChange={(event) => onChange("department", event.target.value)}>
            <option value="">Select Department</option>
            <option>Engineering</option>
            <option>Design</option>
            <option>Marketing</option>
            <option>Sales</option>
            <option>Human Resources</option>
          </select>
          {errors.department && <div className="invalid-feedback">{errors.department}</div>}
        </div>
        <div className="col-md-6">
          <label htmlFor="designation" className="form-label">Designation</label>
          <input type="text" className={`form-control ${errors.designation ? "is-invalid" : ""}`} id="designation" placeholder="Enter designation" value={data.designation} onChange={(event) => onChange("designation", event.target.value)} />
          {errors.designation && <div className="invalid-feedback">{errors.designation}</div>}
        </div>
        <div className="col-md-6">
          <label htmlFor="employmentType" className="form-label">Employment Type</label>
          <select className={`form-select ${errors.employmentType ? "is-invalid" : ""}`} id="employmentType" value={data.employmentType} onChange={(event) => onChange("employmentType", event.target.value)}>
            <option value="">Select Type</option>
            <option value="FULL_TIME">Full-time</option>
            <option value="PART_TIME">Part-time</option>
            <option value="CONTRACT">Contract</option>
            <option value="INTERN">Intern</option>
          </select>
          {errors.employmentType && <div className="invalid-feedback">{errors.employmentType}</div>}
        </div>
        <div className="col-md-6">
          <label htmlFor="reportingManager" className="form-label">Reporting Manager</label>
          <input type="text" className="form-control" id="reportingManager" placeholder="Enter manager's name" value={data.reportingManager} onChange={(event) => onChange("reportingManager", event.target.value)} />
        </div>
        <div className="col-md-12">
          <label htmlFor="shift" className="form-label fw-semibold">Assigned Work Shift</label>
          <select
            className="form-select"
            id="shift"
            value={data.shift || ""}
            onChange={(event) => onChange("shift", event.target.value)}
          >
            <option value="">Default Company Shift (Auto-assigned)</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.start_time?.slice(0, 5)} - {s.end_time?.slice(0, 5)}){s.is_default ? " [Company Default]" : ""}
              </option>
            ))}
          </select>
          <div className="form-text">
            Choose a custom shift for this employee, or leave as Default to use company standard working hours.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Step2_EmploymentDetails;
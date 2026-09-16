import { Fragment } from "react";
import { Metadata } from "next";
import { IconSearch } from "@tabler/icons-react";

import DasherBreadcrumb from "components/common/DasherBreadcrumb";

export const metadata: Metadata = {
  title: "Attendance | HR Management",
};

const AttendancePage = () => {
  return (
    <Fragment>
      <DasherBreadcrumb />
      <div className="mb-6">
        <h2 className="mb-0 fw-bold">Attendance Records</h2>
        <p className="text-secondary mb-0">Track and manage employee daily attendance logs.</p>
      </div>

      <div className="card border-0 shadow-sm mb-6">
        <div className="card-header bg-white border-bottom-0 pt-4 pb-0">
          <div className="row g-3">
            <div className="col-md-3">
              <div className="input-group">
                <span className="input-group-text bg-transparent border-end-0">
                  <IconSearch size={18} className="text-muted" />
                </span>
                <input type="text" className="form-control border-start-0 ps-0" placeholder="Search employee..." />
              </div>
            </div>
            <div className="col-md-3">
              <input type="date" className="form-control" defaultValue="2024-10-24" />
            </div>
          </div>
        </div>
        <div className="card-body">
          <div className="table-responsive">
            <table className="table align-middle table-hover text-nowrap">
              <thead className="table-light">
                <tr>
                  <th>Employee Name</th>
                  <th>Date</th>
                  <th>Clock In</th>
                  <th>Clock Out</th>
                  <th>Total Hours</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div className="d-flex align-items-center">
                      <img src="/images/avatar/avatar-1.jpg" alt="" className="avatar avatar-sm rounded-circle me-3" />
                      <div>
                        <h6 className="mb-0">John Doe</h6>
                        <small className="text-muted">Engineering</small>
                      </div>
                    </div>
                  </td>
                  <td>Oct 24, 2024</td>
                  <td>09:00 AM</td>
                  <td>06:05 PM</td>
                  <td>9h 5m</td>
                  <td><span className="badge bg-success bg-opacity-10 text-success">Present</span></td>
                </tr>
                <tr>
                  <td>
                    <div className="d-flex align-items-center">
                      <img src="/images/avatar/avatar-2.jpg" alt="" className="avatar avatar-sm rounded-circle me-3" />
                      <div>
                        <h6 className="mb-0">Jane Smith</h6>
                        <small className="text-muted">Design</small>
                      </div>
                    </div>
                  </td>
                  <td>Oct 24, 2024</td>
                  <td>09:15 AM</td>
                  <td>06:00 PM</td>
                  <td>8h 45m</td>
                  <td><span className="badge bg-warning bg-opacity-10 text-warning">Late</span></td>
                </tr>
                <tr>
                  <td>
                    <div className="d-flex align-items-center">
                      <img src="/images/avatar/avatar-3.jpg" alt="" className="avatar avatar-sm rounded-circle me-3" />
                      <div>
                        <h6 className="mb-0">Mike Ross</h6>
                        <small className="text-muted">Marketing</small>
                      </div>
                    </div>
                  </td>
                  <td>Oct 24, 2024</td>
                  <td>--:--</td>
                  <td>--:--</td>
                  <td>0h 0m</td>
                  <td><span className="badge bg-danger bg-opacity-10 text-danger">Absent</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Fragment>
  );
};

export default AttendancePage;

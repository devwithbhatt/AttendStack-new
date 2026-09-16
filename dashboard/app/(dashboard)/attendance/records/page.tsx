"use client";
// import node module libraries
import { Col, Row, Container } from "react-bootstrap";
import AttendanceRecordsClient from "../components/AttendanceRecordsClient";

const AttendanceRecords = () => {
  return (
    <Container fluid className="p-6">
      <Row>
        <Col xl={12} md={12} xs={12}>
          <div className="mb-4 mb-xl-0">
            <h1 className="mb-1 h2 fw-bold">Attendance Records</h1>
            <p className="mb-0">
              Review and manage your past attendance data.
            </p>
          </div>
        </Col>
      </Row>

      <div className="mt-6">
        <AttendanceRecordsClient />
      </div>
    </Container>
  );
};

export default AttendanceRecords;
"use client";
// import node module libraries
import { Col, Row, Container } from "react-bootstrap";
import TodaysAttendanceClient from "../components/TodaysAttendanceClient";

const MarkAttendance = () => {
  return (
    <Container fluid className="p-6">
      <Row>
        <Col xl={12} md={12} xs={12}>
          <div className="mb-4 mb-xl-0">
            <h1 className="mb-1 h2 fw-bold">Today's Attendance</h1>
            <p className="mb-0">
              Monitor the live attendance status of all employees.
            </p>
          </div>
        </Col>
      </Row>

      <div className="mt-6">
        <TodaysAttendanceClient />
      </div>
    </Container>
  );
};

export default MarkAttendance;
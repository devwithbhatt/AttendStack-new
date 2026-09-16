"use client";

// import node module libraries
import { useState, useEffect } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  ListGroup,
  Badge,
} from "react-bootstrap";
import {
  IconClockPlay,
  IconClockStop,
  IconPlayerPlay,
  IconPlayerStop,
} from "@tabler/icons-react";

// Helper function to format time
const formatTime = (date: Date) => {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

// Helper function to format duration
const formatDuration = (seconds: number) => {
  if (seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((v) => (v < 10 ? "0" + v : v)).join(":");
};

const MarkAttendanceClient = () => {
  const [status, setStatus] = useState<"clocked-out" | "clocked-in">(
    "clocked-out"
  );
  const [clockInTime, setClockInTime] = useState<Date | null>(null);
  const [duration, setDuration] = useState(0);
  const [todayLog, setTodayLog] = useState<
    { type: string; time: Date; duration?: string }[]
  >([]);

  // Timer effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status === "clocked-in" && clockInTime) {
      timer = setInterval(() => {
        setDuration(Math.floor((new Date().getTime() - clockInTime.getTime()) / 1000));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [status, clockInTime]);

  const handleClockIn = () => {
    const now = new Date();
    setStatus("clocked-in");
    setClockInTime(now);
    setTodayLog([...todayLog, { type: "Clock In", time: now }]);
  };

  const handleClockOut = () => {
    if (!clockInTime) return;
    const now = new Date();
    const finalDuration = formatDuration(
      (now.getTime() - clockInTime.getTime()) / 1000
    );
    setStatus("clocked-out");
    setClockInTime(null);
    setDuration(0);
    setTodayLog([
      ...todayLog,
      { type: "Clock Out", time: now, duration: finalDuration },
    ]);
  };

  const renderActionButton = () => {
    if (status === "clocked-out") {
      return (
        <Button
          variant="success"
          className="d-flex align-items-center justify-content-center gap-2 w-100"
          size="lg"
          onClick={handleClockIn}
        >
          <IconClockPlay size={24} />
          <span>Clock In</span>
        </Button>
      );
    } else {
      return (
        <Button
          variant="danger"
          className="d-flex align-items-center justify-content-center gap-2 w-100"
          size="lg"
          onClick={handleClockOut}
        >
          <IconClockStop size={24} />
          <span>Clock Out</span>
        </Button>
      );
    }
  };

  return (
    <Row>
      <Col md={7} xs={12}>
        <Card className="mb-4">
          <Card.Body className="text-center">
            <h3 className="mb-3">
              {status === "clocked-in"
                ? "You are currently clocked in"
                : "You are currently clocked out"}
            </h3>
            <div
              className="display-4 fw-bold text-primary mb-4"
              style={{ letterSpacing: "2px" }}
            >
              {formatDuration(duration)}
            </div>
            <div className="px-md-7">{renderActionButton()}</div>
          </Card.Body>
        </Card>
      </Col>
      <Col md={5} xs={12}>
        <Card>
          <Card.Header>
            <h4 className="mb-0">Today's Activity</h4>
          </Card.Header>
          <ListGroup variant="flush">
            {todayLog.length > 0 ? (
              todayLog.map((log, index) => (
                <ListGroup.Item
                  key={index}
                  className="d-flex justify-content-between align-items-center"
                >
                  <div>
                    <IconPlayerPlay
                      size={16}
                      className={`me-2 ${
                        log.type === "Clock In"
                          ? "text-success"
                          : "text-danger"
                      }`}
                    />
                    <span className="fw-bold">{log.type}</span>
                  </div>
                  <Badge
                    bg={log.type === "Clock In" ? "success-soft" : "danger-soft"}
                    className="p-2"
                  >
                    {formatTime(log.time)}
                  </Badge>
                </ListGroup.Item>
              ))
            ) : (
              <ListGroup.Item className="text-center text-muted py-4">
                No activity logged for today.
              </ListGroup.Item>
            )}
          </ListGroup>
        </Card>
      </Col>
    </Row>
  );
};

export default MarkAttendanceClient;
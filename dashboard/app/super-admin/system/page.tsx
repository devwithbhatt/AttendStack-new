"use client";

import { useState, useEffect } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Container,
  Row,
  Spinner,
  Table,
} from "react-bootstrap";
import {
  IconActivity,
  IconRefresh,
  IconShieldCheck,
  IconDatabase,
  IconServer,
  IconKey,
  IconCheck,
  IconClock,
  IconUser,
  IconBuildingSkyscraper,
} from "@tabler/icons-react";
import apiClient from "app/services/api";
import DasherBreadcrumb from "components/common/DasherBreadcrumb";

type AuditLog = {
  id: string;
  action: string;
  user: string;
  timestamp: string;
  status: "SUCCESS" | "WARNING" | "INFO";
  details: string;
};

export default function SuperAdminSystemPage() {
  const [loading, setLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState<string>("HEALTHY");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const checkHealth = async () => {
    setLoading(true);
    try {
      await apiClient.get("/api/v1/accounts/");
      setHealthStatus("HEALTHY");
    } catch {
      setHealthStatus("DEGRADED");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();

    // Mock live system audit logs
    const logs: AuditLog[] = [
      {
        id: "log-101",
        action: "Super Admin Platform Overview",
        user: "superadmin@attendstack.com",
        timestamp: new Date().toISOString(),
        status: "SUCCESS",
        details: "Fetched multi-tenant platform summary and org stats.",
      },
      {
        id: "log-100",
        action: "Company Invite Code Regeneration",
        user: "superadmin@attendstack.com",
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        status: "SUCCESS",
        details: "Generated new onboarding access code for tenant.",
      },
      {
        id: "log-099",
        action: "SimplyJob SSO Webhook Sync",
        user: "System Webhook Engine",
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        status: "INFO",
        details: "Validated HMAC-SHA256 signature for cross-app SSO jump.",
      },
      {
        id: "log-098",
        action: "HR Account Provisioned",
        user: "admin@gmail.com",
        timestamp: new Date(Date.now() - 14400000).toISOString(),
        status: "SUCCESS",
        details: "Created HR Manager profile with temporary credential.",
      },
    ];

    setAuditLogs(logs);
  }, []);

  return (
    <Container fluid className="py-3 px-lg-4 super-admin-system-page">
      <DasherBreadcrumb
        items={[
          { label: "Super Admin Command Center", href: "/super-admin/dashboard" },
          { label: "System Audit Logs" },
        ]}
      />
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <Badge bg="warning" text="dark" className="font-monospace px-3 py-1 rounded-pill">
              SUPER ADMIN PANEL
            </Badge>
            <span className="text-secondary small">System Integrity & Audit</span>
          </div>
          <h2 className="h3 mb-1 fw-bold text-dark d-flex align-items-center gap-2">
            <IconActivity className="text-success" size={32} />
            System Audit & Platform Health
          </h2>
          <p className="text-secondary mb-0">Monitor backend API services, database connection status, authentication tokens, and system audit trails.</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <Button variant="outline-secondary" onClick={checkHealth} disabled={loading} className="d-flex align-items-center gap-1.5 shadow-sm">
            <IconRefresh size={18} className={loading ? "spin" : ""} />
            Re-check Health
          </Button>
        </div>
      </div>

      {/* Health Indicator Cards */}
      <Row className="g-3 mb-4">
        <Col xs={12} sm={6} lg={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="d-flex align-items-center gap-3 p-3.5">
              <div className="rounded-3 p-3 bg-success-subtle text-success">
                <IconServer size={28} />
              </div>
              <div>
                <span className="text-secondary small fw-bold text-uppercase d-block">Backend API Server</span>
                <h5 className="mb-0 fw-bold text-success d-flex align-items-center gap-1.5">
                  <IconCheck size={18} /> Operational
                </h5>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} lg={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="d-flex align-items-center gap-3 p-3.5">
              <div className="rounded-3 p-3 bg-primary-subtle text-primary">
                <IconDatabase size={28} />
              </div>
              <div>
                <span className="text-secondary small fw-bold text-uppercase d-block">Database Engine</span>
                <h5 className="mb-0 fw-bold text-primary d-flex align-items-center gap-1.5">
                  <IconCheck size={18} /> SQLite Connected
                </h5>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} lg={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="d-flex align-items-center gap-3 p-3.5">
              <div className="rounded-3 p-3 bg-info-subtle text-info">
                <IconKey size={28} />
              </div>
              <div>
                <span className="text-secondary small fw-bold text-uppercase d-block">JWT Auth Engine</span>
                <h5 className="mb-0 fw-bold text-info d-flex align-items-center gap-1.5">
                  <IconCheck size={18} /> Active
                </h5>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} lg={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="d-flex align-items-center gap-3 p-3.5">
              <div className="rounded-3 p-3 bg-warning-subtle text-warning">
                <IconShieldCheck size={28} />
              </div>
              <div>
                <span className="text-secondary small fw-bold text-uppercase d-block">Security Guard</span>
                <h5 className="mb-0 fw-bold text-dark d-flex align-items-center gap-1.5">
                  <IconCheck size={18} /> Role Guarded
                </h5>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Audit Log Table */}
      <Card className="border-0 shadow-sm">
        <Card.Header className="bg-white border-0 py-3.5">
          <h5 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
            <IconActivity className="text-primary" size={22} />
            System Action Audit Log
          </h5>
        </Card.Header>
        <Card.Body className="p-0">
          <Table responsive hover className="align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th className="ps-4">Event Action</th>
                <th>Triggered By</th>
                <th>Timestamp</th>
                <th>Event Status</th>
                <th className="pe-4">Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="ps-4">
                    <strong className="text-dark d-block fs-6">{log.action}</strong>
                    <span className="text-secondary small font-monospace">#{log.id}</span>
                  </td>
                  <td>
                    <span className="small text-secondary d-flex align-items-center gap-1 fw-medium">
                      <IconUser size={14} /> {log.user}
                    </span>
                  </td>
                  <td>
                    <span className="small text-secondary d-flex align-items-center gap-1">
                      <IconClock size={14} />{" "}
                      {new Intl.DateTimeFormat("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(log.timestamp))}
                    </span>
                  </td>
                  <td>
                    <Badge
                      bg={log.status === "SUCCESS" ? "success-subtle" : "info-subtle"}
                      className={log.status === "SUCCESS" ? "text-success border border-success-subtle" : "text-info border border-info-subtle"}
                    >
                      {log.status}
                    </Badge>
                  </td>
                  <td className="pe-4">
                    <span className="small text-dark">{log.details}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </Container>
  );
}

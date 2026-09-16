"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Container, Card, Row, Col, Button, Form, Alert, Badge, Spinner, InputGroup } from "react-bootstrap";
import {
  IconCheck,
  IconEye,
  IconEyeOff,
  IconBuildingSkyscraper,
  IconUserCheck,
  IconCalendarEvent,
  IconBriefcase,
  IconFileCheck,
  IconMail,
  IconKey,
  IconShieldCheck,
  IconArrowRight,
  IconLock,
} from "@tabler/icons-react";
import axios from "axios";
import Link from "next/link";

function EmployeeJoinContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const code = searchParams.get("code") || "";
  const emailParam = searchParams.get("email") || "";

  const [orgName, setOrgName] = useState<string | null>(null);
  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!code) {
      setVerifyingCode(false);
      return;
    }

    const verifyCode = async () => {
      try {
        const apiBase = (process.env.NEXT_PUBLIC_API_ENDPOINT || "http://localhost:8001").replace(":8000", ":8001");
        let orgTitle = "";
        try {
          const res = await axios.get(`${apiBase}/api/v1/accounts/organization-code/?code=${encodeURIComponent(code)}`);
          if (res.data && res.data.organization_name) {
            orgTitle = res.data.organization_name;
          }
        } catch {
          // Fallback to organizations verify-code endpoint
          const res2 = await axios.get(`${apiBase}/api/v1/organizations/verify-code/?code=${encodeURIComponent(code)}`);
          if (res2.data && res2.data.organization_name) {
            orgTitle = res2.data.organization_name;
          }
        }
        if (orgTitle) {
          setOrgName(orgTitle);
          setError(null);
        } else {
          setError("Enter a valid active organization code.");
        }
      } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response?.data?.detail) {
          setError(err.response.data.detail);
        } else {
          setError("Enter a valid active organization code.");
        }
      } finally {
        setVerifyingCode(false);
      }
    };

    verifyCode();
  }, [code]);

  const handleLoginOrActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const apiBase = (process.env.NEXT_PUBLIC_API_ENDPOINT || "http://localhost:8001").replace(":8000", ":8001");
      const response = await axios.post(`${apiBase}/api/v1/accounts/login/`, {
        email,
        password,
      });

      if (response.data && response.data.access) {
        localStorage.setItem("authToken", response.data.access);
        localStorage.setItem("refreshToken", response.data.refresh);
        localStorage.setItem("user", JSON.stringify(response.data.user));
        setSuccess(true);
        setTimeout(() => {
          router.push("/employee-dashboard");
        }, 1200);
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else {
        setError("Invalid email or password. Use your temporary password sent via email.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-vh-100 py-5 d-flex flex-column align-items-center justify-content-center bg-body-tertiary position-relative overflow-hidden">
      {/* Background Decorative Blur Orbs */}
      <div
        className="position-absolute top-0 start-50 translate-middle-x rounded-circle opacity-25"
        style={{
          width: "600px",
          height: "600px",
          background: "radial-gradient(circle, rgba(16,185,129,0.3) 0%, rgba(13,148,136,0) 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      <Container className="position-relative z-1">
        <Row className="justify-content-center">
          <Col md={10} lg={7} xl={6}>
            <Card className="border-0 shadow-lg rounded-4 overflow-hidden">
              {/* Premium Gradient Hero Banner */}
              <div
                className="p-4 p-md-5 text-center text-white position-relative"
                style={{
                  background: "linear-gradient(135deg, #059669 0%, #0d9488 50%, #047857 100%)",
                }}
              >
                <Link
                  href="/"
                  className="d-inline-flex align-items-center justify-content-center rounded-circle bg-white p-2.5 mb-3 shadow-md border-0 text-decoration-none"
                  style={{ width: "72px", height: "72px", cursor: "pointer" }}
                  title="Go to AttendStack Home"
                >
                  <img
                    src="/images/brand/logo/logo.png"
                    alt="AttendStack logo"
                    style={{ height: "42px", width: "auto", objectFit: "contain" }}
                  />
                </Link>
                <div className="mb-2">
                  <span className="badge bg-white text-emerald-900 px-3 py-1.5 rounded-pill fw-bold uppercase shadow-sm" style={{ fontSize: "0.72rem", letterSpacing: "0.06em", color: "#065f46" }}>
                    Verified Workplace Invitation
                  </span>
                </div>
                <h1 className="h3 fw-bold text-white mb-2" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.15)" }}>
                  {orgName ? `Welcome to ${orgName}` : "Join Your Organization"}
                </h1>
                <p className="mb-0 small max-w-md mx-auto fs-6" style={{ color: "rgba(255,255,255,0.92)" }}>
                  Your Employee Profile is created and Day 1 attendance is ready to activate.
                </p>
              </div>

              <Card.Body className="p-4 p-md-5 bg-white">
                {verifyingCode ? (
                  <div className="text-center py-5">
                    <Spinner animation="border" variant="success" className="mb-3" style={{ width: "2.5rem", height: "2.5rem" }} />
                    <p className="text-secondary mb-0 fw-medium">Verifying organization workspace details...</p>
                  </div>
                ) : (
                  <>
                    {error && (
                      <Alert variant="danger" className="mb-4 border-0 shadow-sm rounded-3 d-flex align-items-center gap-2">
                        <IconLock size={20} className="flex-shrink-0" />
                        <div>{error}</div>
                      </Alert>
                    )}

                    {success && (
                      <Alert variant="success" className="mb-4 border-0 shadow-sm rounded-3 d-flex align-items-center gap-2">
                        <IconCheck size={22} className="flex-shrink-0" />
                        <div>
                          <strong>Account Activated!</strong> Redirecting to your Employee Dashboard...
                        </div>
                      </Alert>
                    )}

                    {/* SimplyJob Transferred Information Panel */}
                    <div className="rounded-3 border border-emerald-200 p-3 p-md-4 mb-4 bg-emerald-50-subtle">
                      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 pb-2 border-bottom">
                        <span className="fw-bold text-dark d-flex align-items-center gap-2">
                          <span className="d-inline-flex align-items-center justify-content-center rounded-circle bg-emerald-100 text-emerald-700 p-1">
                            <IconUserCheck size={17} />
                          </span>
                          Transferred Information
                        </span>
                        <Badge bg="success" className="px-2.5 py-1.5 rounded-pill fw-medium" style={{ fontSize: "0.75rem" }}>
                          Transferred from SimplyJob
                        </Badge>
                      </div>

                      <Row className="g-3 text-secondary small">
                        {emailParam && (
                          <Col sm={6}>
                            <div className="d-flex align-items-center gap-2">
                              <span className="fw-medium text-dark">Email:</span>
                              <span className="text-truncate">{emailParam}</span>
                            </div>
                          </Col>
                        )}
                        <Col sm={6}>
                          <div className="d-flex align-items-center gap-1.5">
                            <IconBriefcase size={16} className="text-emerald-600 flex-shrink-0" />
                            <span><strong className="text-dark">Profile:</strong> Pre-filled & Ready</span>
                          </div>
                        </Col>
                        <Col sm={6}>
                          <div className="d-flex align-items-center gap-1.5">
                            <IconFileCheck size={16} className="text-emerald-600 flex-shrink-0" />
                            <span><strong className="text-dark">Documents:</strong> Resume Attached</span>
                          </div>
                        </Col>
                        <Col sm={6}>
                          <div className="d-flex align-items-center gap-1.5">
                            <IconCalendarEvent size={16} className="text-emerald-600 flex-shrink-0" />
                            <span><strong className="text-dark">Attendance:</strong> Active Day 1</span>
                          </div>
                        </Col>
                      </Row>
                    </div>

                    <Form onSubmit={handleLoginOrActivate}>
                      <Form.Group className="mb-3.5" controlId="joinEmail">
                        <Form.Label className="fw-semibold text-dark small mb-1.5">Registered Work Email</Form.Label>
                        <InputGroup>
                          <InputGroup.Text className="bg-light border-end-0 text-secondary">
                            <IconMail size={18} />
                          </InputGroup.Text>
                          <Form.Control
                            type="email"
                            placeholder="Enter your email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="border-start-0 ps-0 py-2.5"
                          />
                        </InputGroup>
                      </Form.Group>

                      <Form.Group className="mb-4" controlId="joinPassword">
                        <Form.Label className="fw-semibold text-dark small mb-1.5">Password / Temporary Code</Form.Label>
                        <InputGroup>
                          <InputGroup.Text className="bg-light border-end-0 text-secondary">
                            <IconKey size={18} />
                          </InputGroup.Text>
                          <Form.Control
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter temporary password sent to email"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="border-start-0 border-end-0 ps-0 py-2.5"
                          />
                          <Button
                            variant="outline-secondary"
                            onClick={() => setShowPassword(!showPassword)}
                            type="button"
                            className="border-start-0"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                          </Button>
                        </InputGroup>
                        <Form.Text className="text-secondary small mt-1.5 d-block">
                          Check your email or message from your employer for your login password.
                        </Form.Text>
                      </Form.Group>

                      <Button
                        variant="success"
                        type="submit"
                        className="w-100 py-3 fs-6 fw-bold rounded-3 shadow-sm d-flex align-items-center justify-content-center gap-2"
                        style={{
                          background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                          border: "none",
                        }}
                        disabled={loading || success}
                      >
                        {loading ? (
                          <>
                            <Spinner as="span" animation="border" size="sm" />
                            <span>Activating Access...</span>
                          </>
                        ) : (
                          <>
                            <span>Activate & Start Day 1 Attendance</span>
                            <IconArrowRight size={19} />
                          </>
                        )}
                      </Button>
                    </Form>

                    <div className="text-center mt-4 pt-3 border-top">
                      <small className="text-secondary d-inline-flex align-items-center gap-1">
                        <IconShieldCheck size={16} className="text-emerald-600" />
                        Need help? <Link href="/forgot-password" className="text-emerald-700 fw-semibold text-decoration-none ms-1">Reset password</Link> or contact HR manager.
                      </small>
                    </div>
                  </>
                )}
              </Card.Body>
            </Card>

            <div className="text-center mt-4">
              <p className="text-secondary small mb-0">
                Powered by <strong className="text-dark">SimplyJob</strong> & <strong className="text-dark">AttendStack Enterprise</strong>
              </p>
            </div>
          </Col>
        </Row>
      </Container>
    </div>
  );
}

export default function EmployeeJoinPage() {
  return (
    <Suspense fallback={<div className="text-center py-5"><Spinner animation="border" variant="success" /></div>}>
      <EmployeeJoinContent />
    </Suspense>
  );
}

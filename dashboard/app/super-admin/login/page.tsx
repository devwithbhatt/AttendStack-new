"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Container,
  Row,
  Col,
  Card,
  Form,
  Button,
  Alert,
  Spinner,
  InputGroup,
  Image,
  Badge,
} from "react-bootstrap";
import {
  IconEye,
  IconEyeOff,
  IconShieldCheck,
  IconArrowLeft,
} from "@tabler/icons-react";
import axios from "axios";
import Link from "next/link";

export default function SuperAdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!email || !password) {
      setError("Email and password are required.");
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/accounts/login/`,
        {
          email,
          password,
        }
      );

      if (response.data && response.data.access) {
        const user = response.data.user;
        if (user && (user.role === "SUPER_ADMIN" || user.is_superuser)) {
          localStorage.setItem("authToken", response.data.access);
          localStorage.setItem("refreshToken", response.data.refresh);
          localStorage.setItem("user", JSON.stringify(user));
          router.push("/super-admin/dashboard");
        } else {
          setError("Access denied. This account does not have Super Admin privileges.");
        }
      } else {
        setError("Login failed. Please check your Super Admin credentials.");
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && typeof err.response?.data?.detail === "string") {
        setError(err.response.data.detail);
      } else {
        setError("An unexpected authentication error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-vh-100 d-flex align-items-center justify-content-center py-5 position-relative"
      style={{
        background: "linear-gradient(135deg, rgba(15, 23, 42, 0.82) 0%, rgba(15, 23, 42, 0.92) 100%), url('/images/background/super-admin-bg.jpg') center/cover no-repeat fixed",
      }}
    >
      <Container className="position-relative" style={{ zIndex: 2 }}>
        <Row className="justify-content-center">
          <Col md={12} className="d-flex justify-content-center">
            <Card
              style={{
                width: "min(26.5rem, calc(100vw - 2rem))",
                backgroundColor: "rgba(255, 255, 255, 0.96)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.3)",
              }}
              className="p-4 border-0 rounded-4"
            >
              <Card.Body>
                <div className="text-center mb-4">
                  <Link href="/" aria-label="AttendStack Home">
                    <Image
                      src="/images/brand/logo/logo.png"
                      className="mb-3 rounded-3"
                      alt="AttendStack Logo"
                      style={{ height: "58px", width: "auto", objectFit: "contain" }}
                    />
                  </Link>
                  <div className="d-flex justify-content-center mb-2">
                    <Badge
                      bg="warning"
                      text="dark"
                      className="font-monospace px-3 py-1.5 rounded-pill fw-bold"
                      style={{ letterSpacing: "0.05em", fontSize: "0.72rem" }}
                    >
                      SUPER ADMIN GATEWAY
                    </Badge>
                  </div>
                  <h1 className="h4 fw-bold text-dark mb-1">Super Admin Portal</h1>
                  <p className="text-muted small mb-0">Platform master authentication for multi-tenant control</p>
                </div>

                {error && (
                  <Alert variant="danger" className="py-2 px-3 small border-0 shadow-xs mb-3">
                    {error}
                  </Alert>
                )}

                <Form onSubmit={handleSubmit}>
                  <Form.Group className="mb-3" controlId="superAdminEmail">
                    <Form.Label className="small fw-semibold text-secondary">Super Admin Email</Form.Label>
                    <Form.Control
                      type="email"
                      placeholder="superadmin@attendstack.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="py-2"
                    />
                  </Form.Group>

                  <Form.Group className="mb-4" controlId="superAdminPassword">
                    <Form.Label className="small fw-semibold text-secondary">Password</Form.Label>
                    <InputGroup>
                      <Form.Control
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                        className="py-2"
                      />
                      <Button
                        type="button"
                        variant="outline-secondary"
                        onClick={() => setShowPassword((visible) => !visible)}
                        title={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                      </Button>
                    </InputGroup>
                  </Form.Group>

                  <Button
                    variant="warning"
                    type="submit"
                    className="w-100 fw-bold text-dark py-2.5 shadow-sm rounded-3 mb-3 d-flex align-items-center justify-content-center gap-2"
                    disabled={loading}
                    style={{
                      background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                      border: "none",
                      color: "#ffffff",
                    }}
                  >
                    {loading ? (
                      <>
                        <Spinner animation="border" size="sm" className="me-2 text-white" />
                        <span className="text-white">Signing In...</span>
                      </>
                    ) : (
                      <>
                        <IconShieldCheck size={20} className="text-white" />
                        <span className="text-white">Sign In to Super Admin Panel</span>
                      </>
                    )}
                  </Button>
                </Form>

                <div className="text-center mt-4">
                  <Link href="/sign-in" className="text-secondary small text-decoration-none d-inline-flex align-items-center gap-1">
                    <IconArrowLeft size={16} /> Back to Employee & Company Login
                  </Link>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}

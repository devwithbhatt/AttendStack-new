"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Container, Row, Col, Card, Form, Button, Alert, Spinner, InputGroup, Image } from "react-bootstrap";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import axios from "axios";
import Link from "next/link";

const SignInPage = () => {
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
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/accounts/login/`, {
        email,
        password,
      });

      if (response.data && response.data.access) {
        localStorage.removeItem("authToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");

        localStorage.setItem("authToken", response.data.access);
        localStorage.setItem("refreshToken", response.data.refresh);
        localStorage.setItem("user", JSON.stringify(response.data.user));
        if (response.data.organization) {
          localStorage.setItem("organization", JSON.stringify(response.data.organization));
        }
        const role = response.data.user?.role;
        if (role === "EMPLOYEE") {
          router.push("/employee-dashboard");
        } else {
          router.push("/dashboard");
        }
      } else {
        setError("Login failed. Please check your credentials.");
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && typeof err.response?.data?.detail === "string") {
        setError(err.response.data.detail);
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-vh-100 d-flex align-items-center justify-content-center py-5 position-relative"
      style={{
        background: "linear-gradient(135deg, rgba(241, 245, 249, 0.85) 0%, rgba(226, 232, 240, 0.92) 100%), url('/images/background/super-admin-bg.jpg') center/cover no-repeat fixed",
      }}
    >
      <Container className="position-relative" style={{ zIndex: 2 }}>
        <Row className="justify-content-center">
          <Col md={12} className="d-flex justify-content-center">
            <Card
              style={{
                width: "min(26rem, calc(100vw - 2rem))",
                backgroundColor: "rgba(255, 255, 255, 0.96)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                boxShadow: "0 20px 45px -10px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.4)",
              }}
              className="p-4 border-0 rounded-4"
            >
            <Card.Body>
              <div className="text-center mb-4">
                <Link href="/" aria-label="AttendStack home">
                  <Image
                    src="/images/brand/logo/logo.png"
                    className="mb-3 rounded-3"
                    alt="AttendStack logo"
                    style={{ height: "72px", width: "72px", objectFit: "contain" }}
                  />
                </Link>
                <h1 className="h3 fw-bold mb-1">AttendStack</h1>
                <p className="text-muted mb-0">Sign in to your account</p>
              </div>
              
              {error && <Alert variant="danger">{error}</Alert>}

              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3" controlId="formBasicEmail">
                  <Form.Label>Email address</Form.Label>
                  <Form.Control
                    type="email"
                    placeholder="Enter email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </Form.Group>

                <Form.Group className="mb-3" controlId="formBasicPassword">
                  <Form.Label>Password</Form.Label>
                  <InputGroup>
                    <Form.Control
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <Button
                      type="button"
                      variant="outline-secondary"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                    </Button>
                  </InputGroup>
                </Form.Group>

                <div className="d-flex justify-content-between align-items-center mb-3">
                  <Form.Check type="checkbox" label="Remember me" />
                  <Link href="/forgot-password">Forgot password?</Link>
                </div>

                <Button variant="primary" type="submit" className="w-100" disabled={loading}>
                  {loading ? (
                    <>
                      <Spinner
                        as="span"
                        animation="border"
                        size="sm"
                        role="status"
                        aria-hidden="true"
                      />
                      <span className="ms-2">Signing In...</span>
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </Form>
              <p className="text-muted text-center mt-3 mb-0">
                New employee? <Link href="/register">Create your account .</Link>
              </p>
              <div className="border-top text-center mt-4 pt-3">
                <small className="text-muted">
                  AttendStack is a{" "}
                  <a
                    href="https://bhattsquare.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="fw-semibold"
                  >
                    Bhatt Square
                  </a>{" "}
                  project.
                </small>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  </div>
  );
};

export default SignInPage;

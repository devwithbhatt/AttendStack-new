"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Container,
  Row,
  Col,
  Card,
  Form,
  Button,
  Image,
  Alert,
  Spinner,
  InputGroup,
} from "react-bootstrap";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import Link from "next/link";
import axios from "axios";

const AdminSignIn = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Clear local storage on component mount
    localStorage.removeItem("authToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

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
        localStorage.removeItem("authToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");

        if (user && user.role !== "EMPLOYEE") {
          localStorage.setItem("authToken", response.data.access);
          localStorage.setItem("refreshToken", response.data.refresh);
          localStorage.setItem("user", JSON.stringify(user));
          if (response.data.organization) {
            localStorage.setItem("organization", JSON.stringify(response.data.organization));
          }
          router.push("/dashboard");
        } else {
          setError("Access denied. Use an organization owner or HR account.");
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
    <Container
      fluid
      className="vh-100 d-flex align-items-center justify-content-center bg-light"
    >
      <Row>
        <Col md={12}>
          <Card style={{ width: "25rem" }} className="p-4 shadow-sm">
            <Card.Body>
              <div className="text-center mb-4">
                <Link href="/">
                  <Image
                    src={"/images/brand/logo/logo.png"}
                    className="mb-4"
                    alt="AttendStack Logo"
                    style={{ height: "45px", width: "auto" }}
                  />
                </Link>
                <p className="text-muted">Company workspace access</p>
              </div>

              {error && <Alert variant="danger">{error}</Alert>}

              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3" controlId="email">
                  <Form.Label>Email</Form.Label>
                  <Form.Control
                    type="email"
                    placeholder="Enter email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </Form.Group>

                <Form.Group className="mb-3" controlId="password">
                  <Form.Label>Password</Form.Label>
                  <InputGroup>
                    <Form.Control
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
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

                <div className="text-end mb-3">
                  <Link href="/forgot-password">Forgot password?</Link>
                </div>

                <Button
                  variant="primary"
                  type="submit"
                  className="w-100"
                  disabled={loading}
                >
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
                Setting up a new company? <Link href="/register-organization">Create an organization workspace.</Link>
              </p>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default AdminSignIn;

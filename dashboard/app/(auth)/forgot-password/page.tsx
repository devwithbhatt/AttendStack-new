"use client";

import { useState } from "react";
import axios from "axios";
import Link from "next/link";
import {
  Alert,
  Button,
  Card,
  Col,
  Container,
  Form,
  Image,
  InputGroup,
  Row,
  Spinner,
} from "react-bootstrap";
import { IconEye, IconEyeOff } from "@tabler/icons-react";

type RecoveryStep = "request" | "reset" | "complete";

const apiBase = process.env.NEXT_PUBLIC_API_ENDPOINT || "";

const getApiError = (error: unknown) => {
  if (!axios.isAxiosError(error) || !error.response?.data) {
    return "An unexpected error occurred. Please try again.";
  }

  const data = error.response.data;
  if (typeof data.detail === "string") {
    return data.detail;
  }

  const firstError = Object.values(data).flat().find(Boolean);
  return typeof firstError === "string"
    ? firstError
    : "Please check the entered details and try again.";
};

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<RecoveryStep>("request");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const requestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const response = await axios.post(
        `${apiBase}/api/v1/accounts/password-reset/request/`,
        { email }
      );
      setMessage(response.data.detail);
      setStep("reset");
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(
        `${apiBase}/api/v1/accounts/password-reset/confirm/`,
        {
          email,
          otp,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }
      );
      setMessage(response.data.detail);
      setStep("complete");
    } catch (resetError) {
      setError(getApiError(resetError));
    } finally {
      setLoading(false);
    }
  };

  const requestAnotherCode = () => {
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage("");
    setError("");
    setStep("request");
  };

  return (
    <Container
      fluid
      className="min-vh-100 d-flex align-items-center justify-content-center bg-light py-4"
    >
      <Row>
        <Col>
          <Card style={{ width: "min(28rem, calc(100vw - 2rem))" }} className="p-4 shadow-sm">
            <Card.Body>
              <div className="text-center mb-4">
                <Link href="/">
                  <Image
                    src="/images/brand/logo/logo.png"
                    className="mb-4"
                    alt="AttendStack Logo"
                    style={{ height: "45px", width: "auto" }}
                  />
                </Link>
                <h2 className="h4 fw-bold">
                  {step === "complete" ? "Password updated" : "Reset your password"}
                </h2>
                <p className="text-muted mb-0">
                  {step === "request" && "Enter your account email to receive a verification code."}
                  {step === "reset" && `Enter the code sent to ${email}.`}
                  {step === "complete" && "Your new password is ready to use."}
                </p>
              </div>

              {error && <Alert variant="danger">{error}</Alert>}
              {message && <Alert variant="success">{message}</Alert>}

              {step === "request" && (
                <Form onSubmit={requestCode}>
                  <Form.Group className="mb-3" controlId="recoveryEmail">
                    <Form.Label>Email address</Form.Label>
                    <Form.Control
                      type="email"
                      placeholder="Enter email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      required
                    />
                  </Form.Group>
                  <Button type="submit" className="w-100" disabled={loading}>
                    {loading ? (
                      <>
                        <Spinner animation="border" size="sm" />
                        <span className="ms-2">Sending code...</span>
                      </>
                    ) : (
                      "Send verification code"
                    )}
                  </Button>
                </Form>
              )}

              {step === "reset" && (
                <Form onSubmit={resetPassword}>
                  <Form.Group className="mb-3" controlId="recoveryOtp">
                    <Form.Label>Verification code</Form.Label>
                    <Form.Control
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      placeholder="6-digit code"
                      value={otp}
                      onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                      autoComplete="one-time-code"
                      required
                    />
                  </Form.Group>
                  <Form.Group className="mb-3" controlId="newPassword">
                    <Form.Label>New password</Form.Label>
                    <InputGroup>
                      <Form.Control
                        type={showNewPassword ? "text" : "password"}
                        placeholder="Enter new password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        autoComplete="new-password"
                        required
                      />
                      <Button
                        type="button"
                        variant="outline-secondary"
                        onClick={() => setShowNewPassword((visible) => !visible)}
                        aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                        title={showNewPassword ? "Hide new password" : "Show new password"}
                      >
                        {showNewPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                      </Button>
                    </InputGroup>
                  </Form.Group>
                  <Form.Group className="mb-3" controlId="confirmPassword">
                    <Form.Label>Confirm new password</Form.Label>
                    <InputGroup>
                      <Form.Control
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Repeat new password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        autoComplete="new-password"
                        required
                      />
                      <Button
                        type="button"
                        variant="outline-secondary"
                        onClick={() => setShowConfirmPassword((visible) => !visible)}
                        aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                        title={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                      >
                        {showConfirmPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                      </Button>
                    </InputGroup>
                  </Form.Group>
                  <Button type="submit" className="w-100" disabled={loading}>
                    {loading ? (
                      <>
                        <Spinner animation="border" size="sm" />
                        <span className="ms-2">Updating password...</span>
                      </>
                    ) : (
                      "Reset password"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    className="w-100 mt-2"
                    onClick={requestAnotherCode}
                    disabled={loading}
                  >
                    Request another code
                  </Button>
                </Form>
              )}

              <div className="text-center mt-4">
                <Link href="/sign-in">Employee sign in</Link>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

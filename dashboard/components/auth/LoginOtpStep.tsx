"use client";
import { useEffect, useState } from "react";
import { Form, Button, Alert, Spinner } from "react-bootstrap";
import { IconArrowLeft } from "@tabler/icons-react";
import axios from "axios";

interface LoginOtpStepProps {
  email: string;
  onVerified: (data: any) => void;
  onCancel: () => void;
  accentVariant?: string;
}

const RESEND_SECONDS = 60;

const LoginOtpStep = ({ email, onVerified, onCancel, accentVariant = "primary" }: LoginOtpStepProps) => {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResendMessage("");

    if (!otp || otp.trim().length !== 6) {
      setError("Enter the 6-digit code sent to your email.");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/accounts/login/verify-otp/`,
        { email, otp: otp.trim() }
      );
      onVerified(response.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && Array.isArray(err.response?.data?.otp) && typeof err.response?.data?.otp?.[0] === "string") {
        setError(err.response.data.otp[0]);
      } else if (axios.isAxiosError(err) && typeof err.response?.data?.detail === "string") {
        setError(err.response.data.detail);
      } else {
        setError("Unable to verify the code. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setResendMessage("");
    setResending(true);
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/accounts/login/resend-otp/`, { email });
      setResendMessage("If needed, a new code has been sent to your email.");
      setCooldown(RESEND_SECONDS);
    } catch {
      setResendMessage("If needed, a new code has been sent to your email.");
      setCooldown(RESEND_SECONDS);
    } finally {
      setResending(false);
    }
  };

  return (
    <>
      <div className="text-center mb-4">
        <h1 className="h4 fw-bold mb-1">Verify your identity</h1>
        <p className="text-muted mb-0">
          Enter the 6-digit code sent to <strong>{email}</strong>
        </p>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {!error && resendMessage && <Alert variant="info">{resendMessage}</Alert>}

      <Form onSubmit={handleVerify}>
        <Form.Group className="mb-3" controlId="loginOtpCode">
          <Form.Label>Verification code</Form.Label>
          <Form.Control
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="text-center fs-4 fw-bold"
            style={{ letterSpacing: "0.5em" }}
            autoFocus
            required
          />
          <Form.Text className="text-muted">Code expires in 5 minutes.</Form.Text>
        </Form.Group>

        <Button variant={accentVariant} type="submit" className="w-100 mb-3" disabled={loading}>
          {loading ? (
            <>
              <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
              <span className="ms-2">Verifying...</span>
            </>
          ) : (
            "Verify & Continue"
          )}
        </Button>

        <div className="d-flex justify-content-between align-items-center">
          <Button variant="link" className="p-0 text-secondary" onClick={onCancel} type="button">
            <IconArrowLeft size={16} className="me-1" style={{ verticalAlign: "text-bottom" }} />
            Back to sign in
          </Button>
          <Button
            variant="link"
            className="p-0"
            type="button"
            disabled={cooldown > 0 || resending}
            onClick={handleResend}
          >
            {resending ? "Sending..." : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </Button>
        </div>
      </Form>
    </>
  );
};

export default LoginOtpStep;

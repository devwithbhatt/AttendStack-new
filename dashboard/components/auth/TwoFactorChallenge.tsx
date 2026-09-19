"use client";

import React, { useState, useEffect } from "react";
import {
  Alert,
  Badge,
  Button,
  Form,
  InputGroup,
  Spinner,
  Nav,
} from "react-bootstrap";
import {
  IconShieldCheck,
  IconDeviceMobile,
  IconMail,
  IconKey,
  IconArrowLeft,
  IconSend,
  IconLifebuoy,
  IconCheck,
} from "@tabler/icons-react";
import axios from "axios";

interface TwoFactorChallengeProps {
  tempToken: string;
  emailMasked?: string;
  portalType?: "general" | "admin" | "super-admin";
  onSuccess: (data: any) => void;
  onCancel: () => void;
}

type VerificationMethod = "authenticator" | "email_otp" | "backup_code";

export default function TwoFactorChallenge({
  tempToken,
  emailMasked,
  portalType = "general",
  onSuccess,
  onCancel,
}: TwoFactorChallengeProps) {
  const [method, setMethod] = useState<VerificationMethod>("authenticator");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [otpSentNotice, setOtpSentNotice] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT || "";

  // Cooldown countdown timer for resending Email OTP
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSendEmailOtp = async () => {
    if (cooldown > 0 || otpSending) return;
    setOtpSending(true);
    setError("");
    setOtpSentNotice("");

    try {
      const res = await axios.post(`${apiEndpoint}/api/v1/accounts/2fa/send-otp/`, {
        temp_token: tempToken,
      });
      setOtpSentNotice(res.data?.detail || "Verification code dispatched to your email.");
      setCooldown(30);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && typeof err.response?.data?.detail === "string") {
        setError(err.response.data.detail);
      } else {
        setError("Failed to dispatch email verification code. Please try again.");
      }
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Please enter your verification code.");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${apiEndpoint}/api/v1/accounts/2fa/verify/`, {
        temp_token: tempToken,
        code: trimmed,
        method: method,
      });

      if (response.data && response.data.access) {
        onSuccess(response.data);
      } else {
        setError("Verification was not completed. Please retry.");
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && typeof err.response?.data?.detail === "string") {
        setError(err.response.data.detail);
      } else {
        setError("Invalid or expired code. Please verify and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="two-factor-challenge-card">
      <div className="text-center mb-3">
        <div
          className="d-inline-flex align-items-center justify-content-center rounded-circle mb-2"
          style={{
            width: 60,
            height: 60,
            backgroundColor: portalType === "super-admin" ? "rgba(234, 179, 8, 0.15)" : "rgba(37, 99, 235, 0.12)",
            color: portalType === "super-admin" ? "#d97706" : "#2563eb",
          }}
        >
          <IconShieldCheck size={32} />
        </div>
        <h2 className="h4 fw-bold mb-1">Two-Factor Authentication</h2>
        <p className="text-muted small mb-0">
          Additional verification required for high-privilege access
        </p>
      </div>

      {error && (
        <Alert variant="danger" className="py-2 px-3 small mb-3">
          {error}
        </Alert>
      )}

      {otpSentNotice && (
        <Alert variant="success" className="py-2 px-3 small mb-3 d-flex align-items-center gap-2">
          <IconCheck size={16} />
          <span>{otpSentNotice}</span>
        </Alert>
      )}

      {/* Verification method selection tabs */}
      <Nav
        variant="pills"
        activeKey={method}
        onSelect={(k) => {
          if (k) {
            setMethod(k as VerificationMethod);
            setCode("");
            setError("");
          }
        }}
        className="nav-fill mb-3 bg-light p-1 rounded-3"
      >
        <Nav.Item>
          <Nav.Link
            eventKey="authenticator"
            className="d-flex align-items-center justify-content-center gap-1 py-1.5 px-2 small fw-semibold"
            style={{ fontSize: "0.8rem" }}
          >
            <IconDeviceMobile size={15} />
            <span>App</span>
          </Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link
            eventKey="email_otp"
            className="d-flex align-items-center justify-content-center gap-1 py-1.5 px-2 small fw-semibold"
            style={{ fontSize: "0.8rem" }}
          >
            <IconMail size={15} />
            <span>Email</span>
          </Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link
            eventKey="backup_code"
            className="d-flex align-items-center justify-content-center gap-1 py-1.5 px-2 small fw-semibold"
            style={{ fontSize: "0.8rem" }}
          >
            <IconKey size={15} />
            <span>Backup</span>
          </Nav.Link>
        </Nav.Item>
      </Nav>

      <Form onSubmit={handleVerify}>
        {/* Authenticator App View */}
        {method === "authenticator" && (
          <div className="mb-3">
            <Form.Label className="small fw-semibold text-secondary">
              6-Digit Authenticator Code
            </Form.Label>
            <Form.Control
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center font-monospace fw-bold fs-4 py-2"
              style={{ letterSpacing: "0.4em" }}
              autoFocus
              required
            />
            <Form.Text className="text-muted small">
              Open Google Authenticator, Microsoft Authenticator, or Authy.
            </Form.Text>
          </div>
        )}

        {/* Email OTP View */}
        {method === "email_otp" && (
          <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <Form.Label className="small fw-semibold text-secondary mb-0">
                Email Verification Code
              </Form.Label>
              <Button
                variant="link"
                size="sm"
                className="p-0 text-decoration-none small"
                onClick={handleSendEmailOtp}
                disabled={otpSending || cooldown > 0}
              >
                {otpSending ? (
                  <>
                    <Spinner size="sm" animation="border" className="me-1" />
                    Sending...
                  </>
                ) : cooldown > 0 ? (
                  `Resend in ${cooldown}s`
                ) : (
                  "Send Code to Email"
                )}
              </Button>
            </div>
            {emailMasked && (
              <p className="text-muted small mb-2">
                Registered address: <span className="fw-semibold text-dark">{emailMasked}</span>
              </p>
            )}
            <Form.Control
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center font-monospace fw-bold fs-4 py-2"
              style={{ letterSpacing: "0.4em" }}
              autoFocus
              required
            />
          </div>
        )}

        {/* Backup Recovery Code View */}
        {method === "backup_code" && (
          <div className="mb-3">
            <Form.Label className="small fw-semibold text-secondary">
              Emergency Backup Recovery Code
            </Form.Label>
            <Form.Control
              type="text"
              placeholder="e.g. ABCD-1234"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="text-center font-monospace fw-bold fs-5 py-2"
              style={{ letterSpacing: "0.15em" }}
              autoFocus
              required
            />
            <Form.Text className="text-muted small">
              Use one of the 10 backup codes generated during 2FA setup. Each code works once.
            </Form.Text>
          </div>
        )}

        <Button
          variant={portalType === "super-admin" ? "warning" : "primary"}
          type="submit"
          className="w-100 mb-3 fw-semibold py-2"
          disabled={loading || !code.trim()}
        >
          {loading ? (
            <>
              <Spinner size="sm" animation="border" className="me-2" />
              Verifying...
            </>
          ) : (
            "Verify & Continue"
          )}
        </Button>

        <div className="d-flex justify-content-between align-items-center">
          <Button
            variant="link"
            size="sm"
            onClick={onCancel}
            className="text-muted text-decoration-none p-0 d-inline-flex align-items-center gap-1 small"
          >
            <IconArrowLeft size={15} />
            <span>Cancel & Back</span>
          </Button>

          <span
            className="text-muted small d-inline-flex align-items-center gap-1"
            title="If permanently locked out, contact the Super Admin."
          >
            <IconLifebuoy size={14} />
            <span>Need Help?</span>
          </span>
        </div>
      </Form>

      <div className="mt-3 pt-2 border-top text-center">
        <p className="text-muted mb-0" style={{ fontSize: "0.75rem" }}>
          Lost access to your device and backup codes? Contact your{" "}
          <strong>Super Administrator</strong> for emergency account recovery.
        </p>
      </div>
    </div>
  );
}

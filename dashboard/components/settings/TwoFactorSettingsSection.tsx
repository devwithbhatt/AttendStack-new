"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  Row,
  Col,
  Button,
  Badge,
  Alert,
  Modal,
  Form,
  Spinner,
  InputGroup,
} from "react-bootstrap";
import {
  IconShieldCheck,
  IconShieldX,
  IconKey,
  IconQrcode,
  IconCopy,
  IconDownload,
  IconRefresh,
  IconLock,
  IconAlertTriangle,
  IconCheck,
  IconDeviceMobile,
  IconArrowRight,
  IconEye,
  IconEyeOff,
} from "@tabler/icons-react";
import Swal from "sweetalert2";

const apiRoot = (process.env.NEXT_PUBLIC_API_ENDPOINT || "").replace(/\/$/, "");

const authHeaders = () => {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : "";
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
};

interface TwoFactorStatus {
  is_enabled: boolean;
  remaining_backup_codes: number;
  last_used_at: string | null;
}

interface SetupData {
  secret: string;
  qr_code_data_uri: string;
  backup_codes: string[];
}

export default function TwoFactorSettingsSection() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Setup Wizard Modal State
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupStep, setSetupStep] = useState<1 | 2 | 3>(1);
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [isStartingSetup, setIsStartingSetup] = useState(false);
  const [confirmCode, setConfirmCode] = useState("");
  const [isActivating, setIsActivating] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);

  // Disable Modal State
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [showDisablePassword, setShowDisablePassword] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [disableError, setDisableError] = useState("");

  // Regenerate Backup Codes Modal State
  const [showRegenModal, setShowRegenModal] = useState(false);
  const [regenPassword, setRegenPassword] = useState("");
  const [showRegenPassword, setShowRegenPassword] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenError, setRegenError] = useState("");
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiRoot}/api/v1/accounts/2fa/status/`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error("Failed to load 2FA status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Start 2FA Setup
  const handleStartSetup = async () => {
    setIsStartingSetup(true);
    setSetupError("");
    try {
      const res = await fetch(`${apiRoot}/api/v1/accounts/2fa/setup/start/`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || "Failed to initialize 2FA setup.");
      }
      const data: SetupData = await res.json();
      setSetupData(data);
      setSetupStep(1);
      setConfirmCode("");
      setShowSetupModal(true);
    } catch (err: any) {
      Swal.fire("Error", err.message || "Could not begin 2FA setup.", "error");
    } finally {
      setIsStartingSetup(false);
    }
  };

  // Confirm and Activate 2FA
  const handleConfirmSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmCode.trim() || confirmCode.trim().length !== 6) {
      setSetupError("Please enter a valid 6-digit code from your authenticator app.");
      return;
    }
    setIsActivating(true);
    setSetupError("");

    try {
      const res = await fetch(`${apiRoot}/api/v1/accounts/2fa/setup/confirm/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ code: confirmCode.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || "Invalid code. Please try again.");
      }

      setShowSetupModal(false);
      Swal.fire({
        icon: "success",
        title: "2FA Successfully Activated!",
        text: "Your account is now protected with Two-Factor Authentication. Save your backup codes in a safe place.",
        confirmButtonColor: "#2563eb",
      });
      fetchStatus();
    } catch (err: any) {
      setSetupError(err.message || "Verification failed. Check your authenticator time.");
    } finally {
      setIsActivating(false);
    }
  };

  // Turn Off 2FA
  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword) {
      setDisableError("Password is required to disable 2FA.");
      return;
    }
    setIsDisabling(true);
    setDisableError("");

    try {
      const res = await fetch(`${apiRoot}/api/v1/accounts/2fa/disable/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ password: disablePassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || "Failed to disable 2FA.");
      }

      setShowDisableModal(false);
      setDisablePassword("");
      Swal.fire({
        icon: "info",
        title: "Two-Factor Authentication Disabled",
        text: "2FA has been turned off for your account.",
      });
      fetchStatus();
    } catch (err: any) {
      setDisableError(err.message || "Failed to disable 2FA.");
    } finally {
      setIsDisabling(false);
    }
  };

  // Regenerate Backup Codes
  const handleRegenerateCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regenPassword) {
      setRegenError("Password is required.");
      return;
    }
    setIsRegenerating(true);
    setRegenError("");

    try {
      const res = await fetch(`${apiRoot}/api/v1/accounts/2fa/regenerate-backup-codes/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ password: regenPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || "Failed to regenerate codes.");
      }
      const data = await res.json();
      setNewCodes(data.backup_codes || []);
      setRegenPassword("");
      fetchStatus();
    } catch (err: any) {
      setRegenError(err.message || "Failed to regenerate codes.");
    } finally {
      setIsRegenerating(false);
    }
  };

  // Copy helper
  const copyToClipboard = (text: string, type: "key" | "codes") => {
    navigator.clipboard.writeText(text);
    if (type === "key") {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedBackupCodes(true);
      setTimeout(() => setCopiedBackupCodes(false), 2000);
    }
  };

  // Download backup codes as .txt
  const downloadBackupCodes = (codes: string[]) => {
    const textContent =
      `AttendStack Two-Factor Recovery Backup Codes\n` +
      `Generated: ${new Date().toLocaleString()}\n\n` +
      `KEEP THESE CODES SAFE! Each code can be used once to access your account if you lose your phone.\n\n` +
      codes.map((c, i) => `${i + 1}. ${c}`).join("\n") +
      `\n\n- AttendStack Security`;

    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendstack-backup-codes-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="p-4 text-center">
        <Spinner animation="border" size="sm" className="me-2" />
        <span className="text-muted small">Checking security configuration...</span>
      </div>
    );
  }

  const isEnabled = Boolean(status?.is_enabled);

  return (
    <div className="p-4 border-top two-factor-settings-section">
      <Row className="g-4">
        <Col lg={8}>
          {/* Main 2FA Status Card */}
          <Card className="border shadow-sm mb-4">
            <Card.Header className="bg-transparent py-3 d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-2">
                <div
                  className="rounded p-2 d-inline-flex align-items-center justify-content-center"
                  style={{
                    backgroundColor: isEnabled ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.1)",
                    color: isEnabled ? "#10b981" : "#ef4444",
                  }}
                >
                  {isEnabled ? <IconShieldCheck size={22} /> : <IconShieldX size={22} />}
                </div>
                <div>
                  <h5 className="fw-bold mb-0 text-dark">Two-Factor Authentication (2FA)</h5>
                  <small className="text-muted">
                    Industry-standard RFC 6238 TOTP Authenticator Apps + Emergency Backup Codes
                  </small>
                </div>
              </div>

              <span
                className="badge border px-3 py-2 font-monospace"
                style={{
                  backgroundColor: isEnabled ? "#ecfdf5" : "#fef2f2",
                  color: isEnabled ? "#047857" : "#b91c1c",
                  borderColor: isEnabled ? "#a7f3d0" : "#fecaca",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                }}
              >
                {isEnabled ? "ACTIVE & PROTECTED" : "DISABLED"}
              </span>
            </Card.Header>

            <Card.Body className="p-4">
              {isEnabled ? (
                <div>
                  <Alert variant="success" className="d-flex align-items-center gap-3 mb-4">
                    <IconShieldCheck size={28} className="flex-shrink-0 text-success" />
                    <div>
                      <h6 className="fw-bold mb-1 text-success">Two-Factor Protection is Active</h6>
                      <p className="mb-0 small">
                        Your account requires both your master password and a time-based 6-digit verification code from your authenticator app to sign in.
                      </p>
                    </div>
                  </Alert>

                  <Row className="g-3 mb-4">
                    <Col md={6}>
                      <div className="p-3 border rounded-3 bg-light">
                        <small className="text-muted d-block mb-1">Backup Recovery Codes</small>
                        <div className="d-flex align-items-baseline gap-2">
                          <span className="fs-4 fw-bold text-dark">
                            {status?.remaining_backup_codes ?? 0}
                          </span>
                          <span className="text-muted small">codes remaining</span>
                        </div>
                        <small className="text-muted d-block mt-1">
                          Can be used if you misplace your authenticator device.
                        </small>
                      </div>
                    </Col>
                    <Col md={6}>
                      <div className="p-3 border rounded-3 bg-light">
                        <small className="text-muted d-block mb-1">Last 2FA Authentication</small>
                        <div className="fs-6 fw-semibold text-dark">
                          {status?.last_used_at
                            ? new Date(status.last_used_at).toLocaleString()
                            : "Never recorded"}
                        </div>
                        <small className="text-muted d-block mt-1">
                          Recorded upon successful verification challenge.
                        </small>
                      </div>
                    </Col>
                  </Row>

                  <div className="d-flex flex-wrap gap-2 pt-2 border-top">
                    <Button
                      variant="outline-primary"
                      size="sm"
                      className="d-inline-flex align-items-center gap-2"
                      onClick={() => {
                        setNewCodes(null);
                        setRegenPassword("");
                        setRegenError("");
                        setShowRegenModal(true);
                      }}
                    >
                      <IconKey size={16} />
                      <span>Regenerate Backup Codes</span>
                    </Button>

                    <Button
                      variant="outline-danger"
                      size="sm"
                      className="d-inline-flex align-items-center gap-2"
                      onClick={() => {
                        setDisablePassword("");
                        setDisableError("");
                        setShowDisableModal(true);
                      }}
                    >
                      <IconShieldX size={16} />
                      <span>Turn Off 2FA</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <Alert variant="warning" className="d-flex align-items-center gap-3 mb-4">
                    <IconAlertTriangle size={28} className="flex-shrink-0 text-warning" />
                    <div>
                      <h6 className="fw-bold mb-1 text-dark">Account Security Vulnerability</h6>
                      <p className="mb-0 small text-muted">
                        High-privilege accounts managing company payroll, employee records, and geo-attendance should have 2FA enabled to protect against password reuse and phishing.
                      </p>
                    </div>
                  </Alert>

                  <div className="mb-4">
                    <h6 className="fw-semibold text-dark mb-2">How 2FA protects your workspace:</h6>
                    <ul className="text-muted small ps-3 mb-0">
                      <li className="mb-1">
                        Works with <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong>, <strong>1Password</strong>, or <strong>Authy</strong>.
                      </li>
                      <li className="mb-1">
                        Includes <strong>10 one-time emergency backup codes</strong> so you never get permanently locked out.
                      </li>
                      <li className="mb-1">
                        Offers <strong>Email OTP fallback</strong> right on the login screen.
                      </li>
                      <li>
                        Super Administrators can assist with emergency account rescue if you lose all recovery options.
                      </li>
                    </ul>
                  </div>

                  <Button
                    variant="primary"
                    className="fw-bold d-inline-flex align-items-center gap-2"
                    onClick={handleStartSetup}
                    disabled={isStartingSetup}
                  >
                    {isStartingSetup ? (
                      <>
                        <Spinner size="sm" animation="border" />
                        <span>Generating Secret...</span>
                      </>
                    ) : (
                      <>
                        <IconShieldCheck size={18} />
                        <span>Enable Two-Factor Authentication</span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col lg={4}>
          {/* Security Information Sidebar Card */}
          <Card className="border shadow-sm mb-4">
            <Card.Header className="bg-light py-3">
              <h6 className="fw-bold mb-0 text-dark">2FA Best Practices</h6>
            </Card.Header>
            <Card.Body className="p-3">
              <div className="mb-3">
                <small className="fw-bold text-dark d-block mb-1">
                  1. Download Authenticator App
                </small>
                <small className="text-muted">
                  Use Google Authenticator or Microsoft Authenticator from the App Store or Google Play.
                </small>
              </div>

              <div className="mb-3">
                <small className="fw-bold text-dark d-block mb-1">
                  2. Store Backup Codes Offline
                </small>
                <small className="text-muted">
                  Store your 10 recovery codes in a secure password manager or print them. Each code works once.
                </small>
              </div>

              <div className="mb-0">
                <small className="fw-bold text-dark d-block mb-1">
                  3. Emergency Super Admin Rescue
                </small>
                <small className="text-muted">
                  If an HR admin loses all devices and recovery codes, the platform Super Admin can perform an emergency reset.
                </small>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* ────────────────────────────────────────────────────────────────────────
          2FA Setup Wizard Modal (Steps 1, 2, 3)
         ──────────────────────────────────────────────────────────────────────── */}
      <Modal
        show={showSetupModal}
        onHide={() => setShowSetupModal(false)}
        centered
        size="lg"
        backdrop="static"
      >
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold d-flex align-items-center gap-2">
            <IconShieldCheck size={22} className="text-primary" />
            <span>Enable Two-Factor Authentication</span>
            <Badge bg="primary-subtle" className="text-primary ms-2" style={{ fontSize: "0.75rem" }}>
              Step {setupStep} of 3
            </Badge>
          </Modal.Title>
        </Modal.Header>

        <Modal.Body className="p-4">
          {setupError && (
            <Alert variant="danger" className="py-2 px-3 small mb-3">
              {setupError}
            </Alert>
          )}

          {/* STEP 1: Scan QR Code */}
          {setupStep === 1 && setupData && (
            <div>
              <div className="text-center mb-3">
                <h6 className="fw-bold text-dark mb-1">Scan this QR Code with your Authenticator App</h6>
                <p className="text-muted small mb-0">
                  Open Google Authenticator or Microsoft Authenticator and scan the code below:
                </p>
              </div>

              <div className="text-center mb-3 p-3 bg-light rounded-3 border d-inline-block w-100">
                {/* QR Code image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={setupData.qr_code_data_uri}
                  alt="2FA QR Code"
                  style={{ width: 180, height: 180 }}
                  className="rounded border shadow-xs mb-3 bg-white p-1"
                />

                <div className="mt-1">
                  <small className="text-muted d-block mb-1">Can't scan the QR code? Enter this secret manually:</small>
                  <div className="d-inline-flex align-items-center gap-2 bg-white px-3 py-1.5 rounded border">
                    <span className="font-monospace fw-bold text-primary" style={{ letterSpacing: "0.15em" }}>
                      {setupData.secret}
                    </span>
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 text-decoration-none text-muted"
                      onClick={() => copyToClipboard(setupData.secret, "key")}
                      title="Copy Secret"
                    >
                      {copiedKey ? <IconCheck size={16} className="text-success" /> : <IconCopy size={16} />}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="d-flex justify-content-end">
                <Button
                  variant="primary"
                  className="d-inline-flex align-items-center gap-2"
                  onClick={() => {
                    setSetupError("");
                    setSetupStep(2);
                  }}
                >
                  <span>Next: Backup Recovery Codes</span>
                  <IconArrowRight size={16} />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: Save Backup Codes */}
          {setupStep === 2 && setupData && (
            <div>
              <div className="text-center mb-3">
                <h6 className="fw-bold text-dark mb-1">Save Your Emergency Backup Codes</h6>
                <p className="text-muted small mb-0">
                  If you ever lose access to your authenticator app, these 10 one-time codes will let you log in.
                  Each code can be used only once.
                </p>
              </div>

              <div className="p-3 bg-light border rounded-3 mb-3">
                <Row className="g-2 mb-3">
                  {setupData.backup_codes.map((code, index) => (
                    <Col xs={6} md={6} key={index}>
                      <div className="p-2 bg-white rounded border text-center font-monospace fw-bold text-dark small">
                        <span className="text-muted me-2">{index + 1}.</span>
                        {code}
                      </div>
                    </Col>
                  ))}
                </Row>

                <div className="d-flex justify-content-center gap-2">
                  <Button
                    variant="outline-primary"
                    size="sm"
                    className="d-inline-flex align-items-center gap-1.5"
                    onClick={() => downloadBackupCodes(setupData.backup_codes)}
                  >
                    <IconDownload size={16} />
                    <span>Download (.txt)</span>
                  </Button>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="d-inline-flex align-items-center gap-1.5"
                    onClick={() =>
                      copyToClipboard(setupData.backup_codes.join("\n"), "codes")
                    }
                  >
                    {copiedBackupCodes ? <IconCheck size={16} className="text-success" /> : <IconCopy size={16} />}
                    <span>{copiedBackupCodes ? "Copied!" : "Copy All"}</span>
                  </Button>
                </div>
              </div>

              <Alert variant="warning" className="py-2 px-3 small mb-3 d-flex align-items-center gap-2">
                <IconAlertTriangle size={18} className="flex-shrink-0" />
                <span>Make sure you have saved these codes before proceeding to verification.</span>
              </Alert>

              <div className="d-flex justify-content-between">
                <Button variant="outline-secondary" size="sm" onClick={() => setSetupStep(1)}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  className="d-inline-flex align-items-center gap-2"
                  onClick={() => {
                    setSetupError("");
                    setSetupStep(3);
                  }}
                >
                  <span>Next: Verify & Activate</span>
                  <IconArrowRight size={16} />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: Confirm 6-digit TOTP Code */}
          {setupStep === 3 && (
            <Form onSubmit={handleConfirmSetup}>
              <div className="text-center mb-3">
                <h6 className="fw-bold text-dark mb-1">Verify Authenticator Code</h6>
                <p className="text-muted small mb-0">
                  Enter the 6-digit code currently shown in your authenticator app to confirm configuration:
                </p>
              </div>

              <div className="mb-4 text-center">
                <div style={{ maxWidth: 260, margin: "auto" }}>
                  <Form.Control
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={confirmCode}
                    onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="text-center font-monospace fw-bold fs-3 py-2"
                    style={{ letterSpacing: "0.4em" }}
                    autoFocus
                    required
                  />
                </div>
                <small className="text-muted d-block mt-2">
                  Codes change automatically every 30 seconds.
                </small>
              </div>

              <div className="d-flex justify-content-between">
                <Button variant="outline-secondary" size="sm" onClick={() => setSetupStep(2)}>
                  Back
                </Button>
                <Button
                  variant="success"
                  type="submit"
                  className="fw-bold px-4 d-inline-flex align-items-center gap-2"
                  disabled={isActivating || confirmCode.trim().length !== 6}
                >
                  {isActivating ? (
                    <>
                      <Spinner size="sm" animation="border" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <IconCheck size={18} />
                      <span>Confirm & Activate 2FA</span>
                    </>
                  )}
                </Button>
              </div>
            </Form>
          )}
        </Modal.Body>
      </Modal>

      {/* ────────────────────────────────────────────────────────────────────────
          Disable 2FA Modal
         ──────────────────────────────────────────────────────────────────────── */}
      <Modal show={showDisableModal} onHide={() => setShowDisableModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold text-danger d-flex align-items-center gap-2">
            <IconShieldX size={20} />
            <span>Turn Off Two-Factor Authentication</span>
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleDisable2FA}>
          <Modal.Body className="p-4">
            <Alert variant="warning" className="small py-2 mb-3">
              Turning off 2FA significantly weakens your account security.
            </Alert>
            {disableError && (
              <Alert variant="danger" className="small py-2 mb-3">
                {disableError}
              </Alert>
            )}

            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold text-secondary">
                Confirm your account password
              </Form.Label>
              <InputGroup>
                <Form.Control
                  type={showDisablePassword ? "text" : "password"}
                  placeholder="Enter current password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  required
                  autoFocus
                />
                <Button
                  type="button"
                  variant="outline-secondary"
                  onClick={() => setShowDisablePassword(!showDisablePassword)}
                >
                  {showDisablePassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                </Button>
              </InputGroup>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" size="sm" onClick={() => setShowDisableModal(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" type="submit" disabled={isDisabling || !disablePassword}>
              {isDisabling ? "Disabling..." : "Yes, Turn Off 2FA"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* ────────────────────────────────────────────────────────────────────────
          Regenerate Backup Codes Modal
         ──────────────────────────────────────────────────────────────────────── */}
      <Modal show={showRegenModal} onHide={() => setShowRegenModal(false)} centered size={newCodes ? "lg" : undefined}>
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold d-flex align-items-center gap-2">
            <IconKey size={20} className="text-primary" />
            <span>Regenerate Backup Recovery Codes</span>
          </Modal.Title>
        </Modal.Header>

        {newCodes ? (
          <Modal.Body className="p-4">
            <Alert variant="success" className="small py-2 mb-3">
              10 new backup recovery codes have been generated. Your previous codes are now invalidated.
            </Alert>

            <div className="p-3 bg-light border rounded-3 mb-3">
              <Row className="g-2 mb-3">
                {newCodes.map((code, index) => (
                  <Col xs={6} key={index}>
                    <div className="p-2 bg-white rounded border text-center font-monospace fw-bold text-dark small">
                      <span className="text-muted me-2">{index + 1}.</span>
                      {code}
                    </div>
                  </Col>
                ))}
              </Row>

              <div className="d-flex justify-content-center gap-2">
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={() => downloadBackupCodes(newCodes)}
                >
                  <IconDownload size={16} className="me-1" /> Download (.txt)
                </Button>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => copyToClipboard(newCodes.join("\n"), "codes")}
                >
                  <IconCopy size={16} className="me-1" /> Copy All
                </Button>
              </div>
            </div>

            <div className="text-end">
              <Button variant="primary" size="sm" onClick={() => setShowRegenModal(false)}>
                Done
              </Button>
            </div>
          </Modal.Body>
        ) : (
          <Form onSubmit={handleRegenerateCodes}>
            <Modal.Body className="p-4">
              <p className="text-muted small mb-3">
                Generating new backup codes will immediately invalidate any previously unused codes.
                Please confirm your password to proceed.
              </p>
              {regenError && (
                <Alert variant="danger" className="small py-2 mb-3">
                  {regenError}
                </Alert>
              )}

              <Form.Group className="mb-3">
                <Form.Label className="small fw-semibold text-secondary">
                  Account Password
                </Form.Label>
                <InputGroup>
                  <Form.Control
                    type={showRegenPassword ? "text" : "password"}
                    placeholder="Enter current password"
                    value={regenPassword}
                    onChange={(e) => setRegenPassword(e.target.value)}
                    required
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="outline-secondary"
                    onClick={() => setShowRegenPassword(!showRegenPassword)}
                  >
                    {showRegenPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                  </Button>
                </InputGroup>
              </Form.Group>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" size="sm" onClick={() => setShowRegenModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" disabled={isRegenerating || !regenPassword}>
                {isRegenerating ? "Generating..." : "Regenerate Codes"}
              </Button>
            </Modal.Footer>
          </Form>
        )}
      </Modal>
    </div>
  );
}

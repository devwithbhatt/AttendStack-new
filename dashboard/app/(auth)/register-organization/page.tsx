"use client";

import { FormEvent, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import {
  Alert,
  Badge,
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
import {
  IconCheck,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconKey,
  IconShieldCheck,
  IconBuildingSkyscraper,
} from "@tabler/icons-react";

const apiRoot = (process.env.NEXT_PUBLIC_API_ENDPOINT || "").replace(/\/$/, "");

function OrganizationRegistrationContent() {
  const searchParams = useSearchParams();

  const [form, setForm] = useState({
    organization_name: "",
    full_name: "",
    email: "",
    phone: "",
    website: "",
    location: "",
    industry: "",
    api_key: "",
    source_company_id: "",
    plan_name: "",
    password: "",
    confirm_password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isSimplyJobPrefilled, setIsSimplyJobPrefilled] = useState(false);
  const [simplyJobData, setSimplyJobData] = useState<{
    company_name?: string;
    plan_name?: string;
    api_key?: string;
    email?: string;
  } | null>(null);

  useEffect(() => {
    const payload = searchParams.get("payload");
    const signature = searchParams.get("signature");
    const queryApiKey = searchParams.get("api_key");
    const queryOrgName = searchParams.get("org_name") || searchParams.get("company_name");
    const queryEmail = searchParams.get("email");
    const queryPhone = searchParams.get("phone");
    const queryName = searchParams.get("name") || searchParams.get("full_name");

    if (payload && signature) {
      setVerifying(true);
      axios
        .get(`${apiRoot}/api/v1/accounts/verify-registration-token/`, {
          params: { payload, signature },
        })
        .then((response) => {
          if (response.data && response.data.valid) {
            const data = response.data.data;
            setForm((current) => ({
              ...current,
              organization_name: data.organization_name || current.organization_name,
              full_name: data.full_name || current.full_name,
              email: data.email || current.email,
              phone: data.phone || current.phone,
              website: data.website || current.website,
              location: data.location || current.location,
              industry: data.industry || current.industry,
              api_key: data.api_key || current.api_key,
              source_company_id: data.source_company_id || current.source_company_id,
              plan_name: data.plan_name || current.plan_name,
            }));
            setIsSimplyJobPrefilled(true);
            setSimplyJobData({
              company_name: data.organization_name,
              plan_name: data.plan_name,
              api_key: data.api_key,
              email: data.email,
            });
          }
        })
        .catch((err) => {
          console.warn("Failed to verify SimplyJob token:", err);
          if (queryOrgName || queryEmail) {
            setForm((current) => ({
              ...current,
              organization_name: queryOrgName || current.organization_name,
              full_name: queryName || current.full_name,
              email: queryEmail || current.email,
              phone: queryPhone || current.phone,
              api_key: queryApiKey || current.api_key,
            }));
          }
        })
        .finally(() => {
          setVerifying(false);
        });
    } else if (queryOrgName || queryEmail || queryApiKey) {
      setForm((current) => ({
        ...current,
        organization_name: queryOrgName || current.organization_name,
        full_name: queryName || current.full_name,
        email: queryEmail || current.email,
        phone: queryPhone || current.phone,
        api_key: queryApiKey || current.api_key,
      }));
      if (queryApiKey || queryOrgName) {
        setIsSimplyJobPrefilled(true);
        setSimplyJobData({
          company_name: queryOrgName || "",
          api_key: queryApiKey || "",
          email: queryEmail || "",
        });
      }
    }
  }, [searchParams]);

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await axios.post(
        `${apiRoot}/api/v1/accounts/register-organization/`,
        form
      );
      setInviteCode(response.data.organization.invite_code);
    } catch (requestError) {
      const data = axios.isAxiosError(requestError) ? requestError.response?.data : null;
      const firstError =
        data && typeof data === "object"
          ? Object.values(data)
            .flat()
            .find((value) => typeof value === "string")
          : null;
      setError(
        typeof firstError === "string"
          ? firstError
          : "Please check your details and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(inviteCode);
  };

  return (
    <Container fluid className="min-vh-100 bg-light py-5 d-flex align-items-center">
      <Row className="justify-content-center w-100 mx-0">
        <Col md={10} lg={8} xl={7}>
          <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
            <Card.Body className="p-4 p-md-5">
              <div className="text-center mb-4">
                <Link href="/" aria-label="AttendStack home" className="d-inline-flex mb-3">
                  <Image
                    src="/images/brand/logo/logo.png"
                    alt="AttendStack logo"
                    style={{ height: 48, width: "auto", objectFit: "contain" }}
                  />
                </Link>
                <h1 className="h3 mb-2 fw-bold text-dark">
                  Create your organization workspace
                </h1>
                <p className="text-secondary mb-0">
                  Set up the company owner account and receive a secure code for employee
                  onboarding.
                </p>
              </div>

              {verifying && (
                <div className="text-center py-4">
                  <Spinner animation="border" variant="primary" className="mb-2" />
                  <p className="text-muted small">
                    Connecting to SimplyJob & verifying company credentials...
                  </p>
                </div>
              )}

              {isSimplyJobPrefilled && simplyJobData && !inviteCode && !verifying && (
                <Alert
                  variant="primary"
                  className="border-0 shadow-sm d-flex align-items-start gap-3 p-3 mb-4 rounded-3"
                  style={{ backgroundColor: "#EEF2FF", color: "#312E81" }}
                >
                  <div
                    className="p-2 rounded-circle bg-white text-primary shadow-sm flex-shrink-0"
                    style={{ color: "#4F46E5" }}
                  >
                    <IconBuildingSkyscraper size={22} />
                  </div>
                  <div className="flex-grow-1">
                    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-1">
                      <div className="fw-bold text-dark d-flex align-items-center gap-2">
                        <span>Pre-filled from SimplyJob</span>
                        <Badge bg="success" className="px-2 py-1">
                          <IconCheck size={12} className="me-1" />
                          Verified Partner
                        </Badge>
                      </div>
                      {simplyJobData.plan_name && (
                        <Badge bg="primary" className="px-2 py-1">
                          {simplyJobData.plan_name}
                        </Badge>
                      )}
                    </div>
                    <p className="small mb-2 text-muted">
                      Your company information for{" "}
                      <strong className="text-dark">
                        {simplyJobData.company_name || form.organization_name}
                      </strong>{" "}
                      has been securely imported. Choose your password below to finalize
                      your workspace.
                    </p>
                    {form.api_key && (
                      <div className="d-flex align-items-center gap-2 small font-monospace text-secondary bg-white px-2 py-1 rounded border">
                        <IconKey size={14} className="text-primary" />
                        <span className="text-muted">API Key:</span>
                        <span className="text-dark fw-bold">
                          {form.api_key.slice(0, 16)}...
                        </span>
                      </div>
                    )}
                  </div>
                </Alert>
              )}

              {inviteCode ? (
                <Alert variant="success" className="mb-0 text-center p-4 rounded-3">
                  <IconShieldCheck size={40} className="text-success mb-2" />
                  <h2 className="h4 fw-bold text-success mb-2">
                    Your workspace is ready!
                  </h2>
                  <p className="text-muted mb-3">
                    {isSimplyJobPrefilled ? (
                      <span>
                        Successfully created & linked with{" "}
                        <strong>SimplyJob</strong>! Share this organization code with
                        employees who should join your workspace.
                      </span>
                    ) : (
                      "Share this organization code only with employees who should join your workspace."
                    )}
                  </p>
                  <InputGroup className="mb-4 max-w-sm mx-auto" style={{ maxWidth: 360 }}>
                    <Form.Control
                      value={inviteCode}
                      readOnly
                      className="text-center fw-bold fs-5 bg-white"
                    />
                    <Button
                      variant="success"
                      onClick={copyCode}
                      aria-label="Copy organization code"
                    >
                      <IconCopy size={18} />
                    </Button>
                  </InputGroup>
                  <Link href="/admin/sign-in" className="btn btn-success btn-lg px-4 fw-semibold">
                    Sign in to your company workspace
                  </Link>
                </Alert>
              ) : (
                !verifying && (
                  <Form onSubmit={submit} noValidate>
                    {error && <Alert variant="danger">{error}</Alert>}
                    <Row className="g-3">
                      <Col xs={12}>
                        <Form.Group controlId="organization-name">
                          <Form.Label className="fw-semibold">Organization name</Form.Label>
                          <Form.Control
                            value={form.organization_name}
                            onChange={(e) => update("organization_name", e.target.value)}
                            autoComplete="organization"
                            placeholder="e.g. Acme Corporation"
                            required
                          />
                        </Form.Group>
                      </Col>

                      <Col md={6}>
                        <Form.Group controlId="owner-name">
                          <Form.Label className="fw-semibold">Your full name</Form.Label>
                          <Form.Control
                            value={form.full_name}
                            onChange={(e) => update("full_name", e.target.value)}
                            autoComplete="name"
                            placeholder="First and Last Name"
                            required
                          />
                        </Form.Group>
                      </Col>

                      <Col md={6}>
                        <Form.Group controlId="owner-phone">
                          <Form.Label className="fw-semibold">Phone number</Form.Label>
                          <Form.Control
                            type="tel"
                            value={form.phone}
                            onChange={(e) => update("phone", e.target.value)}
                            autoComplete="tel"
                            placeholder="+91 9876543210"
                            required
                          />
                        </Form.Group>
                      </Col>

                      <Col xs={12}>
                        <Form.Group controlId="owner-email">
                          <Form.Label className="fw-semibold">Work email</Form.Label>
                          <Form.Control
                            type="email"
                            value={form.email}
                            onChange={(e) => update("email", e.target.value)}
                            autoComplete="email"
                            placeholder="admin@yourcompany.com"
                            required
                          />
                        </Form.Group>
                      </Col>

                      {isSimplyJobPrefilled && (
                        <>
                          {form.website && (
                            <Col md={6}>
                              <Form.Group controlId="owner-website">
                                <Form.Label className="text-muted small">Website</Form.Label>
                                <Form.Control
                                  type="url"
                                  value={form.website}
                                  onChange={(e) => update("website", e.target.value)}
                                  placeholder="https://yourcompany.com"
                                />
                              </Form.Group>
                            </Col>
                          )}
                          {form.location && (
                            <Col md={6}>
                              <Form.Group controlId="owner-location">
                                <Form.Label className="text-muted small">Location / City</Form.Label>
                                <Form.Control
                                  value={form.location}
                                  onChange={(e) => update("location", e.target.value)}
                                  placeholder="e.g. Mumbai, Maharashtra"
                                />
                              </Form.Group>
                            </Col>
                          )}
                        </>
                      )}

                      <Col md={6}>
                        <Form.Group controlId="owner-password">
                          <Form.Label className="fw-semibold">Password</Form.Label>
                          <InputGroup>
                            <Form.Control
                              type={showPassword ? "text" : "password"}
                              value={form.password}
                              onChange={(e) => update("password", e.target.value)}
                              autoComplete="new-password"
                              minLength={8}
                              placeholder="Min. 8 characters"
                              required
                            />
                            <Button
                              type="button"
                              variant="outline-secondary"
                              onClick={() => setShowPassword((visible) => !visible)}
                              aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                              {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                            </Button>
                          </InputGroup>
                        </Form.Group>
                      </Col>

                      <Col md={6}>
                        <Form.Group controlId="owner-confirm-password">
                          <Form.Label className="fw-semibold">Confirm password</Form.Label>
                          <Form.Control
                            type={showPassword ? "text" : "password"}
                            value={form.confirm_password}
                            onChange={(e) => update("confirm_password", e.target.value)}
                            autoComplete="new-password"
                            minLength={8}
                            placeholder="Re-enter password"
                            required
                          />
                        </Form.Group>
                      </Col>
                    </Row>

                    <Button
                      type="submit"
                      className="w-100 mt-4 py-2 fw-bold"
                      variant="primary"
                      disabled={loading}
                      style={{ backgroundColor: "#4F46E5", borderColor: "#4F46E5" }}
                    >
                      {loading ? (
                        <>
                          <Spinner size="sm" className="me-2" />
                          Creating workspace…
                        </>
                      ) : isSimplyJobPrefilled ? (
                        "Complete & Connect Organization Workspace"
                      ) : (
                        "Create organization"
                      )}
                    </Button>
                  </Form>
                )
              )}

              {!inviteCode && (
                <p className="text-center text-secondary small mt-4 mb-0">
                  Already have a company account?{" "}
                  <Link href="/admin/sign-in" className="fw-semibold text-primary">
                    Company sign in
                  </Link>
                </p>
              )}
            </Card.Body>
          </Card>
          <p className="text-center text-secondary small mt-3 mb-0">
            Joining an existing company?{" "}
            <Link href="/register" className="text-secondary text-decoration-underline">
              Create an employee account
            </Link>
          </p>
        </Col>
      </Row>
    </Container>
  );
}

export default function OrganizationRegistrationPage() {
  return (
    <Suspense
      fallback={
        <Container className="min-vh-100 d-flex align-items-center justify-content-center">
          <Spinner animation="border" variant="primary" />
        </Container>
      }
    >
      <OrganizationRegistrationContent />
    </Suspense>
  );
}

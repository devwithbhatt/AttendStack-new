"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Alert, Badge, Button, Card, Col, Container, Form, Image, InputGroup, Row, Spinner } from "react-bootstrap";
import {
  IconArrowRight,
  IconBuildingCommunity,
  IconCamera,
  IconCircleCheck,
  IconEye,
  IconEyeOff,
  IconFileDescription,
  IconShieldCheck,
  IconUserCheck,
  IconX,
} from "@tabler/icons-react";

const apiRoot = (process.env.NEXT_PUBLIC_API_ENDPOINT || "").replace(/\/$/, "");

const MB = 1024 * 1024;
const PROFILE_PHOTO_MAX_BYTES = 5 * MB;
const DOCUMENT_MAX_BYTES = 5 * MB;
const TOTAL_UPLOAD_MAX_BYTES = 18 * MB;
const UPLOAD_FIELDS = ["profile_photo", "aadhaar_document", "pan_card_document", "cv_document"] as const;

type EmployeeFormData = {
  organization_code: string;
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  aadhaar_number: string;
  address: string;
  bank_name: string;
  bank_account_number: string;
  ifsc_code: string;
  tax_id: string;
  emergency_contact_name: string;
  emergency_contact_relationship: string;
  emergency_contact_phone: string;
  password: string;
  confirm_password: string;
};

type UploadField = (typeof UPLOAD_FIELDS)[number];
type FormField = keyof EmployeeFormData | UploadField | "upload_total";
type FieldErrors = Partial<Record<FormField, string>>;
type UploadFiles = Record<UploadField, File | null>;

const initialForm: EmployeeFormData = {
  organization_code: "",
  full_name: "",
  email: "",
  phone: "",
  date_of_birth: "",
  aadhaar_number: "",
  address: "",
  bank_name: "",
  bank_account_number: "",
  ifsc_code: "",
  tax_id: "",
  emergency_contact_name: "",
  emergency_contact_relationship: "",
  emergency_contact_phone: "",
  password: "",
  confirm_password: "",
};

const initialFiles: UploadFiles = {
  profile_photo: null,
  aadhaar_document: null,
  pan_card_document: null,
  cv_document: null,
};

const fieldOrder: FormField[] = [
  "organization_code",
  "full_name",
  "email",
  "phone",
  "date_of_birth",
  "address",
  "emergency_contact_name",
  "emergency_contact_relationship",
  "emergency_contact_phone",
  "profile_photo",
  "aadhaar_number",
  "tax_id",
  "bank_name",
  "bank_account_number",
  "ifsc_code",
  "aadhaar_document",
  "pan_card_document",
  "cv_document",
  "upload_total",
  "password",
  "confirm_password",
];

const fieldLabels: Record<FormField, string> = {
  organization_code: "Organization code",
  full_name: "Full name",
  email: "Work email",
  phone: "Phone number",
  date_of_birth: "Date of birth",
  aadhaar_number: "Aadhaar number",
  address: "Address",
  bank_name: "Bank name",
  bank_account_number: "Bank account number",
  ifsc_code: "IFSC code",
  tax_id: "Tax ID / PAN number",
  emergency_contact_name: "Emergency contact name",
  emergency_contact_relationship: "Emergency contact relationship",
  emergency_contact_phone: "Emergency contact phone",
  profile_photo: "Professional profile photo",
  aadhaar_document: "Aadhaar document",
  pan_card_document: "PAN card",
  cv_document: "CV / Resume",
  upload_total: "Uploaded files",
  password: "Password",
  confirm_password: "Confirm password",
};

const allowedFiles: Record<UploadField, { label: string; extensions: string[]; mimeTypes: string[]; maxBytes: number }> = {
  profile_photo: {
    label: "profile photo",
    extensions: [".jpg", ".jpeg", ".png", ".webp"],
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: PROFILE_PHOTO_MAX_BYTES,
  },
  aadhaar_document: {
    label: "Aadhaar document",
    extensions: [".pdf", ".jpg", ".jpeg", ".png", ".webp"],
    mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    maxBytes: DOCUMENT_MAX_BYTES,
  },
  pan_card_document: {
    label: "PAN card",
    extensions: [".pdf", ".jpg", ".jpeg", ".png", ".webp"],
    mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    maxBytes: DOCUMENT_MAX_BYTES,
  },
  cv_document: {
    label: "CV / resume",
    extensions: [".pdf", ".doc", ".docx"],
    mimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    maxBytes: DOCUMENT_MAX_BYTES,
  },
};

const formatBytes = (bytes: number) => `${(bytes / MB).toFixed(bytes % MB === 0 ? 0 : 1)} MB`;

const firstErrorField = (errors: FieldErrors) => fieldOrder.find((field) => Boolean(errors[field]));

const scrollToField = (field?: FormField) => {
  if (!field) return;
  window.setTimeout(() => {
    const target = document.querySelector<HTMLElement>(`[data-field="${field}"]`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusable = target.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        "input:not([type='hidden']), textarea, select"
      );
      if (focusable) {
        focusable.focus({ preventScroll: true });
      }
    }
  }, 50);
};

const errorMessage = (error: unknown) => {
  if (!axios.isAxiosError(error)) return "We could not create your account. Please try again.";
  if (error.response?.status === 413) {
    return `The selected files are too large for upload. Keep all files under ${formatBytes(TOTAL_UPLOAD_MAX_BYTES)} total and try again.`;
  }
  const data = error.response?.data;
  if (typeof data?.detail === "string") return data.detail;
  if (data && typeof data === "object") {
    const first = Object.values(data).flat().find((item) => typeof item === "string");
    if (typeof first === "string") return first;
  }
  return "Please check your details and try again.";
};

const fileText = (file: File | null, fallback: string) => (file ? `${file.name} - ${formatBytes(file.size)}` : fallback);

export default function EmployeeRegistrationPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [files, setFiles] = useState<UploadFiles>(initialFiles);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [success, setSuccess] = useState(false);
  const [organizationName, setOrganizationName] = useState("");
  const [organizationCodeStatus, setOrganizationCodeStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);

  const clearFile = (field: UploadField) => {
    setFiles((current) => ({ ...current, [field]: null }));
    setFieldErrors((current) => ({ ...current, [field]: undefined, upload_total: undefined }));
    if (field === "profile_photo") {
      if (profilePhotoPreview) URL.revokeObjectURL(profilePhotoPreview);
      setProfilePhotoPreview(null);
    }
    const inputEl = document.querySelector<HTMLInputElement>(`[data-field="${field}"] input[type="file"]`);
    if (inputEl) inputEl.value = "";
  };

  const totalUploadSize = useMemo(
    () => UPLOAD_FIELDS.reduce((sum, field) => sum + (files[field]?.size || 0), 0),
    [files],
  );

  const update = (key: keyof EmployeeFormData, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };

  const updateFile = (field: UploadField, file?: File) => {
    const rules = allowedFiles[field];
    setFieldErrors((current) => ({ ...current, [field]: undefined, upload_total: undefined }));

    if (!file) {
      clearFile(field);
      return;
    }

    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    const typeAllowed = rules.mimeTypes.includes(file.type) || rules.extensions.includes(extension);
    if (!typeAllowed) {
      clearFile(field);
      setFieldErrors((current) => ({
        ...current,
        [field]: `Upload a valid ${rules.label} file (${rules.extensions.join(", ")}).`,
      }));
      scrollToField(field);
      return;
    }

    if (file.size > rules.maxBytes) {
      clearFile(field);
      setFieldErrors((current) => ({
        ...current,
        [field]: `${fieldLabels[field]} must be ${formatBytes(rules.maxBytes)} or smaller.`,
      }));
      scrollToField(field);
      return;
    }

    setFiles((current) => ({ ...current, [field]: file }));
    if (field === "profile_photo") {
      if (profilePhotoPreview) URL.revokeObjectURL(profilePhotoPreview);
      setProfilePhotoPreview(URL.createObjectURL(file));
    }
  };

  const removeProfilePhoto = () => updateFile("profile_photo");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlOrgId = params.get("org_id") || params.get("code") || params.get("invite_code");
      if (urlOrgId) {
        setForm((current) => ({ ...current, organization_code: urlOrgId.trim().toUpperCase() }));
      }
    }
  }, []);

  useEffect(() => {
    if (!success) return;
    const redirectTimer = window.setTimeout(() => router.replace("/sign-in"), 3000);
    return () => window.clearTimeout(redirectTimer);
  }, [success, router]);

  useEffect(() => () => {
    if (profilePhotoPreview) URL.revokeObjectURL(profilePhotoPreview);
  }, [profilePhotoPreview]);

  useEffect(() => {
    const code = form.organization_code.trim().toUpperCase();
    const isCompleteCode = /^ORG-[A-HJ-NP-Z2-9]{8}$/.test(code);

    setOrganizationName("");
    if (!isCompleteCode) {
      setOrganizationCodeStatus(code ? "invalid" : "idle");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setOrganizationCodeStatus("checking");
      try {
        const response = await axios.get(`${apiRoot}/api/v1/accounts/organization-code/`, {
          params: { code },
          signal: controller.signal,
        });
        setOrganizationName(response.data.organization_name);
        setOrganizationCodeStatus("valid");
        setFieldErrors((current) => ({ ...current, organization_code: undefined }));
      } catch (requestError) {
        if (!axios.isCancel(requestError) && !controller.signal.aborted) {
          setOrganizationCodeStatus("invalid");
        }
      }
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.organization_code]);

  const validateForm = () => {
    const nextErrors: FieldErrors = {};
    const email = form.email.trim();
    const phone = form.phone.trim();
    const ifscCode = form.ifsc_code.trim().toUpperCase();
    const aadhaarNumber = form.aadhaar_number.trim();
    const emergencyPhone = form.emergency_contact_phone.trim();

    if (!form.organization_code.trim()) nextErrors.organization_code = "Organization code is required.";
    else if (organizationCodeStatus !== "valid") nextErrors.organization_code = "Enter a valid active organization code.";
    if (!form.full_name.trim()) nextErrors.full_name = "Enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = "Enter a valid email address.";
    if (!/^\+?[0-9]{10,15}$/.test(phone)) nextErrors.phone = "Enter a valid 10 to 15 digit phone number.";
    if (aadhaarNumber && !/^[0-9]{12}$/.test(aadhaarNumber)) nextErrors.aadhaar_number = "Enter a valid 12-digit Aadhaar number.";
    if (ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) nextErrors.ifsc_code = "Enter a valid 11-character IFSC code.";
    if (emergencyPhone && !/^\+?[0-9]{10,15}$/.test(emergencyPhone)) {
      nextErrors.emergency_contact_phone = "Enter a valid emergency contact phone number.";
    }
    if (totalUploadSize > TOTAL_UPLOAD_MAX_BYTES) {
      nextErrors.upload_total = `All uploaded files together must be ${formatBytes(TOTAL_UPLOAD_MAX_BYTES)} or smaller.`;
    }
    if (form.password.length < 8) nextErrors.password = "Use at least 8 characters.";
    if (form.confirm_password !== form.password) nextErrors.confirm_password = "Passwords do not match.";

    return nextErrors;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    const nextErrors = validateForm();
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      setError("Please correct the highlighted fields before creating your account.");
      scrollToField(firstErrorField(nextErrors));
      return;
    }

    setLoading(true);
    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (key !== "date_of_birth" || value) payload.append(key, value);
    });
    UPLOAD_FIELDS.forEach((field) => {
      if (files[field]) payload.append(field, files[field] as File);
    });

    try {
      await axios.post(`${apiRoot}/api/v1/accounts/register-employee/`, payload);
      setSuccess(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (requestError) {
      const apiErrors: FieldErrors = {};
      if (axios.isAxiosError(requestError) && requestError.response?.status === 413) {
        apiErrors.upload_total = `The upload is too large. Keep all files under ${formatBytes(TOTAL_UPLOAD_MAX_BYTES)} total.`;
      } else if (axios.isAxiosError(requestError) && requestError.response?.data && typeof requestError.response.data === "object") {
        Object.entries(requestError.response.data).forEach(([key, value]) => {
          const message = Array.isArray(value) && typeof value[0] === "string" ? value[0] : typeof value === "string" ? value : "";
          if (message && fieldOrder.includes(key as FormField)) apiErrors[key as FormField] = message;
        });
      }
      setFieldErrors(apiErrors);
      setError(errorMessage(requestError));
      scrollToField(firstErrorField(apiErrors));
    } finally {
      setLoading(false);
    }
  };

  const organizationInvalid =
    Boolean(fieldErrors.organization_code) || (organizationCodeStatus === "invalid" && form.organization_code.length > 0);

  return (
    <Container fluid className="min-vh-100 py-4 py-md-5 d-flex align-items-center bg-light">
      <Row className="justify-content-center w-100 mx-0">
        <Col lg={9} xl={8}>
          <Card className="border-0 shadow-sm rounded-3 overflow-hidden">
            <Card.Body className="p-4 p-md-5">
              <div className="text-center mb-4">
                <Link href="/" aria-label="AttendStack home" className="d-inline-flex mb-3">
                  <Image
                    src="/images/brand/logo/logo.png"
                    alt="AttendStack logo"
                    style={{ height: 48, width: "auto", objectFit: "contain" }}
                  />
                </Link>
                <h1 className="h3 mb-1">{success ? "Employee Account Created" : "Create Your Employee Account"}</h1>
                <p className="text-secondary mb-0">
                  {success
                    ? "Your details have been saved and your workspace access is ready."
                    : "Join your team with the organization code shared by your employer."}
                </p>
              </div>

              {success ? (
                <div className="mx-auto" style={{ maxWidth: 680 }}>
                  <div className="border rounded-3 bg-body-tertiary p-3 p-md-4 mb-4">
                    <div className="d-flex flex-column flex-md-row gap-3 align-items-md-start">
                      <span className="d-inline-flex align-items-center justify-content-center rounded-circle bg-success text-white flex-shrink-0" style={{ width: 44, height: 44 }}>
                        <IconCircleCheck size={24} />
                      </span>
                      <div>
                        <Badge bg="success-subtle" text="success" className="mb-2">Registration complete</Badge>
                        <h2 className="h4 fw-semibold mb-2">You can now sign in to AttendStack</h2>
                        <p className="text-secondary mb-0">
                          Use your work email and password to access your employee dashboard. Your organization connection and submitted profile details are already linked to your account.
                        </p>
                      </div>
                    </div>
                  </div>

                  <Row className="g-3 mb-4">
                    <Col md={4}>
                      <div className="h-100 border rounded-3 p-3">
                        <IconBuildingCommunity size={22} className="text-primary mb-2" />
                        <div className="fw-semibold">Workspace linked</div>
                        <p className="small text-secondary mb-0">{organizationName || "Your company workspace"} is connected to this account.</p>
                      </div>
                    </Col>
                    <Col md={4}>
                      <div className="h-100 border rounded-3 p-3">
                        <IconShieldCheck size={22} className="text-primary mb-2" />
                        <div className="fw-semibold">Profile submitted</div>
                        <p className="small text-secondary mb-0">Your onboarding details are ready for company review.</p>
                      </div>
                    </Col>
                    <Col md={4}>
                      <div className="h-100 border rounded-3 p-3">
                        <IconUserCheck size={22} className="text-primary mb-2" />
                        <div className="fw-semibold">Next step</div>
                        <p className="small text-secondary mb-0">Sign in and open your employee dashboard.</p>
                      </div>
                    </Col>
                  </Row>

                  <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3 border-top pt-4">
                    <small className="text-secondary">Redirecting to sign in shortly.</small>
                    <Link href="/sign-in" className="btn btn-primary px-4">
                      Sign in to dashboard <IconArrowRight size={17} className="ms-1" />
                    </Link>
                  </div>
                </div>
              ) : (
                <Form onSubmit={submit} noValidate>
                  {error && (
                    <Alert variant="danger" className="mb-4 border-0">
                      <strong>Please review your form.</strong> {error}
                    </Alert>
                  )}

                  <div className="rounded-3 border bg-body-tertiary p-3 mb-4 d-flex gap-3">
                    <IconBuildingCommunity className="text-primary flex-shrink-0 mt-1" size={21} />
                    <div>
                      <strong>Organization code required</strong>
                      <p className="small text-secondary mb-0">Ask your HR or organization owner for the current code.</p>
                    </div>
                  </div>

                  <div className="d-flex align-items-center justify-content-between gap-3 mb-3">
                    <h2 className="h6 mb-0">Company and personal details</h2>
                    <Badge bg="secondary-subtle" text="secondary">Required</Badge>
                  </div>
                  <Row className="g-3">
                    <Col md={6}>
                      <Form.Group controlId="organization-code" data-field="organization_code">
                        <Form.Label>Organization code</Form.Label>
                        <Form.Control
                          value={form.organization_code}
                          onChange={(event) => update("organization_code", event.target.value.toUpperCase())}
                          placeholder="ORG-XXXXXXXX"
                          required
                          autoCapitalize="characters"
                          isValid={organizationCodeStatus === "valid"}
                          isInvalid={organizationInvalid}
                        />
                        <Form.Text className={organizationCodeStatus === "valid" ? "text-success" : undefined}>
                          {organizationCodeStatus === "checking"
                            ? "Verifying organization..."
                            : organizationCodeStatus === "valid"
                              ? "Organization verified"
                              : ""}
                        </Form.Text>
                        <Form.Control.Feedback type="invalid">
                          {fieldErrors.organization_code || "Enter a valid active organization code."}
                        </Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="organization-name">
                        <Form.Label>Company name</Form.Label>
                        <Form.Control
                          value={organizationName}
                          readOnly
                          placeholder="Appears after your code is verified"
                          isValid={organizationCodeStatus === "valid"}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="full-name" data-field="full_name">
                        <Form.Label>Full name</Form.Label>
                        <Form.Control
                          value={form.full_name}
                          onChange={(event) => update("full_name", event.target.value)}
                          placeholder="e.g., Priya Sharma"
                          autoComplete="name"
                          required
                          isInvalid={Boolean(fieldErrors.full_name)}
                        />
                        <Form.Control.Feedback type="invalid">{fieldErrors.full_name}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="email" data-field="email">
                        <Form.Label>Work email <span className="text-secondary fw-normal">(used to sign in)</span></Form.Label>
                        <Form.Control
                          type="email"
                          value={form.email}
                          onChange={(event) => update("email", event.target.value)}
                          placeholder="you@company.com"
                          autoComplete="email"
                          required
                          isInvalid={Boolean(fieldErrors.email)}
                        />
                        <Form.Control.Feedback type="invalid">{fieldErrors.email}</Form.Control.Feedback>
                        <Form.Text>Use an email address you can access.</Form.Text>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="phone" data-field="phone">
                        <Form.Label>Phone number</Form.Label>
                        <Form.Control
                          type="tel"
                          value={form.phone}
                          onChange={(event) => update("phone", event.target.value)}
                          placeholder="9876543210"
                          autoComplete="tel"
                          required
                          isInvalid={Boolean(fieldErrors.phone)}
                        />
                        <Form.Control.Feedback type="invalid">{fieldErrors.phone}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="dob" data-field="date_of_birth">
                        <Form.Label>Date of birth <span className="text-secondary">(optional)</span></Form.Label>
                        <Form.Control type="date" value={form.date_of_birth} onChange={(event) => update("date_of_birth", event.target.value)} autoComplete="bday" />
                      </Form.Group>
                    </Col>
                    <Col xs={12}>
                      <Form.Group controlId="address" data-field="address">
                        <Form.Label>Address <span className="text-secondary">(optional)</span></Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={2}
                          value={form.address}
                          onChange={(event) => update("address", event.target.value)}
                          placeholder="House number, street, city, state, PIN code"
                          autoComplete="street-address"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <h2 className="h6 mt-4 mb-3">Emergency contact <span className="text-secondary fw-normal">(optional)</span></h2>
                  <Row className="g-3">
                    <Col md={4}>
                      <Form.Group data-field="emergency_contact_name">
                        <Form.Label className="visually-hidden">Emergency contact name</Form.Label>
                        <Form.Control aria-label="Emergency contact name" placeholder="Full name" value={form.emergency_contact_name} onChange={(event) => update("emergency_contact_name", event.target.value)} />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group data-field="emergency_contact_relationship">
                        <Form.Label className="visually-hidden">Relationship</Form.Label>
                        <Form.Control aria-label="Relationship" placeholder="Relationship" value={form.emergency_contact_relationship} onChange={(event) => update("emergency_contact_relationship", event.target.value)} />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group data-field="emergency_contact_phone">
                        <Form.Label className="visually-hidden">Emergency contact phone</Form.Label>
                        <Form.Control
                          type="tel"
                          aria-label="Emergency contact phone"
                          placeholder="Phone number"
                          value={form.emergency_contact_phone}
                          onChange={(event) => update("emergency_contact_phone", event.target.value)}
                          isInvalid={Boolean(fieldErrors.emergency_contact_phone)}
                        />
                        <Form.Control.Feedback type="invalid">{fieldErrors.emergency_contact_phone}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                  </Row>

                  <Form.Group className="mt-4" controlId="profile-photo" data-field="profile_photo">
                    <div className="d-flex align-items-center justify-content-between mb-1">
                      <Form.Label className="mb-0">Professional profile photo <span className="text-secondary">(recommended)</span></Form.Label>
                      {files.profile_photo && (
                        <Button type="button" variant="link" size="sm" className="text-danger p-0 text-decoration-none border-0 small" onClick={() => clearFile("profile_photo")}>
                          <IconX size={15} className="me-1" />Clear photo
                        </Button>
                      )}
                    </div>
                    <div className="d-flex flex-column flex-sm-row align-items-sm-center gap-3 rounded-3 border bg-body-tertiary p-3">
                      {profilePhotoPreview ? (
                        <img src={profilePhotoPreview} alt="Profile photo preview" className="rounded-circle border object-fit-cover" width={72} height={72} />
                      ) : (
                        <span className="d-inline-flex align-items-center justify-content-center rounded-circle bg-primary-subtle text-primary" style={{ width: 72, height: 72 }}>
                          <IconCamera size={27} />
                        </span>
                      )}
                      <div className="flex-grow-1">
                        <Form.Control
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(event) => updateFile("profile_photo", (event.currentTarget as HTMLInputElement).files?.[0])}
                          isInvalid={Boolean(fieldErrors.profile_photo)}
                        />
                        <div className="d-flex align-items-center justify-content-between mt-1">
                          <Form.Text className={files.profile_photo ? "text-success fw-medium" : undefined}>
                            {fileText(files.profile_photo, "JPEG, PNG, or WebP; maximum 5 MB.")}
                          </Form.Text>
                          {files.profile_photo && <Badge bg="success-subtle" text="success" className="ms-1">Selected</Badge>}
                        </div>
                        <Form.Control.Feedback type="invalid">{fieldErrors.profile_photo}</Form.Control.Feedback>
                      </div>
                    </div>
                  </Form.Group>

                  <h2 className="h6 mt-4 mb-2">Identity and bank details</h2>
                  <p className="small text-secondary mb-3">These optional details help your company complete payroll and compliance setup.</p>
                  <Row className="g-3">
                    <Col md={6}>
                      <Form.Group controlId="aadhaar-number" data-field="aadhaar_number">
                        <Form.Label>Aadhaar number</Form.Label>
                        <Form.Control
                          inputMode="numeric"
                          value={form.aadhaar_number}
                          onChange={(event) => update("aadhaar_number", event.target.value.replace(/\D/g, "").slice(0, 12))}
                          placeholder="12-digit Aadhaar number"
                          maxLength={12}
                          isInvalid={Boolean(fieldErrors.aadhaar_number)}
                        />
                        <Form.Control.Feedback type="invalid">{fieldErrors.aadhaar_number}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="tax-id" data-field="tax_id">
                        <Form.Label>Tax ID / PAN number</Form.Label>
                        <Form.Control value={form.tax_id} onChange={(event) => update("tax_id", event.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={20} isInvalid={Boolean(fieldErrors.tax_id)} />
                        <Form.Control.Feedback type="invalid">{fieldErrors.tax_id}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="bank-name" data-field="bank_name">
                        <Form.Label>Bank name</Form.Label>
                        <Form.Control value={form.bank_name} onChange={(event) => update("bank_name", event.target.value)} placeholder="e.g., HDFC Bank" autoComplete="off" isInvalid={Boolean(fieldErrors.bank_name)} />
                        <Form.Control.Feedback type="invalid">{fieldErrors.bank_name}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="bank-account-number" data-field="bank_account_number">
                        <Form.Label>Bank account number</Form.Label>
                        <Form.Control value={form.bank_account_number} onChange={(event) => update("bank_account_number", event.target.value.replace(/\s/g, ""))} placeholder="Enter your account number" inputMode="numeric" autoComplete="off" isInvalid={Boolean(fieldErrors.bank_account_number)} />
                        <Form.Control.Feedback type="invalid">{fieldErrors.bank_account_number}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="ifsc-code" data-field="ifsc_code">
                        <Form.Label>IFSC code</Form.Label>
                        <Form.Control value={form.ifsc_code} onChange={(event) => update("ifsc_code", event.target.value.toUpperCase().replace(/\s/g, ""))} placeholder="HDFC0001234" maxLength={11} autoCapitalize="characters" isInvalid={Boolean(fieldErrors.ifsc_code)} />
                        <Form.Control.Feedback type="invalid">{fieldErrors.ifsc_code}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                  </Row>

                  <div className="d-flex flex-column flex-sm-row align-items-sm-end justify-content-between gap-2 mt-4 mb-3">
                    <div>
                      <h2 className="h6 mb-1">Employee documents</h2>
                      <p className="small text-secondary mb-0">Upload only clear copies. Each file can be up to 5 MB.</p>
                    </div>
                    <small className={fieldErrors.upload_total ? "text-danger" : "text-secondary"} data-field="upload_total">
                      Total selected: {formatBytes(totalUploadSize)} / {formatBytes(TOTAL_UPLOAD_MAX_BYTES)}
                    </small>
                  </div>
                  {fieldErrors.upload_total && <div className="small text-danger mb-2">{fieldErrors.upload_total}</div>}
                  <Row className="g-3">
                    <Col md={4}>
                      <Form.Group controlId="aadhaar-document" data-field="aadhaar_document">
                        <div className="d-flex align-items-center justify-content-between mb-1">
                          <Form.Label className="mb-0"><IconFileDescription size={16} className="me-1" />Aadhaar document</Form.Label>
                          {files.aadhaar_document && (
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="text-danger p-0 text-decoration-none border-0 small"
                              onClick={() => clearFile("aadhaar_document")}
                            >
                              <IconX size={15} className="me-1" />Clear
                            </Button>
                          )}
                        </div>
                        <Form.Control type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(event) => updateFile("aadhaar_document", (event.currentTarget as HTMLInputElement).files?.[0])} isInvalid={Boolean(fieldErrors.aadhaar_document)} />
                        <div className="d-flex align-items-center justify-content-between mt-1">
                          <Form.Text className={files.aadhaar_document ? "text-success fw-medium" : undefined}>
                            {fileText(files.aadhaar_document, "PDF, JPG, PNG, or WebP")}
                          </Form.Text>
                          {files.aadhaar_document && <Badge bg="success-subtle" text="success" className="ms-1">Selected</Badge>}
                        </div>
                        <Form.Control.Feedback type="invalid">{fieldErrors.aadhaar_document}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group controlId="pan-card-document" data-field="pan_card_document">
                        <div className="d-flex align-items-center justify-content-between mb-1">
                          <Form.Label className="mb-0"><IconFileDescription size={16} className="me-1" />PAN card</Form.Label>
                          {files.pan_card_document && (
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="text-danger p-0 text-decoration-none border-0 small"
                              onClick={() => clearFile("pan_card_document")}
                            >
                              <IconX size={15} className="me-1" />Clear
                            </Button>
                          )}
                        </div>
                        <Form.Control type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(event) => updateFile("pan_card_document", (event.currentTarget as HTMLInputElement).files?.[0])} isInvalid={Boolean(fieldErrors.pan_card_document)} />
                        <div className="d-flex align-items-center justify-content-between mt-1">
                          <Form.Text className={files.pan_card_document ? "text-success fw-medium" : undefined}>
                            {fileText(files.pan_card_document, "PDF, JPG, PNG, or WebP")}
                          </Form.Text>
                          {files.pan_card_document && <Badge bg="success-subtle" text="success" className="ms-1">Selected</Badge>}
                        </div>
                        <Form.Control.Feedback type="invalid">{fieldErrors.pan_card_document}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group controlId="cv-document" data-field="cv_document">
                        <div className="d-flex align-items-center justify-content-between mb-1">
                          <Form.Label className="mb-0"><IconFileDescription size={16} className="me-1" />CV / Resume</Form.Label>
                          {files.cv_document && (
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="text-danger p-0 text-decoration-none border-0 small"
                              onClick={() => clearFile("cv_document")}
                            >
                              <IconX size={15} className="me-1" />Clear
                            </Button>
                          )}
                        </div>
                        <Form.Control type="file" accept=".pdf,.doc,.docx" onChange={(event) => updateFile("cv_document", (event.currentTarget as HTMLInputElement).files?.[0])} isInvalid={Boolean(fieldErrors.cv_document)} />
                        <div className="d-flex align-items-center justify-content-between mt-1">
                          <Form.Text className={files.cv_document ? "text-success fw-medium" : undefined}>
                            {fileText(files.cv_document, "PDF, DOC, or DOCX")}
                          </Form.Text>
                          {files.cv_document && <Badge bg="success-subtle" text="success" className="ms-1">Selected</Badge>}
                        </div>
                        <Form.Control.Feedback type="invalid">{fieldErrors.cv_document}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                  </Row>

                  <h2 className="h6 mt-4 mb-3">Secure your account</h2>
                  <Row className="g-3">
                    <Col md={6}>
                      <Form.Group controlId="password" data-field="password">
                        <Form.Label>Password</Form.Label>
                        <InputGroup hasValidation>
                          <Form.Control
                            type={showPassword ? "text" : "password"}
                            value={form.password}
                            onChange={(event) => update("password", event.target.value)}
                            placeholder="At least 8 characters"
                            autoComplete="new-password"
                            minLength={8}
                            required
                            isInvalid={Boolean(fieldErrors.password)}
                          />
                          <Button type="button" variant="outline-secondary" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>
                            {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                          </Button>
                          <Form.Control.Feedback type="invalid">{fieldErrors.password}</Form.Control.Feedback>
                        </InputGroup>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="confirm-password" data-field="confirm_password">
                        <Form.Label>Confirm password</Form.Label>
                        <Form.Control
                          type={showPassword ? "text" : "password"}
                          value={form.confirm_password}
                          onChange={(event) => update("confirm_password", event.target.value)}
                          placeholder="Re-enter your password"
                          autoComplete="new-password"
                          minLength={8}
                          required
                          isInvalid={Boolean(fieldErrors.confirm_password)}
                        />
                        <Form.Control.Feedback type="invalid">{fieldErrors.confirm_password}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                  </Row>

                  <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3 mt-4 pt-3 border-top">
                    <small className="text-secondary d-flex align-items-center gap-1">
                      <IconShieldCheck size={15} /> Your details are sent securely to your company workspace.
                    </small>
                    <Button type="submit" disabled={loading} className="px-4">
                      {loading ? <><Spinner size="sm" className="me-2" />Creating account...</> : "Create employee account"}
                    </Button>
                  </div>
                </Form>
              )}
              {!success && <p className="text-center text-secondary small mt-4 mb-0">Already have an account? <Link href="/sign-in">Sign in</Link></p>}
            </Card.Body>
          </Card>
          <p className="text-center text-secondary small mt-3 mb-0">Setting up a company? <Link href="/register-organization">Create an organization workspace</Link></p>
        </Col>
      </Row>
    </Container>
  );
}

"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Step1_PersonalInfo from "./steps/Step1_PersonalInfo";
import Step2_EmploymentDetails from "./steps/Step2_EmploymentDetails";
import Step3_SalaryAndBank from "./steps/Step3_SalaryAndBank";
import Step4_ReviewAndSubmit from "./steps/Step4_ReviewAndSubmit";

export type EmployeeFormData = {
  id?: string;
  profilePhoto: File | null;
  profilePhotoUrl?: string | null;
  aadhaarDocument: File | null;
  aadhaarDocumentUrl?: string | null;
  panCardDocument: File | null;
  panCardDocumentUrl?: string | null;
  cvDocument: File | null;
  cvDocumentUrl?: string | null;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  aadhaarNumber: string;
  address: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  employeeId: string;
  joiningDate: string;
  department: string;
  designation: string;
  employmentType: string;
  reportingManager: string;
  annualSalary: string;
  payFrequency: string;
  bankName: string;
  bankAccountNumber: string;
  ifscCode: string;
  taxId: string;
  overrideIncrementPolicy?: boolean;
  customIncrementMonths?: string;
  customIncrementType?: string;
  customIncrementValue?: string;
  incrementStatus?: string;
};

export type EmployeeFormErrors = Partial<Record<keyof EmployeeFormData, string>>;

export const initialEmployeeFormData: EmployeeFormData = {
  profilePhoto: null,
  aadhaarDocument: null,
  panCardDocument: null,
  cvDocument: null,
  fullName: "",
  email: "",
  phone: "",
  dateOfBirth: "",
  aadhaarNumber: "",
  address: "",
  emergencyContactName: "",
  emergencyContactRelationship: "",
  emergencyContactPhone: "",
  employeeId: "",
  joiningDate: "",
  department: "",
  designation: "",
  employmentType: "",
  reportingManager: "",
  annualSalary: "",
  payFrequency: "",
  bankName: "",
  bankAccountNumber: "",
  ifscCode: "",
  taxId: "",
  overrideIncrementPolicy: false,
  customIncrementMonths: "12",
  customIncrementType: "PERCENTAGE",
  customIncrementValue: "10",
  incrementStatus: "ENABLED",
};

const API_URL = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/employees/`;
const safeTrim = (value: unknown) => String(value ?? "").trim();

const StepIndicator = ({ currentStep }: { currentStep: number }) => {
  const steps = ["Personal Info", "Employment Details", "Salary & Bank", "Review & Submit"];

  return (
    <div className="d-flex justify-content-between align-items-center mb-4">
      {steps.map((step, index) => (
        <div key={step} className="text-center">
          <div
            className={`rounded-circle d-flex align-items-center justify-content-center mx-auto ${
              currentStep >= index + 1 ? "bg-primary text-white" : "bg-light"
            }`}
            style={{ width: "40px", height: "40px" }}
          >
            {index + 1}
          </div>
          <p className="mt-2 mb-0">{step}</p>
        </div>
      ))}
    </div>
  );
};

type EmployeeFormWizardProps = {
  mode?: "add" | "edit";
  initialData?: Partial<EmployeeFormData>;
  employeeId?: string;
  onSave?: () => void;
  onCancel?: () => void;
};

const EmployeeFormWizard = ({ mode = "add", initialData, employeeId, onSave, onCancel }: EmployeeFormWizardProps) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<EmployeeFormData>({ ...initialEmployeeFormData, ...initialData });
  const [errors, setErrors] = useState<EmployeeFormErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (initialData) {
      setFormData({ ...initialEmployeeFormData, ...initialData });
    }
  }, [initialData]);

  const updateField = <TKey extends keyof EmployeeFormData>(
    field: TKey,
    value: EmployeeFormData[TKey]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validateAll = () => {
    const combined: EmployeeFormErrors = {};
    let firstInvalidStep = 0;
    [1, 2, 3].forEach((step) => {
      const stepErrors = collectStepErrors(step);
      if (!firstInvalidStep && Object.keys(stepErrors).length > 0) {
        firstInvalidStep = step;
      }
      Object.assign(combined, stepErrors);
    });
    setErrors(combined);
    if (firstInvalidStep) {
      setCurrentStep(firstInvalidStep);
    }
    return Object.keys(combined).length === 0;
  };

  const collectStepErrors = (step: number) => {
    const nextErrors: EmployeeFormErrors = {};
    const required = (field: keyof EmployeeFormData, label: string) => {
      if (!String(formData[field] ?? "").trim()) {
        nextErrors[field] = `${label} is required.`;
      }
    };

    if (step === 1) {
      required("fullName", "Full name");
      required("email", "Email address");
      required("phone", "Phone number");
      required("aadhaarNumber", "Aadhaar number");
      if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        nextErrors.email = "Enter a valid email address.";
      }
      if (formData.phone && !/^\+?[0-9]{10,15}$/.test(formData.phone)) {
        nextErrors.phone = "Enter a valid phone number.";
      }
      if (formData.aadhaarNumber && !/^[0-9]{12}$/.test(formData.aadhaarNumber)) {
        nextErrors.aadhaarNumber = "Aadhaar number must be 12 digits.";
      }
    }

    if (step === 2) {
      required("joiningDate", "Joining date");
      required("department", "Department");
      required("designation", "Designation");
      required("employmentType", "Employment type");
    }

    if (step === 3) {
      required("annualSalary", "Annual salary");
      required("payFrequency", "Pay frequency");
      required("bankName", "Bank name");
      required("bankAccountNumber", "Bank account number");
      required("ifscCode", "IFSC code");
      required("taxId", "Tax ID / PAN");
      if (formData.annualSalary && Number(formData.annualSalary) <= 0) {
        nextErrors.annualSalary = "Annual salary must be greater than zero.";
      }
      if (formData.ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(formData.ifscCode)) {
        nextErrors.ifscCode = "Enter a valid 11-character IFSC code.";
      }
    }

    return nextErrors;
  };

  const handleNext = () => {
    const stepErrors = collectStepErrors(currentStep);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length === 0) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => setCurrentStep((prev) => prev - 1);

  const payload = useMemo(() => {
    const body = new FormData();
    const fields: Record<string, string> = {
      employee_id: safeTrim(formData.employeeId),
      full_name: safeTrim(formData.fullName),
      email: safeTrim(formData.email),
      phone: safeTrim(formData.phone),
      date_of_birth: safeTrim(formData.dateOfBirth),
      aadhaar_number: safeTrim(formData.aadhaarNumber),
      address: safeTrim(formData.address),
      emergency_contact_name: safeTrim(formData.emergencyContactName),
      emergency_contact_relationship: safeTrim(formData.emergencyContactRelationship),
      emergency_contact_phone: safeTrim(formData.emergencyContactPhone),
      joining_date: safeTrim(formData.joiningDate),
      department: safeTrim(formData.department),
      designation: safeTrim(formData.designation),
      employment_type: safeTrim(formData.employmentType),
      reporting_manager: safeTrim(formData.reportingManager),
      annual_salary: safeTrim(formData.annualSalary),
      pay_frequency: safeTrim(formData.payFrequency),
      bank_name: safeTrim(formData.bankName),
      bank_account_number: safeTrim(formData.bankAccountNumber),
      tax_id: safeTrim(formData.taxId).toUpperCase(),
      override_increment_policy: String(Boolean(formData.overrideIncrementPolicy)),
      custom_increment_months: safeTrim(formData.customIncrementMonths),
      custom_increment_type: safeTrim(formData.customIncrementType),
      custom_increment_value: safeTrim(formData.customIncrementValue),
      increment_status: safeTrim(formData.incrementStatus || "ENABLED"),
    };

    Object.entries(fields).forEach(([key, value]) => {
      if (value) body.append(key, value);
    });
    if (formData.profilePhoto instanceof File) body.append("profile_photo", formData.profilePhoto);
    if (formData.aadhaarDocument instanceof File) body.append("aadhaar_document", formData.aadhaarDocument);
    if (formData.panCardDocument instanceof File) body.append("pan_card_document", formData.panCardDocument);
    if (formData.cvDocument instanceof File) body.append("cv_document", formData.cvDocument);
    return body;
  }, [formData]);

  const handleSubmit = async () => {
    if (!validateAll()) {
      return;
    }

    setSubmitError("");
    setIsSubmitting(true);

    try {
      const token = localStorage.getItem("authToken");
      const url = mode === "edit" ? `${API_URL}${formData.id}/` : API_URL;
      const method = mode === "edit" ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: payload,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const firstError = errorBody
          ? Object.values(errorBody).flat().join(" ")
          : "Unable to save employee. Please try again.";
        throw new Error(firstError);
      }

      if (onSave) {
        onSave();
      } else {
        router.push("/employees");
        router.refresh();
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to save employee.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-body p-4">
        <StepIndicator currentStep={currentStep} />
        <hr className="mb-4" />

        {submitError && <div className="alert alert-danger">{submitError}</div>}

        {currentStep === 1 && <Step1_PersonalInfo data={formData} errors={errors} onChange={updateField} />}
        {currentStep === 2 && <Step2_EmploymentDetails data={formData} errors={errors} onChange={updateField} />}
        {currentStep === 3 && <Step3_SalaryAndBank data={formData} errors={errors} onChange={updateField} />}
        {currentStep === 4 && <Step4_ReviewAndSubmit data={formData} />}

        <div className="d-flex justify-content-between mt-4">
          <div className="d-flex gap-2">
            {currentStep > 1 && (
              <button className="btn btn-secondary" onClick={handleBack} disabled={isSubmitting}>
                Back
              </button>
            )}
            {mode === "edit" && onCancel && (
              <button className="btn btn-outline-secondary" onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </button>
            )}
          </div>
          {currentStep < 4 ? (
            <button className="btn btn-primary" onClick={handleNext}>
              Next
            </button>
          ) : (
            <button className="btn btn-success" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Submit"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeeFormWizard;

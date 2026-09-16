"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Container, Card, Spinner, Alert } from "react-bootstrap";
import axios from "axios";

function SSOContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const payload = searchParams.get("payload");
    const signature = searchParams.get("signature");

    if (!payload || !signature) {
      setError("Invalid or incomplete SSO navigation link.");
      return;
    }

    const performSSO = async () => {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_ENDPOINT || "http://localhost:8000";
        const response = await axios.post(`${apiBase}/api/v1/accounts/sso-login/`, {
          payload,
          signature,
        });

        if (response.data && response.data.access) {
          localStorage.setItem("authToken", response.data.access);
          localStorage.setItem("refreshToken", response.data.refresh);
          localStorage.setItem("user", JSON.stringify(response.data.user));
          if (response.data.organization) {
            localStorage.setItem("organization", JSON.stringify(response.data.organization));
          }

          const role = response.data.user?.role;
          router.push(role === "EMPLOYEE" ? "/employee-dashboard" : "/");
        } else {
          setError("SSO Authentication failed. Please log in directly.");
        }
      } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response?.data?.detail) {
          setError(err.response.data.detail);
        } else {
          setError("Failed to complete SSO session setup.");
        }
      }
    };

    performSSO();
  }, [searchParams, router]);

  return (
    <Card className="p-4 shadow-sm text-center" style={{ maxWidth: "420px", width: "100%" }}>
      <Card.Body>
        <h3 className="fw-bold mb-3">Connecting to AttendStack</h3>
        {error ? (
          <Alert variant="danger" className="mb-3">
            {error}
          </Alert>
        ) : (
          <>
            <Spinner animation="border" variant="primary" className="mb-3" />
            <p className="text-muted">Authenticating your SimplyJob workspace...</p>
          </>
        )}
      </Card.Body>
    </Card>
  );
}

export default function SSOPage() {
  return (
    <Container className="min-vh-100 d-flex align-items-center justify-content-center">
      <Suspense fallback={<Spinner animation="border" variant="primary" />}>
        <SSOContent />
      </Suspense>
    </Container>
  );
}

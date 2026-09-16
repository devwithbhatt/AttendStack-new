"use client";

import React, { useState, useEffect } from "react";
import { Card, Spinner, Alert } from "react-bootstrap";
import { IconNotes } from "@tabler/icons-react";

const RulebookPage = () => {
  const [rules, setRules] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchRules = async () => {
      const token = localStorage.getItem("authToken");
      if (!token) {
        setError("You are not authorized to view this page. Please log in.");
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/settings/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setRules(data.attendance_rules || "<p>No rules have been defined yet.</p>");
        } else {
          throw new Error("Failed to load the company rulebook.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unknown error occurred.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchRules();
  }, []);

  return (
    <div className="py-4">
      <div className="mb-4">
        <h2 className="fw-bold">Company Rulebook</h2>
        <p className="text-secondary">
          Official guidelines for attendance, conduct, and company policies.
        </p>
      </div>

      <Card className="border-0 shadow-sm">
        <Card.Header className="bg-white p-3">
          <h5 className="mb-0 d-flex align-items-center gap-2">
            <IconNotes size={20} />
            Attendance & Conduct Policies
          </h5>
        </Card.Header>
        <Card.Body className="p-4">
          {isLoading ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="primary" />
              <p className="mt-2 text-secondary">Loading Rules...</p>
            </div>
          ) : error ? (
            <Alert variant="danger">{error}</Alert>
          ) : (
            <div
              className="prose"
              dangerouslySetInnerHTML={{ __html: rules }}
            />
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default RulebookPage;
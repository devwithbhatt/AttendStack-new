"use client";

import { useEffect, useState } from "react";
import { CurrentEmployee } from "./types";

const API_URL = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/employees/me/`;

export const useCurrentEmployee = () => {
  const [employee, setEmployee] = useState<CurrentEmployee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadEmployee = async () => {
    setIsLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("authToken");
      if (!token) {
        throw new Error("Please sign in to view your employee dashboard.");
      }

      const response = await fetch(API_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 404) {
        throw new Error("No employee profile is linked to this login account.");
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error("Your session has expired. Please sign in again.");
      }
      if (!response.ok) {
        throw new Error("Unable to load your employee profile.");
      }

      setEmployee((await response.json()) as CurrentEmployee);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load your employee profile.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEmployee();
  }, []);

  return { employee, isLoading, error, refetch: loadEmployee };
};
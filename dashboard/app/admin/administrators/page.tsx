"use client";
import { Card, Table, Spinner, Alert } from "react-bootstrap";
import { useEffect, useState } from "react";
import axios from "axios";

interface Administrator {
  id: number;
  full_name: string;
  email: string;
  organization_name: string;
}

const AdministratorsPage = () => {
  const [administrators, setAdministrators] = useState<Administrator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAdministrators = async () => {
      try {
        const token = localStorage.getItem("authToken");
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/administrators/`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        setAdministrators(response.data.results);
      } catch (err) {
        setError("Failed to fetch administrators.");
      } finally {
        setLoading(false);
      }
    };

    fetchAdministrators();
  }, []);

  return (
    <Card>
      <Card.Header>
        <h5 className="mb-0">Administrators</h5>
      </Card.Header>
      <Card.Body>
        {loading ? (
          <div className="text-center">
            <Spinner animation="border" />
          </div>
        ) : error ? (
          <Alert variant="danger">{error}</Alert>
        ) : (
          <Table striped bordered hover responsive>
            <thead>
              <tr>
                <th>ID</th>
                <th>Full Name</th>
                <th>Email</th>
                <th>Organization</th>
              </tr>
            </thead>
            <tbody>
              {administrators.map((admin) => (
                <tr key={admin.id}>
                  <td>{admin.id}</td>
                  <td>{admin.full_name}</td>
                  <td>{admin.email}</td>
                  <td>{admin.organization_name}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card.Body>
    </Card>
  );
};

export default AdministratorsPage;
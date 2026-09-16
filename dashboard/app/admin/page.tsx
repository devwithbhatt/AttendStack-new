"use client";
import { Container, Row, Col, Card, Form, Button } from 'react-bootstrap';

const AdminDashboard = () => {
  return (
    <Container fluid>
      <Row className="mb-4">
        <Col>
          <h1>Welcome, Super Admin</h1>
          <p>Manage your organizations and employees from this central hub.</p>
        </Col>
      </Row>
      <Row className="mb-4">
        <Col md={6}>
          <Card>
            <Card.Body>
              <Card.Title>Total Organizations</Card.Title>
              <Card.Text className="fs-2">0</Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          <Card>
            <Card.Body>
              <Card.Title>Total Employees</Card.Title>
              <Card.Text className="fs-2">1</Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>
      <Row>
        <Col md={6}>
          <Card>
            <Card.Body>
              <Card.Title>Create Organization</Card.Title>
              <Form>
                <Form.Group className="mb-3" controlId="organizationName">
                  <Form.Label>Organization Name</Form.Label>
                  <Form.Control type="text" placeholder="Enter organization name" />
                </Form.Group>
                <Card.Title as="h5" className="mt-4">Administrator Details</Card.Title>
                <Form.Group className="mb-3" controlId="adminFullName">
                  <Form.Label>Full Name</Form.Label>
                  <Form.Control type="text" placeholder="Enter admin's full name" />
                </Form.Group>
                <Form.Group className="mb-3" controlId="adminEmail">
                  <Form.Label>Email</Form.Label>
                  <Form.Control type="email" placeholder="admin@gmail.com" />
                </Form.Group>
                <Form.Group className="mb-3" controlId="adminPassword">
                  <Form.Label>Password</Form.Label>
                  <Form.Control type="password" placeholder="Password" />
                </Form.Group>
                <Button variant="primary" type="submit">
                  Create
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          <Card>
            <Card.Body>
              <Card.Title>Organizations</Card.Title>
              {/* You can add a table or list of organizations here */}
              <p>No organizations created yet.</p>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default AdminDashboard;
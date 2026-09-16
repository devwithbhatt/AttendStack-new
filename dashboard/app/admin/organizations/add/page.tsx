"use client";
import { useState } from 'react';
import { Container, Row, Col, Card, Form, Button, InputGroup } from 'react-bootstrap';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';

const AddOrganizationPage = () => {
  const router = useRouter();
  const [newOrg, setNewOrg] = useState({
    // Organization Details
    orgName: '',
    industry: '',
    companySize: '',
    website: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    country: 'India',
    timezone: '(GMT+05:30) India Standard Time',
    
    // Admin Details
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: '',

    // Subscription Details
    plan: 'basic',
    trialPeriod: '14',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewOrg(prevState => ({ ...prevState, [name]: value }));
  };

  const handleCreateOrganization = (e: React.FormEvent) => {
    e.preventDefault();
    if (newOrg.adminPassword !== newOrg.confirmPassword) {
      Swal.fire({
        title: "Validation Error",
        text: "Passwords do not match!",
        icon: "warning",
        confirmButtonColor: "#ffc107",
      });
      return;
    }
    // Add logic to send data to the backend API
    console.log('Creating new industry-ready organization:', newOrg);
    
    // After successful creation, redirect to the organizations list
    Swal.fire({
      title: "Created Successfully",
      text: "Organization created successfully!",
      icon: "success",
      confirmButtonColor: "#198754",
    }).then(() => {
      router.push('/admin/organizations');
    });
  };

  return (
    <Container fluid>
      <Row className="mb-4">
        <Col>
          <h1>Add New Organization</h1>
          <p>Fill in the details below to create a new organization.</p>
        </Col>
      </Row>
      <Row>
        <Col xs={12}>
          <Card>
            <Card.Header as="h5">Organization Details</Card.Header>
            <Card.Body>
              <Form onSubmit={handleCreateOrganization}>
                <Row>
                    <Col md={6} className="mb-3">
                        <Form.Group>
                            <Form.Label>Organization Name</Form.Label>
                            <Form.Control type="text" name="orgName" placeholder="Enter organization name" value={newOrg.orgName} onChange={handleInputChange} required />
                        </Form.Group>
                    </Col>
                    <Col md={6} className="mb-3">
                        <Form.Group>
                            <Form.Label>Industry</Form.Label>
                            <Form.Select name="industry" value={newOrg.industry} onChange={handleInputChange}>
                                <option value="">Select Industry...</option>
                                <option value="technology">Technology</option>
                                <option value="healthcare">Healthcare</option>
                                <option value="finance">Finance</option>
                                <option value="education">Education</option>
                                <option value="retail">Retail</option>
                            </Form.Select>
                        </Form.Group>
                    </Col>
                    <Col md={6} className="mb-3">
                        <Form.Group>
                            <Form.Label>Company Size</Form.Label>
                            <Form.Select name="companySize" value={newOrg.companySize} onChange={handleInputChange}>
                                <option value="">Select Size...</option>
                                <option value="1-10">1-10 employees</option>
                                <option value="11-50">11-50 employees</option>
                                <option value="51-200">51-200 employees</option>
                                <option value="201-500">201-500 employees</option>
                                <option value="500+">500+ employees</option>
                            </Form.Select>
                        </Form.Group>
                    </Col>
                    <Col md={6} className="mb-3">
                        <Form.Group>
                            <Form.Label>Website</Form.Label>
                            <Form.Control type="url" name="website" placeholder="https://example.com" value={newOrg.website} onChange={handleInputChange} />
                        </Form.Group>
                    </Col>
                    <Col md={6} className="mb-3">
                        <Form.Group>
                            <Form.Label>Contact Phone</Form.Label>
                            <Form.Control type="tel" name="phone" placeholder="Enter contact number" value={newOrg.phone} onChange={handleInputChange} />
                        </Form.Group>
                    </Col>
                     <Col md={6} className="mb-3">
                        <Form.Group>
                            <Form.Label>Timezone</Form.Label>
                            <Form.Select name="timezone" value={newOrg.timezone} onChange={handleInputChange}>
                                <option value="(GMT-12:00) International Date Line West">(GMT-12:00) International Date Line West</option>
                                <option value="(GMT+05:30) India Standard Time">(GMT+05:30) India Standard Time</option>
                                <option value="(GMT-05:00) Eastern Time (US & Canada)">(GMT-05:00) Eastern Time (US & Canada)</option>
                            </Form.Select>
                        </Form.Group>
                    </Col>
                </Row>
                <hr />
                <h5 className="mb-3">Administrator Details</h5>
                <Row>
                    <Col md={6} className="mb-3">
                        <Form.Group>
                            <Form.Label>Full Name</Form.Label>
                            <Form.Control type="text" name="adminName" placeholder="Enter admin's full name" value={newOrg.adminName} onChange={handleInputChange} required />
                        </Form.Group>
                    </Col>
                    <Col md={6} className="mb-3">
                        <Form.Group>
                            <Form.Label>Email</Form.Label>
                            <Form.Control type="email" name="adminEmail" placeholder="Enter admin's email" value={newOrg.adminEmail} onChange={handleInputChange} required />
                        </Form.Group>
                    </Col>
                    <Col md={6} className="mb-3">
                        <Form.Group>
                            <Form.Label>Password</Form.Label>
                            <Form.Control type="password" name="adminPassword" placeholder="Create a strong password" value={newOrg.adminPassword} onChange={handleInputChange} required />
                        </Form.Group>
                    </Col>
                    <Col md={6} className="mb-3">
                        <Form.Group>
                            <Form.Label>Confirm Password</Form.Label>
                            <Form.Control type="password" name="confirmPassword" placeholder="Confirm the password" value={newOrg.confirmPassword} onChange={handleInputChange} required />
                        </Form.Group>
                    </Col>
                </Row>
                <hr />
                <h5 className="mb-3">Subscription Details</h5>
                <Row>
                    <Col md={6} className="mb-3">
                        <Form.Group>
                            <Form.Label>Subscription Plan</Form.Label>
                            <Form.Select name="plan" value={newOrg.plan} onChange={handleInputChange}>
                                <option value="basic">Basic</option>
                                <option value="pro">Pro</option>
                                <option value="enterprise">Enterprise</option>
                            </Form.Select>
                        </Form.Group>
                    </Col>
                    <Col md={6} className="mb-3">
                        <Form.Group>
                            <Form.Label>Trial Period (in days)</Form.Label>
                            <Form.Control type="number" name="trialPeriod" value={newOrg.trialPeriod} onChange={handleInputChange} />
                        </Form.Group>
                    </Col>
                </Row>
                <div className="mt-4">
                    <Button variant="primary" type="submit">
                    Create Organization
                    </Button>
                    <Button variant="secondary" onClick={() => router.back()} className="ms-2">
                    Cancel
                    </Button>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default AddOrganizationPage;
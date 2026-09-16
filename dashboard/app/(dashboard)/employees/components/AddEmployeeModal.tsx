"use client";
import { useState } from "react";
import { Modal } from "react-bootstrap";
import { IconX } from "@tabler/icons-react";

const AddEmployeeModal = ({ show, onHide }: { show: boolean; onHide: () => void }) => {
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setProfilePhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header>
        <Modal.Title>Add New Employee</Modal.Title>
        <IconX size={20} className="cursor-pointer" onClick={onHide} />
      </Modal.Header>
      <Modal.Body>
        <form>
          <div className="mb-3 text-center">
            <img
              src={previewUrl || "/images/avatar/avatar-fallback.jpg"}
              alt="Profile Preview"
              className="avatar avatar-xl rounded-circle mb-3"
            />
            <div>
              <label htmlFor="profilePhoto" className="btn btn-sm btn-secondary">
                Upload Photo
              </label>
              <input type="file" className="d-none" id="profilePhoto" accept="image/*" onChange={handleFileChange} />
            </div>
          </div>
          <div className="mb-3">
            <label htmlFor="employeeName" className="form-label">
              Employee Name
            </label>
            <input type="text" className="form-control" id="employeeName" placeholder="Enter full name" />
          </div>
          <div className="mb-3">
            <label htmlFor="employeeEmail" className="form-label">
              Email address
            </label>
            <input type="email" className="form-control" id="employeeEmail" placeholder="Enter email address" />
          </div>
          <div className="row">
            <div className="col-md-6 mb-3">
              <label htmlFor="department" className="form-label">
                Department
              </label>
              <select className="form-select" id="department">
                <option>Select Department</option>
                <option>Engineering</option>
                <option>Design</option>
                <option>Marketing</option>
                <option>Sales</option>
              </select>
            </div>
            <div className="col-md-6 mb-3">
              <label htmlFor="designation" className="form-label">
                Designation
              </label>
              <input type="text" className="form-control" id="designation" placeholder="Enter designation" />
            </div>
          </div>
          <div className="mb-3">
            <label htmlFor="joinDate" className="form-label">
              Joining Date
            </label>
            <input type="date" className="form-control" id="joinDate" />
          </div>
          <div className="row">
            <div className="col-md-6 mb-3">
              <label htmlFor="salary" className="form-label">
                Salary
              </label>
              <input type="number" className="form-control" id="salary" placeholder="Enter salary" />
            </div>
            <div className="col-md-6 mb-3">
              <label htmlFor="payFrequency" className="form-label">
                Pay Frequency
              </label>
              <select className="form-select" id="payFrequency">
                <option>Select Frequency</option>
                <option>Monthly</option>
                <option>Weekly</option>
                <option>Bi-Weekly</option>
              </select>
            </div>
          </div>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary" onClick={onHide}>
          Close
        </button>
        <button type="button" className="btn btn-primary">
          Save Employee
        </button>
      </Modal.Footer>
    </Modal>
  );
};

export default AddEmployeeModal;
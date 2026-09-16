"use client";
import { useState } from "react";
import { Modal, Button, Form, Spinner } from "react-bootstrap";
import { IconCalendarPlus, IconTag, IconCalendar, IconFolder } from "@tabler/icons-react";

const AddHolidayModal = ({
  show,
  handleClose,
  addHoliday,
}: {
  show: boolean;
  handleClose: () => void;
  addHoliday: (holiday: { name: string; date: string; type: string }) => Promise<void>;
}) => {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState("Public Holiday");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name || !date) return;
    setSubmitting(true);
    try {
      await addHoliday({ name, date, type });
      setName("");
      setDate("");
      setType("Public Holiday");
      handleClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal show={show} onHide={handleClose} centered className="premium-holiday-modal">
      <Modal.Header closeButton className="border-bottom-0 pb-0 pt-4 px-4">
        <div className="d-flex align-items-center gap-2">
          <div className="icon-badge bg-primary-subtle text-primary rounded-3 p-2 d-flex align-items-center justify-content-center">
            <IconCalendarPlus size={22} />
          </div>
          <div>
            <Modal.Title className="fw-bold fs-4 heading-modal text-dark">Add Company Holiday</Modal.Title>
            <small className="text-secondary d-block mt-0.5">Register a new official company holiday</small>
          </div>
        </div>
      </Modal.Header>
      <Modal.Body className="pt-3 px-4 pb-4">
        <Form onSubmit={handleSubmit} className="mt-2">
          <Form.Group className="mb-3" controlId="holidayName">
            <Form.Label className="fw-semibold text-dark small d-flex align-items-center gap-2 mb-1.5">
              <IconTag size={16} className="text-muted" /> Holiday Designation
            </Form.Label>
            <Form.Control
              type="text"
              placeholder="e.g. Independence Day, Diwali"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="form-control-custom py-2 px-3 border border-light-subtle rounded-3"
              required
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="holidayDate">
            <Form.Label className="fw-semibold text-dark small d-flex align-items-center gap-2 mb-1.5">
              <IconCalendar size={16} className="text-muted" /> Calendar Date
            </Form.Label>
            <Form.Control
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="form-control-custom py-2 px-3 border border-light-subtle rounded-3"
              required
            />
          </Form.Group>
          <Form.Group className="mb-4" controlId="holidayType">
            <Form.Label className="fw-semibold text-dark small d-flex align-items-center gap-2 mb-1.5">
              <IconFolder size={16} className="text-muted" /> Holiday Category
            </Form.Label>
            <Form.Select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="form-select-custom py-2 px-3 border border-light-subtle rounded-3"
            >
              <option>Public Holiday</option>
              <option>National Holiday</option>
              <option>Festival</option>
              <option>Optional Holiday</option>
            </Form.Select>
          </Form.Group>
          
          <div className="d-flex justify-content-end gap-2 mt-4 pt-2 border-top border-light-subtle">
            <Button variant="outline-secondary" className="px-4 py-2 rounded-3 border-light-subtle" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" className="px-4 py-2 rounded-3 text-white fw-medium shadow-sm d-flex align-items-center gap-2" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner as="span" animation="border" size="sm" />
                  Processing...
                </>
              ) : (
                "Save Holiday"
              )}
            </Button>
          </div>
        </Form>
      </Modal.Body>
      <style>{`
        .premium-holiday-modal .modal-content {
          border-radius: 16px !important;
          border: none !important;
          box-shadow: 0 10px 30px rgba(16, 24, 40, 0.08) !important;
        }
        .form-control-custom:focus, .form-select-custom:focus {
          border-color: #6366f1 !important;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12) !important;
        }
        .heading-modal {
          font-family: 'Outfit', sans-serif;
          letter-spacing: -0.3px;
        }
        .icon-badge {
          width: 42px;
          height: 42px;
        }
      `}</style>
    </Modal>
  );
};

export default AddHolidayModal;
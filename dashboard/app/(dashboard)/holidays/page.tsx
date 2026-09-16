"use client";
import { Fragment, useState, useEffect } from "react";
import { IconPlus, IconRefresh } from "@tabler/icons-react";
import Swal from "sweetalert2";
import HolidayRow from "./HolidayRow";
import { Holiday } from "./types";
import AddHolidayModal from "./AddHolidayModal";
import EditHolidayModal from "./EditHolidayModal";
import { useHolidays } from "./useHolidays";
import { flexRender } from "@tanstack/react-table";
import Pagination from "./Pagination";
import { Spinner, Button, Alert, Form } from "react-bootstrap";
import DasherBreadcrumb from "components/common/DasherBreadcrumb";

const BASE_URL = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/holidays/`;

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem("authToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const HolidaysPage = () => {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [totalHolidaysCount, setTotalHolidaysCount] = useState(0);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedHoliday, setSelectedHoliday] = useState<Holiday | null>(null);

  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  // Determine user permissions
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("user");
        if (stored) {
          setCurrentUser(JSON.parse(stored));
        }
      } catch {}
    }
  }, []);

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const isHR = currentUser?.role === "HR";
  const isSubAdmin = currentUser?.role === "SUB_ADMIN";
  const holidaysPerm = currentUser?.permissions?.holidays;

  const canEdit = isSuperAdmin || isHR || (isSubAdmin ? (
    typeof holidaysPerm === "object" && holidaysPerm !== null
      ? Boolean(holidaysPerm.edit)
      : Boolean(holidaysPerm)
  ) : false);

  const canDelete = isSuperAdmin || isHR || (isSubAdmin ? (
    typeof holidaysPerm === "object" && holidaysPerm !== null
      ? Boolean(holidaysPerm.delete)
      : false
  ) : false);

  const hasActionCol = canEdit || canDelete;

  const { table } = useHolidays(holidays, hasActionCol, Math.ceil(totalHolidaysCount / (pagination.pageSize || 10)) || 1);

  // Fetch holidays from Django API
  const fetchHolidays = async (page = 0, size = 10) => {
    setIsLoading(true);
    setError("");
    try {
      const offset = page * size;
      const res = await fetch(`${BASE_URL}?limit=${size}&offset=${offset}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load holiday records.");
      const data = await res.json();
      if (Array.isArray(data)) {
        setHolidays(data);
        setTotalHolidaysCount(data.length);
      } else if (data && Array.isArray(data.results)) {
        setHolidays(data.results);
        setTotalHolidaysCount(data.count || data.results.length);
      } else {
        setHolidays([]);
        setTotalHolidaysCount(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error fetching holidays.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHolidays(pagination.pageIndex, pagination.pageSize);
  }, [pagination.pageIndex, pagination.pageSize]);

  const handleShowAddModal = () => {
    if (!canEdit) {
      Swal.fire({
        title: "Permission Denied",
        text: "You do not have permission to add holidays.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
      return;
    }
    setShowAddModal(true);
  };
  const handleCloseAddModal = () => setShowAddModal(false);

  const handleShowEditModal = (holiday: Holiday) => {
    if (!canEdit) {
      Swal.fire({
        title: "Permission Denied",
        text: "You do not have permission to edit holidays.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
      return;
    }
    setSelectedHoliday(holiday);
    setShowEditModal(true);
  };
  const handleCloseEditModal = () => {
    setSelectedHoliday(null);
    setShowEditModal(false);
  };

  // API Mutators
  const addHoliday = async (newHoliday: { name: string; date: string; type: string }) => {
    if (!canEdit) {
      Swal.fire({
        title: "Permission Denied",
        text: "You do not have permission to add holidays.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
      return;
    }
    try {
      const res = await fetch(BASE_URL, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(newHoliday),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || errorData.date?.[0] || "Failed to create holiday record.");
      }
      await fetchHolidays(pagination.pageIndex, pagination.pageSize);
    } catch (err) {
      Swal.fire({
        title: "Creation Failed",
        text: err instanceof Error ? err.message : "Failed to create holiday.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
      throw err;
    }
  };

  const updateHoliday = async (updatedHoliday: Holiday) => {
    if (!canEdit) {
      Swal.fire({
        title: "Permission Denied",
        text: "You do not have permission to edit holidays.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
      return;
    }
    try {
      const res = await fetch(`${BASE_URL}${updatedHoliday.id}/`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(updatedHoliday),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || errorData.date?.[0] || "Failed to update holiday.");
      }
      await fetchHolidays(pagination.pageIndex, pagination.pageSize);
    } catch (err) {
      Swal.fire({
        title: "Update Failed",
        text: err instanceof Error ? err.message : "Failed to update holiday.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
      throw err;
    }
  };

  const handleDelete = async (id: number) => {
    if (!canDelete) {
      Swal.fire({
        title: "Permission Denied",
        text: "You do not have permission to delete holidays.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
      return;
    }
    const result = await Swal.fire({
      title: "Delete Holiday?",
      text: "Are you sure you want to permanently delete this holiday record?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc3545",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Yes, Delete It",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;
    try {
      const res = await fetch(`${BASE_URL}${id}/`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete the holiday record.");
      await fetchHolidays(pagination.pageIndex, pagination.pageSize);
      Swal.fire({
        title: "Deleted!",
        text: "Holiday has been removed successfully.",
        icon: "success",
        confirmButtonColor: "#198754",
      });
    } catch (err) {
      Swal.fire({
        title: "Delete Failed",
        text: err instanceof Error ? err.message : "Error deleting holiday.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
    }
  };

  return (
    <Fragment>
      <DasherBreadcrumb />
      <div className="mb-6 d-flex align-items-center justify-content-between">
        <div>
          <h2 className="mb-0 fw-bold">Company Holidays</h2>
          <p className="text-secondary mb-0">
            Manage and view all upcoming company holidays and festival calendars.
          </p>
        </div>
        <div className="d-flex gap-2">
          <Button variant="outline-secondary" size="sm" onClick={() => fetchHolidays(pagination.pageIndex, pagination.pageSize)} className="d-flex align-items-center gap-2">
            <IconRefresh size={16} /> Sync
          </Button>
          {canEdit && (
            <button
              className="btn btn-primary d-flex align-items-center gap-2 shadow-sm"
              onClick={handleShowAddModal}
            >
              <IconPlus size={18} /> Add Holiday
            </button>
          )}
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="card border-0 shadow-sm mb-6">
        <div className="card-header bg-white border-bottom-0 pt-4 pb-4">
          <div className="row g-3">
            <div className="col-lg-3 col-md-4">
              <Form.Control
                type="search"
                placeholder="Search Holidays..."
                value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
                onChange={(e) =>
                  table.getColumn("name")?.setFilterValue(e.target.value)
                }
              />
            </div>
            <div className="col-lg-3 col-md-4">
              <Form.Select
                onChange={(e) =>
                  table.getColumn("date")?.setFilterValue(e.target.value)
                }
              >
                <option value="">Filter by Year</option>
                {Array.from(
                  new Set(holidays.map((h) => new Date(h.date).getFullYear()))
                )
                  .sort((a, b) => b - a)
                  .map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
              </Form.Select>
            </div>
            <div className="col-lg-3 col-md-4">
              <Form.Select
                onChange={(e) =>
                  table.getColumn("type")?.setFilterValue(e.target.value)
                }
              >
                <option value="">Filter by Type</option>
                <option value="Public Holiday">Public Holiday</option>
                <option value="National Holiday">National Holiday</option>
                <option value="Festival">Festival</option>
                <option value="Optional Holiday">Optional Holiday</option>
              </Form.Select>
            </div>
          </div>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            {isLoading ? (
              <div className="d-flex justify-content-center align-items-center py-6">
                <Spinner animation="border" variant="primary" role="status">
                  <span className="visually-hidden">Loading calendar...</span>
                </Spinner>
              </div>
            ) : (
              <>
                <table className="table align-middle table-hover text-nowrap mb-0">
                  <thead className="table-light">
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <th key={header.id}>
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext()
                                )}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.length === 0 ? (
                      <tr>
                        <td colSpan={hasActionCol ? 6 : 5} className="text-center py-5 text-secondary">
                          No company holidays registered.
                        </td>
                      </tr>
                    ) : (
                      table.getRowModel().rows.map((row) => (
                        <HolidayRow
                          key={row.id}
                          row={row}
                          handleDelete={handleDelete}
                          handleEdit={handleShowEditModal}
                          canEdit={canEdit}
                          canDelete={canDelete}
                        />
                      ))
                    )}
                  </tbody>
                </table>
                {table.getPageCount() > 1 && (
                  <div className="px-4 py-3 border-top">
                    <Pagination
                      totalPages={table.getPageCount()}
                      currentPage={table.getState().pagination.pageIndex + 1}
                      onPageChange={(page) => table.setPageIndex(page - 1)}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <AddHolidayModal
        show={showAddModal}
        handleClose={handleCloseAddModal}
        addHoliday={addHoliday}
      />
      <EditHolidayModal
        show={showEditModal}
        handleClose={handleCloseEditModal}
        holiday={selectedHoliday}
        updateHoliday={updateHoliday}
      />
    </Fragment>
  );
};

export default HolidaysPage;
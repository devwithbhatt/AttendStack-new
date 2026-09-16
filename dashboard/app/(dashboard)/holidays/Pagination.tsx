"use client";
import { Pagination as BootstrapPagination } from "react-bootstrap";

interface PaginationProps {
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number) => void;
}

const Pagination = ({
  totalPages,
  currentPage,
  onPageChange,
}: PaginationProps) => {
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= safeTotalPages && page !== safeCurrentPage) {
      onPageChange(page);
    }
  };

  return (
    <BootstrapPagination className="justify-content-end mb-0">
      <BootstrapPagination.First
        onClick={() => handlePageChange(1)}
        disabled={safeCurrentPage === 1}
      />
      <BootstrapPagination.Prev
        onClick={() => handlePageChange(safeCurrentPage - 1)}
        disabled={safeCurrentPage === 1}
      />
      {Array.from({ length: safeTotalPages }, (_, i) => i + 1).map((number) => (
        <BootstrapPagination.Item
          key={number}
          active={number === safeCurrentPage}
          onClick={() => handlePageChange(number)}
        >
          {number}
        </BootstrapPagination.Item>
      ))}
      <BootstrapPagination.Next
        onClick={() => handlePageChange(safeCurrentPage + 1)}
        disabled={safeCurrentPage === safeTotalPages}
      />
      <BootstrapPagination.Last
        onClick={() => handlePageChange(safeTotalPages)}
        disabled={safeCurrentPage === safeTotalPages}
      />
    </BootstrapPagination>
  );
};

export default Pagination;
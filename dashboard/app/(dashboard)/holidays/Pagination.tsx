"use client";
import { Pagination as BootstrapPagination } from "react-bootstrap";

const Pagination = ({
  totalPages,
  currentPage,
  onPageChange,
}: {
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number) => void;
}) => {
  return (
    <BootstrapPagination className="justify-content-end">
      <BootstrapPagination.First
        onClick={() => onPageChange(1)}
        disabled={currentPage === 1}
      />
      <BootstrapPagination.Prev
        onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
        disabled={currentPage === 1}
      />
      {[...Array(totalPages).keys()].map((number) => (
        <BootstrapPagination.Item
          key={number + 1}
          active={number + 1 === currentPage}
          onClick={() => onPageChange(number + 1)}
        >
          {number + 1}
        </BootstrapPagination.Item>
      ))}
      <BootstrapPagination.Next
        onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
        disabled={currentPage === totalPages}
      />
      <BootstrapPagination.Last
        onClick={() => onPageChange(totalPages)}
        disabled={currentPage === totalPages}
      />
    </BootstrapPagination>
  );
};

export default Pagination;
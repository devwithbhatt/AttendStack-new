"use client";

import { Pagination } from "react-bootstrap";

interface CustomPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (pageNumber: number) => void;
}

type PaginationItem = number | "start-ellipsis" | "end-ellipsis";

const getPaginationItems = (currentPage: number, totalPages: number): PaginationItem[] => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items = new Set<number>([1, totalPages, currentPage]);
  if (currentPage > 2) items.add(currentPage - 1);
  if (currentPage < totalPages - 1) items.add(currentPage + 1);
  if (currentPage <= 4) {
    items.add(2);
    items.add(3);
    items.add(4);
  }
  if (currentPage >= totalPages - 3) {
    items.add(totalPages - 1);
    items.add(totalPages - 2);
    items.add(totalPages - 3);
  }

  const pages = Array.from(items)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  return pages.reduce<PaginationItem[]>((acc, page, index) => {
    const previousPage = pages[index - 1];
    if (previousPage && page - previousPage > 1) {
      acc.push(previousPage === 1 ? "start-ellipsis" : "end-ellipsis");
    }
    acc.push(page);
    return acc;
  }, []);
};

const CustomPagination: React.FC<CustomPaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
}) => {
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);
  const paginationItems = getPaginationItems(safeCurrentPage, safeTotalPages);

  const handlePageChange = (pageNumber: number) => {
    if (pageNumber > 0 && pageNumber <= safeTotalPages && pageNumber !== safeCurrentPage) {
      onPageChange(pageNumber);
    }
  };

  if (safeTotalPages <= 1) {
    return null;
  }

  return (
    <nav className="as-pagination-shell" aria-label="Pagination navigation">
      <div className="as-pagination-summary">
        Page <strong>{safeCurrentPage}</strong> of <strong>{safeTotalPages}</strong>
      </div>
      <Pagination className="as-pagination mb-0">
        <Pagination.First
          className="as-pagination-edge"
          onClick={() => handlePageChange(1)}
          disabled={safeCurrentPage === 1}
        />
        <Pagination.Prev
          onClick={() => handlePageChange(safeCurrentPage - 1)}
          disabled={safeCurrentPage === 1}
        />
        {paginationItems.map((item) =>
          typeof item === "number" ? (
            <Pagination.Item
              key={item}
              active={item === safeCurrentPage}
              onClick={() => handlePageChange(item)}
            >
              {item}
            </Pagination.Item>
          ) : (
            <Pagination.Ellipsis key={item} disabled />
          )
        )}
        <Pagination.Next
          onClick={() => handlePageChange(safeCurrentPage + 1)}
          disabled={safeCurrentPage === safeTotalPages}
        />
        <Pagination.Last
          className="as-pagination-edge"
          onClick={() => handlePageChange(safeTotalPages)}
          disabled={safeCurrentPage === safeTotalPages}
        />
      </Pagination>

      <style jsx global>{`
        .as-pagination-shell {
          align-items: center;
          display: flex;
          gap: 12px;
          justify-content: space-between;
          margin-top: 16px;
          max-width: 100%;
          width: 100%;
        }
        .as-pagination-summary {
          color: #64748b;
          font-size: 13px;
          white-space: nowrap;
        }
        .as-pagination-summary strong {
          color: #0f172a;
          font-weight: 700;
        }
        .as-pagination {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          justify-content: flex-end;
          max-width: 100%;
        }
        .as-pagination .page-item {
          flex: 0 0 auto;
        }
        .as-pagination .page-link {
          align-items: center;
          border: 1px solid #d8dee7;
          border-radius: 8px !important;
          color: #64748b;
          display: inline-flex;
          font-size: 13px;
          font-weight: 600;
          height: 40px;
          justify-content: center;
          line-height: 1;
          min-width: 40px;
          padding: 0 12px;
        }
        .as-pagination .page-link:hover {
          background: #f8fafc;
          border-color: #b8c2d0;
          color: #0f172a;
        }
        .as-pagination .page-item.active .page-link {
          background: #00a76f;
          border-color: #00a76f;
          box-shadow: 0 8px 18px rgba(0, 167, 111, 0.2);
          color: #ffffff;
        }
        .as-pagination .page-item.disabled .page-link {
          background: #f8fafc;
          border-color: #edf1f5;
          color: #b8c2d0;
          opacity: 1;
        }
        @media (max-width: 575.98px) {
          .as-pagination-shell {
            align-items: stretch;
            flex-direction: column;
          }
          .as-pagination-summary {
            text-align: center;
          }
          .as-pagination {
            justify-content: center;
          }
          .as-pagination-edge {
            display: none;
          }
          .as-pagination .page-link {
            height: 36px;
            min-width: 36px;
            padding: 0 10px;
          }
        }
      `}</style>
    </nav>
  );
};

export default CustomPagination;

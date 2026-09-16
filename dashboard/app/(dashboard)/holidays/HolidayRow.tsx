"use client";
import { Holiday } from "./types";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { Tooltip, OverlayTrigger } from "react-bootstrap";
import { flexRender, Row } from "@tanstack/react-table";

const HolidayRow = ({
  row,
  handleDelete,
  handleEdit,
  isAdmin,
  canEdit = isAdmin,
  canDelete = isAdmin,
}: {
  row: Row<Holiday>;
  handleDelete: (id: number) => void;
  handleEdit: (holiday: Holiday) => void;
  isAdmin?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}) => {
  const hasActions = canEdit || canDelete;

  return (
    <tr>
      {row.getVisibleCells().filter(cell => cell.column.id !== "action").map((cell) => (
        <td key={cell.id}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
      {hasActions && (
        <td>
          <div className="d-flex gap-2">
            {canEdit && (
              <OverlayTrigger
                placement="top"
                overlay={<Tooltip id="tooltip-edit">Edit Holiday</Tooltip>}
              >
                <button
                  className="btn btn-outline-primary btn-sm px-2 py-1"
                  onClick={() => handleEdit(row.original)}
                >
                  <IconPencil size={15} />
                </button>
              </OverlayTrigger>
            )}
            {canDelete && (
              <OverlayTrigger
                placement="top"
                overlay={<Tooltip id="tooltip-delete">Delete Holiday</Tooltip>}
              >
                <button
                  className="btn btn-outline-danger btn-sm px-2 py-1"
                  onClick={() => handleDelete(row.original.id)}
                >
                  <IconTrash size={15} />
                </button>
              </OverlayTrigger>
            )}
          </div>
        </td>
      )}
    </tr>
  );
};

export default HolidayRow;
"use client";
import SimpleBar from "simplebar-react";
import { ListGroup, Nav, Offcanvas, Tab } from "react-bootstrap";
import Link from "next/link";
import Flex from "./Flex";
import {
  IconCalendarWeek,
  IconChecks,
  IconCircleFilled,
  IconSettings,
  IconActivity,
  IconNotebook,
  IconCalendarTime,
} from "@tabler/icons-react";

interface NotificationItem {
  id: string;
  title: string;
  description: string;
  timeLabel: string;
  type: "attendance" | "holiday" | "payroll" | "system" | "leave";
  unread: boolean;
  href?: string;
}

interface NotificationProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
}

const NoficationList: React.FC<NotificationProps> = ({
  isOpen,
  onClose,
  notifications = [],
  onMarkAsRead,
  onMarkAllAsRead,
}) => {
  const unreadList = notifications.filter((n) => n.unread);
  const systemList = notifications.filter((n) => n.type === "system" || n.type === "holiday");

  const getIcon = (type: string) => {
    switch (type) {
      case "holiday":
        return (
          <div className="icon-shape icon-md bg-warning-subtle text-warning-emphasis rounded-circle d-flex align-items-center justify-content-center p-2.5">
            <IconCalendarWeek size={18} stroke={1.5} />
          </div>
        );
      case "attendance":
        return (
          <div className="icon-shape icon-md bg-success-subtle text-success-emphasis rounded-circle d-flex align-items-center justify-content-center p-2.5">
            <IconChecks size={18} stroke={1.5} />
          </div>
        );
      case "payroll":
        return (
          <div className="icon-shape icon-md bg-primary-subtle text-primary-emphasis rounded-circle d-flex align-items-center justify-content-center p-2.5">
            <IconActivity size={18} stroke={1.5} />
          </div>
        );
      case "leave":
        return (
          <div className="icon-shape icon-md bg-danger-subtle text-danger-emphasis rounded-circle d-flex align-items-center justify-content-center p-2.5">
            <IconCalendarTime size={18} stroke={1.5} />
          </div>
        );
      default:
        return (
          <div className="icon-shape icon-md bg-info-subtle text-info-emphasis rounded-circle d-flex align-items-center justify-content-center p-2.5">
            <IconSettings size={18} stroke={1.5} />
          </div>
        );
    }
  };

  const renderList = (items: NotificationItem[]) => {
    if (items.length === 0) {
      return (
        <div className="text-center py-5 text-secondary">
          <IconNotebook size={32} stroke={1.2} className="mb-2 text-muted animate-pulse" />
          <p className="small mb-0">No notifications found.</p>
        </div>
      );
    }

    return (
      <ListGroup variant="flush">
        {items.map((item) => {
          const content = (
            <>
            <div className="d-flex gap-3 align-items-center">
              {getIcon(item.type)}
              <div className="d-flex flex-column gap-0.5">
                <div className="fw-semibold text-dark small">{item.title}</div>
                <div className="text-secondary small" style={{ fontSize: "0.78rem" }}>
                  {item.description}
                </div>
                <small className="text-secondary-emphasis" style={{ fontSize: "0.72rem", fontWeight: 500 }}>
                  {item.timeLabel}
                </small>
              </div>
            </div>
            {item.unread && (
              <div className="pt-1.5 flex-shrink-0">
                <IconCircleFilled size={8} className="text-danger" />
              </div>
            )}
            </>
          );

          return (
            <ListGroup.Item
              key={item.id}
              action
              onClick={() => onMarkAsRead(item.id)}
              className="p-0 border-dashed border-bottom"
              style={{ cursor: "pointer", transition: "all 0.15s ease" }}
            >
              {item.href ? (
                <Link
                  href={item.href}
                  onClick={onClose}
                  className="d-flex justify-content-between align-items-start gap-3 p-4 text-decoration-none"
                >
                  {content}
                </Link>
              ) : (
                <div className="d-flex justify-content-between align-items-start gap-3 p-4">
                  {content}
                </div>
              )}
            </ListGroup.Item>
          );
        })}
      </ListGroup>
    );
  };

  return (
    <Offcanvas placement="end" show={isOpen} onHide={onClose} className="border-0 shadow-lg">
      <div className="sticky-top bg-white">
        <Offcanvas.Header className="gap-4 pb-2" closeButton={true}>
          <Flex justifyContent="between" className="w-100 align-items-center">
            <h5 className="mb-0 fw-bold text-dark" id="offcanvasNotificationLabel">
              Notifications
            </h5>
            <Flex alignItems="center" className="gap-3">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onMarkAllAsRead();
                }}
                className="btn btn-link p-1 text-primary d-flex align-items-center justify-content-center"
                title="Mark all as read"
                style={{ border: "none", background: "none" }}
              >
                <IconChecks size={22} strokeWidth={1.5} />
              </button>
            </Flex>
          </Flex>
        </Offcanvas.Header>
      </div>

      <div className="mt-1 flex-grow-1">
        <Tab.Container defaultActiveKey={"0"}>
          <Nav className="nav-line-bottom px-4" defaultActiveKey={"0"}>
            <Nav.Item>
              <Nav.Link role="button" eventKey={"0"} className="small fw-semibold py-2">
                All ({notifications.length})
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link role="button" eventKey={"1"} className="small fw-semibold py-2">
                Unread ({unreadList.length})
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link role="button" eventKey={"2"} className="small fw-semibold py-2">
                System ({systemList.length})
              </Nav.Link>
            </Nav.Item>
          </Nav>
          <Tab.Content id="pills-tabContent" className="mt-2">
            <Tab.Pane eventKey={"0"}>
              <SimpleBar style={{ maxHeight: "calc(100vh - 150px)" }}>
                {renderList(notifications)}
              </SimpleBar>
            </Tab.Pane>
            <Tab.Pane eventKey={"1"}>
              <SimpleBar style={{ maxHeight: "calc(100vh - 150px)" }}>
                {renderList(unreadList)}
              </SimpleBar>
            </Tab.Pane>
            <Tab.Pane eventKey={"2"}>
              <SimpleBar style={{ maxHeight: "calc(100vh - 150px)" }}>
                {renderList(systemList)}
              </SimpleBar>
            </Tab.Pane>
          </Tab.Content>
        </Tab.Container>
      </div>
    </Offcanvas>
  );
};

export default NoficationList;

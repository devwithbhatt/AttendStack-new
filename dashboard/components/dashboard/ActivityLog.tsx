import { IconCircleFilled, IconClock } from "@tabler/icons-react";
import { Card, CardBody, Button } from "react-bootstrap";

interface LogItem {
  description: string;
  timestamp: string;
  colorClass: string;
}

interface ActivityLogProps {
  logs: LogItem[];
}

const ActivityLog = ({ logs }: ActivityLogProps) => {
  return (
    <Card className="border-0 shadow-sm mb-6 h-100 activity-feed-card">
      <Card.Header className="bg-white py-3 border-bottom-0 d-flex align-items-center gap-2">
        <IconClock size={20} className="text-primary" />
        <h5 className="mb-0 fw-bold text-dark">Live Activity Feed</h5>
      </Card.Header>
      <CardBody className="pt-0">
        <div className="d-flex flex-column gap-4 mb-4 mt-3">
          {logs.length > 0 ? (
            logs.map((item, index) => (
              <div
                key={index}
                className="timeline-vertical"
              >
                <div className="timeline-item position-relative">
                  <div className="row g-0">
                    <div className="col-auto me-3">
                      <div className="mt-1">
                        <IconCircleFilled
                          size={14}
                          className={`text-${item.colorClass}`}
                        />
                      </div>
                      {index !== logs.length - 1 && (
                        <div className="timeline-bar border-start border-dashed ms-2 mt-2" style={{ height: "100%", minHeight: "30px" }}></div>
                      )}
                    </div>
                    <div className="col">
                      <div className="fw-semibold text-dark">{item.description}</div>
                      <div className="text-secondary small mt-1">{item.timestamp}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-secondary py-4">
              No recent activity found.
            </div>
          )}
        </div>
        <div className="text-center">
          <Button href="/attendance/records" variant="light" className="w-100 text-primary fw-semibold">
            View All Records
          </Button>
        </div>
      </CardBody>
    </Card>
  );
};

export default ActivityLog;

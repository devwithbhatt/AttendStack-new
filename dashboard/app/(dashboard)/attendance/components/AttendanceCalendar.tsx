
"use client";

import React from "react";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";

const localizer = momentLocalizer(moment);

const eventStyleGetter = (event: any) => {
  let backgroundColor = "#f8f9fa"; // light
  let color = "white";

  switch (event.resource.status) {
    case "PRESENT":
      backgroundColor = "#198754"; // success
      break;
    case "LATE":
      backgroundColor = "#ffc107"; // warning
      color = "#000";
      break;
    case "HALF_DAY":
      backgroundColor = "#0dcaf0"; // info
      color = "#000";
      break;
    case "ABSENT":
      backgroundColor = "#dc3545"; // danger
      break;
    case "LEAVE":
      backgroundColor = "#dc3545"; // danger
      break;
    case "PAID_LEAVE":
      backgroundColor = "#0d6efd"; // primary
      break;
    case "HOLIDAY":
      backgroundColor = "#198754"; // success
      break;
    case "SUNDAY_UNPAID":
      backgroundColor = "#6c757d"; // secondary
      break;
  }
  return {
    style: {
      backgroundColor,
      borderRadius: "5px",
      opacity: 0.9,
      color: color,
      border: "0px",
      display: "block",
    },
  };
};

const AttendanceCalendar = ({ events, onSelectEvent, date }: { events: any[]; onSelectEvent: (event: any) => void; date: Date }) => {
  return (
    <div>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: 500 }}
        eventPropGetter={eventStyleGetter}
        onSelectEvent={onSelectEvent}
        date={date}
      />
    </div>
  );
};

export default AttendanceCalendar;
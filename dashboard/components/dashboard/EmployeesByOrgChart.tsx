"use client";
import { Card } from "react-bootstrap";
import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";

interface AttendanceOverviewChartProps {
  data: { status: string; count: number; color: string }[];
}

const EmployeesByOrgChart = ({ data }: AttendanceOverviewChartProps) => {
  const options: ApexOptions = {
    chart: {
      type: "donut",
      height: 350,
      fontFamily: 'Inter, sans-serif',
    },
    labels: data.map((d) => d.status),
    colors: data.map((d) => d.color),
    plotOptions: {
      pie: {
        donut: {
          size: '70%',
          labels: {
            show: true,
            name: {
              show: true,
              fontSize: '14px',
            },
            value: {
              show: true,
              fontSize: '24px',
              fontWeight: 600,
            },
            total: {
              show: true,
              showAlways: true,
              label: 'Total',
              fontSize: '16px',
              fontWeight: 600,
            }
          }
        }
      }
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      show: true,
      width: 2,
      colors: ["transparent"],
    },
    legend: {
      position: 'bottom',
      horizontalAlign: 'center',
    },
    tooltip: {
      y: {
        formatter: function (val) {
          return val + " employees";
        },
      },
    },
  };

  const series = data.map((d) => d.count);
  const totalCount = series.reduce((a, b) => a + b, 0);

  return (
    <Card className="border-0 shadow-sm h-100">
      <Card.Header className="bg-white py-3 border-bottom-0">
        <h5 className="mb-0 fw-bold text-dark">Today's Attendance Overview</h5>
      </Card.Header>
      <Card.Body className="d-flex align-items-center justify-content-center">
        {totalCount > 0 ? (
          <div className="w-100 d-flex justify-content-center">
            <Chart options={options} series={series} type="donut" height={350} width={400} />
          </div>
        ) : (
          <div className="text-secondary text-center py-5">
            No attendance records available for today.
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default EmployeesByOrgChart;
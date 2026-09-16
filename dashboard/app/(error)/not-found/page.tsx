//import node modules libraries
import { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Page Not Found | AttendStack",
  description: "The requested AttendStack page could not be found.",
};

const NotFound = () => {
  notFound();
};

export default NotFound;

//import node modules libraries
import { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Page Not Found | ZuperHR",
  description: "The requested ZuperHR page could not be found.",
};

const NotFound = () => {
  notFound();
};

export default NotFound;

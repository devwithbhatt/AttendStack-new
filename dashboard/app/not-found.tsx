import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page Not Found | AttendStack",
  description: "The requested AttendStack page could not be found.",
};

export default function GlobalNotFound() {
  return (
    <main className="min-vh-100 bg-light d-flex align-items-center py-5">
      <div className="container text-center">
        <Link href="/" aria-label="AttendStack home">
          <Image
            src="/images/brand/logo/logo.png"
            alt="AttendStack"
            width={190}
            height={55}
            className="mb-4"
            style={{ width: "auto", height: "45px" }}
            priority
          />
        </Link>

        <div className="mx-auto" style={{ maxWidth: "540px" }}>
          <Image
            src="/images/svg/404.svg"
            alt="Page not found"
            width={540}
            height={430}
            className="img-fluid"
            priority
          />
        </div>

        <h1 className="display-5 fw-bold mt-3">Page not found</h1>
        <p className="text-muted fs-5 mx-auto mb-4" style={{ maxWidth: "560px" }}>
          The page you requested does not exist or may have been moved.
        </p>

        <div className="d-flex flex-wrap justify-content-center gap-3">
          <Link href="/" className="btn btn-primary px-4">
            Go to home
          </Link>
          <Link href="/sign-in" className="btn btn-outline-primary px-4">
            Employee sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

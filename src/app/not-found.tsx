import Link from "next/link";
export default function NotFound() {
  return (
    <main className="route-error">
      <h1>This page has wandered off.</h1>
      <p>Choose a project to find your way back.</p>
      <Link className="button button-primary" href="/projects">
        All projects
      </Link>
    </main>
  );
}

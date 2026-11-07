import { JazzClientRows } from "./client";

export default function JazzClientPage() {
  return <JazzClientRows scope={process.env.JAZZ_APP_ID ?? "db-bench"} />;
}

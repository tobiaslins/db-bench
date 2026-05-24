import { JazzClientRows } from "./client";

export default function JazzClientPage() {
  return (
    <JazzClientRows
      appId={process.env.JAZZ_APP_ID ?? "db-bench"}
      serverUrl={process.env.JAZZ_SERVER_URL}
    />
  );
}

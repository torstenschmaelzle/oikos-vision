import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ── Strict API base-URL check ───────────────────────────────────────────
const API_BASE_URL = "https://data.apioikosconsulting.com";
console.info(`[Oikos] Resolved API Base URL: ${API_BASE_URL}`);

if (API_BASE_URL !== "https://data.apioikosconsulting.com") {
  throw new Error(
    `Invalid API Base URL configured: ${API_BASE_URL}. ` +
    `It must be exactly "https://data.apioikosconsulting.com".`
  );
}
// ────────────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(<App />);

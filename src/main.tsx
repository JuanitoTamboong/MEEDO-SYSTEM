import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// import "./index.css";  <--- DELETE OR COMMENT OUT THIS LINE
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
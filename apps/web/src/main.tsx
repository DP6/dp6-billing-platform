import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AccessGate } from "./AccessGate";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AccessGate>
        <App />
      </AccessGate>
    </BrowserRouter>
  </StrictMode>,
);

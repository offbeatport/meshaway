import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyAppearance, getStoredAppearance } from "./lib/theme";
import "./index.css";

applyAppearance(getStoredAppearance());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

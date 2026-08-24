import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import cacheBust from "./cacheBust";
import "./index.css";

// Applied synchronously (before first paint) to avoid a light-mode flash
// when the stored/system preference is dark.
const storedTheme = localStorage.getItem("wfm_theme");
const prefersDark = storedTheme ? storedTheme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.classList.toggle("dark", prefersDark);

cacheBust.install();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

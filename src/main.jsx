import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidCatch(err, info) {
    console.error("UI crashed:", err, info);
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ fontFamily: "system-ui", padding: 24 }}>
          <h2 style={{ color: "crimson" }}>Erro na UI</h2>
          <pre style={{ whiteSpace: "pre-wrap", background: "#f6f6f6", padding: 12, borderRadius: 8 }}>
            {String(this.state.err?.stack || this.state.err)}
          </pre>
          <div style={{ opacity: 0.8, marginTop: 10 }}>
            Abre a consola (F12) para veres o stack trace completo.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);

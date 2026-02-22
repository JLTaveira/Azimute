/* ErrorBoundary
/src/ErrorBoundary.jsx
 2026-02-17 - Joao Taveira (jltaveira@gmail.com) */

import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // também aparece no console
    console.error("UI crashed:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ fontFamily: "system-ui", padding: 20 }}>
          <h2 style={{ color: "crimson" }}>Erro na UI</h2>
          <pre style={{ background: "#f6f6f6", padding: 12, borderRadius: 8, overflow: "auto" }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <div style={{ opacity: 0.75 }}>
            Abre a consola (F12) para veres o stack trace completo.
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

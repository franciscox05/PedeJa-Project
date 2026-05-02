import { Component } from "react";

export default class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[PageErrorBoundary] Erro de runtime capturado", {
      page: this.props.pageName || "Pagina",
      error,
      errorInfo,
    });
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="dashboard-shell enterprise" style={{ padding: "24px" }}>
        <article className="panel" style={{ maxWidth: "820px", margin: "0 auto" }}>
          <p className="kicker">Erro de runtime</p>
          <h2 style={{ marginTop: 4 }}>{this.props.pageName || "Pagina"} temporariamente indisponivel</h2>
          <p className="muted" style={{ marginTop: 8 }}>
            Capturamos uma falha inesperada para evitar ecrã branco. Podes atualizar a pagina e continuar a usar o sistema.
          </p>
          {this.state.error?.message ? (
            <p className="shipday-inline-error" style={{ marginTop: 12 }}>
              {this.state.error.message}
            </p>
          ) : null}
          <div style={{ marginTop: 14, display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-dashboard"
              onClick={() => window.location.reload()}
            >
              Atualizar pagina
            </button>
          </div>
        </article>
      </div>
    );
  }
}

import { useSearchParams } from "react-router-dom";

/** Tela de login -- mesma composição de card do polaris-atlas (LoginPage) e
 *  do CenteredCard do AccessGate.tsx deste repo, adaptada pra serviço
 *  único: o botão manda pra `/api/auth/login` (mesma origem) e o backend
 *  redireciona direto pro Google; a volta cai em `/` (sucesso) ou aqui de
 *  novo com `?error=` (falha) -- sem callback client-side, ver
 *  oauth_routes.py. Fica ANTES do AccessGate na árvore de rotas (main.tsx):
 *  resolve login primeiro, acesso por projeto depois. */
export function LoginPage() {
  const [params] = useSearchParams();
  const error = params.get("error");

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--background)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          padding: "36px 32px",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          textAlign: "center",
        }}
      >
        <svg width="30" height="20" viewBox="0 0 26 18" aria-hidden="true">
          <path d="M2 18 L2 12 L7 10 L7 18 Z" fill="#ffb302" />
          <path d="M10 18 L10 7 L15 5 L15 18 Z" fill="#ffb302" />
          <path d="M18 18 L18 2 L23 0 L23 18 Z" fill="#ffb302" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 18, fontWeight: 500, color: "var(--foreground)" }}>Billing Platform</span>
          <span
            style={{
              font: "500 10px/1 Ubuntu, sans-serif",
              letterSpacing: ".18em",
              textTransform: "uppercase",
              color: "var(--muted-foreground)",
            }}
          >
            dp6
          </span>
        </div>
        <div style={{ width: 40, height: 1, background: "var(--border-strong)" }} />
        {error && <p style={{ fontSize: 12.5, color: "var(--bad)", margin: 0 }}>{error}</p>}
        <a
          href="/api/auth/login"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 18px",
            background: "#ffb302",
            color: "#1d1d1b",
            borderRadius: "var(--radius)",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Entrar com Google
        </a>
      </div>
    </div>
  );
}

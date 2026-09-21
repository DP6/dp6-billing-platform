import type { ReactNode } from "react";
import { AccessContext } from "./lib/access";
import { useApi } from "./lib/api";
import type { Me, MeProjects } from "./types";

/** Card centralizado com a marca dp6 -- mesma composição do LoginPage do
 *  Atlas (card, marca, texto, ação), mas SEM fluxo de OAuth: o IAP já
 *  autenticou o caller antes do SPA sequer carregar (ver terraform/modules/
 *  app_service, iap_enabled=true), então não existe estado "deslogado" pro
 *  React observar -- este componente só decide o que mostrar DEPOIS do IAP,
 *  a partir de quem o caller é (/me) e quais projetos ele pode ver
 *  (/me/projects, project_access.py). */
function CenteredCard({ children }: { children: ReactNode }) {
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
        {children}
      </div>
    </div>
  );
}

export function AccessGate({ children }: { children: ReactNode }) {
  const me = useApi<Me>("/me");
  const mp = useApi<MeProjects>("/me/projects");

  if (me.loading || mp.loading) {
    return (
      <CenteredCard>
        <span style={{ fontSize: 13.5, color: "var(--muted-foreground)" }}>Carregando…</span>
      </CenteredCard>
    );
  }
  if (me.error || mp.error) {
    return (
      <CenteredCard>
        <span style={{ fontSize: 13.5, color: "var(--bad)" }}>
          Não foi possível confirmar seu acesso: {me.error ?? mp.error}
        </span>
      </CenteredCard>
    );
  }

  const unrestricted = mp.data?.unrestricted ?? false;
  const hasAnyProject = unrestricted || (mp.data?.projects.length ?? 0) > 0;

  if (!hasAnyProject) {
    return (
      <CenteredCard>
        <p style={{ fontSize: 13.5, color: "var(--foreground)", margin: 0 }}>
          {me.data?.email && (
            <>
              Logado como <strong>{me.data.email}</strong>.<br />
            </>
          )}
          Nenhum projeto foi liberado pra você ainda neste painel.
        </p>
        <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", margin: 0 }}>
          Peça pra alguém do grupo <strong>gcp-dp6-gti@dp6.com.br</strong> cadastrar seu e-mail (ou o grupo do
          seu time) na aba ADM, na seção "Acesso por projeto".
        </p>
      </CenteredCard>
    );
  }

  return <AccessContext.Provider value={{ unrestricted }}>{children}</AccessContext.Provider>;
}

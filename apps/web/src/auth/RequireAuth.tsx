import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useApi } from "../lib/api";
import type { SessionUser } from "./types";

/** Gate de UX -- exige sessão de login (oauth_session.py) antes de mostrar
 *  o app, além do IAP (que já protege o serviço na borda e não muda aqui) e
 *  do AccessGate (que continua resolvendo acesso por projeto, por dentro
 *  deste gate -- ver main.tsx). Sem sessão válida ou erro de rede/401,
 *  manda pra /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useApi<SessionUser>("/auth/me");

  if (me.loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted-foreground)",
          fontSize: 13.5,
        }}
      >
        Carregando…
      </div>
    );
  }

  if (me.error || !me.data) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

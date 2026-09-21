import { createContext, useContext } from "react";

/** unrestricted = caller vê custo de TODOS os projetos (bypass, ver
 *  project_access.is_bypass_principal no backend) -- usado pelas telas pra
 *  esconder cards de views que ainda são sempre conta inteira (forecast,
 *  cobertura por componente, SKU novo, unit economics, waterfall, etc. --
 *  ver _require_unrestricted em routes.py). Default true (mesmo espírito de
 *  "aberto" do resto do app antes do AccessGate resolver -- nunca esconde
 *  nada por engano enquanto a identidade ainda está carregando). */
export const AccessContext = createContext<{ unrestricted: boolean }>({ unrestricted: true });

export function useAccess() {
  return useContext(AccessContext);
}

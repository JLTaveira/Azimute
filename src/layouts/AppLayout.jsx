/* APPLAYOUT.jsx
src/layouts/AppLayout.jsx
 2026-02-21 - Joao Taveira (jltaveira@gmail.com) */

import azimuteLogo from "../assets/azimute.png";

// Centralizamos a terminologia para ser mais fácil de manter
const TERMINOLOGIA = {
  alcateia:   { titulo: "Alcateia",   unidade: "Bandos" },
  expedicao:  { titulo: "Expedição",  unidade: "Patrulhas" },
  comunidade: { titulo: "Comunidade", unidade: "Equipas" },
  cla:        { titulo: "Clã",        unidade: "Tribos" },
  default:    { titulo: "Secção",     unidade: "Subunidades" }
};

function getTerminologia(secaoDocId) {
  const s = String(secaoDocId || "").toLowerCase();
  if (s.includes("alcateia"))   return TERMINOLOGIA.alcateia;
  if (s.includes("expedicao"))  return TERMINOLOGIA.expedicao;
  if (s.includes("comunidade")) return TERMINOLOGIA.comunidade;
  if (s.includes("cla"))        return TERMINOLOGIA.cla;
  return TERMINOLOGIA.default;
}

export default function AppLayout({
  profile,
  userLabel,
  view,
  setView,
  canSeeSubunidades,
  canSeeObjetivosSecao,
  canSeeChefeAgrupamento,
  canSeeSecretarioAgrupamento, // Nova Prop
  canSeeGuiaGrupo,
  onLogout,
  children,
}) {
  const { titulo: secaoTitle, unidade: grupoLabel } = getTerminologia(profile?.secaoDocId);

  // Helper para o estilo de botão ativo
  const btnStyle = (v) => ({
    background: view === v ? "rgba(255,255,255,.12)" : undefined,
    borderLeft: view === v ? "3px solid var(--brand-teal)" : "3px solid transparent",
    justifyContent: "flex-start",
    textAlign: "left"
  });

  return (
    <div style={{ maxWidth: 1180, margin: "28px auto", padding: "0 16px", display: "flex", flexDirection: "column", minHeight: "calc(100vh - 56px)" }}>
      
      {/* Topbar */}
      <div className="az-card" style={{ marginBottom: 14 }}>
        <div className="az-card-inner">
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <img
              src={azimuteLogo}
              alt="Azimute"
              style={{ height: 44, width: 44, borderRadius: 12, objectFit: "cover", border: "1px solid rgba(255,255,255,.12)" }}
            />
            <div style={{ display: "grid" }}>
              <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 0.5 }}>AZIMUTE</div>
              <div style={{ opacity: 0.75, fontSize: 13 }}>GPE - Gestão Progresso Escutista</div>
            </div>

            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className="az-pill">
                {userLabel || "Olá"} {profile?.secaoNome ? `• ${profile.secaoNome}` : profile?.secaoDocId ? `• ${secaoTitle}` : ""}
              </span>
              <button className="az-btn" onClick={onLogout}>Sair</button>
            </div>
          </div>

          {/* 🚨 NOVA BARRA INTEGRADA COM SLOGAN E COPYRIGHT 🚨 */}
          <div style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
            marginTop: "16px", 
            paddingTop: "12px", 
            borderTop: "1px solid rgba(255,255,255,0.08)", 
            fontSize: "11px", 
            color: "var(--text)", 
            opacity: 0.6 
          }}>
            {/* Lado Esquerdo: Slogan do Sistema */}
            <div style={{ fontWeight: 700, letterSpacing: "0.5px", color: "var(--brand-teal)" }}>
              AZIMUTE - O teu Norte! O teu caminho!
            </div>
            
            {/* Lado Direito: Copyright */}
            <div>
              ©2026 João Taveira (Agrupamento 1104 - Paranhos) - Todos os direitos reservados
            </div>
          </div>

        </div>
      </div>

      {/* Corpo: Sidebar + Conteúdo (Grid Adaptável) */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", // Melhora a responsividade
        gap: 14, 
        alignItems: "start",
        flex: 1 // Faz com que o conteúdo empurre o footer para o fundo
      }}>
        
        {/* Sidebar (Fixamos largura apenas em ecrãs grandes via inline-style ou mantemos o teu original) */}
        <div className="az-card" style={{ gridColumn: "span 1", maxWidth: 260 }}>
          <div className="az-card-inner" style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 900, opacity: 0.6, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
              Navegação
            </div>

            <button className="az-btn" onClick={() => setView("dashboard")} style={btnStyle("dashboard")}>
              📍 Início
            </button>

            <button className="az-btn" onClick={() => setView("objetivos")} style={btnStyle("objetivos")}>
              🎯 Meus Objetivos
            </button>

            {/* Menu para Guia/Sub-Guia */}
            {canSeeGuiaGrupo && (
              <button className="az-btn" onClick={() => setView("guia_grupo")} style={btnStyle("guia_grupo")}>
                ⚜️ Progresso ({grupoLabel})
              </button>
            )}

            {/* Menu para Chefe de Unidade */}
            {canSeeSubunidades && (
              <button className="az-btn" onClick={() => setView("subunidades")} style={btnStyle("subunidades")}>
                ⛺ Gerir {grupoLabel}
              </button>
            )}

            {canSeeObjetivosSecao && (
              <button className="az-btn" onClick={() => setView("cu_objetivos")} style={btnStyle("cu_objetivos")}>
                📋 Objetivos ({secaoTitle})
              </button>
            )}

            <div className="az-divider" style={{ margin: "8px 0" }} />
            <div style={{ fontWeight: 900, opacity: 0.6, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
              Agrupamento
            </div>

            {/* NOVA SECÇÃO: Secretário */}
            {canSeeSecretarioAgrupamento && (
              <button className="az-btn" onClick={() => setView("secretario_agrupamento")} style={btnStyle("secretario_agrupamento")}>
                📧 Secretaria (Alertas)
              </button>
            )}

            {/* Menu para Chefe de Agrupamento */}
            {canSeeChefeAgrupamento && (
              <button className="az-btn" onClick={() => setView("chefe_agrupamento")} style={btnStyle("chefe_agrupamento")}>
                🏢 Adultos
              </button>
            )}

            <div className="az-divider" />
            <div style={{ opacity: 0.6, fontSize: 11, textAlign: "center" }}>
              {profile?.agrupamentoNome || profile?.agrupamentoId || "Agrupamento"}
            </div>
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className="az-card" style={{ gridColumn: "span 1" }}>
          <div className="az-card-inner">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
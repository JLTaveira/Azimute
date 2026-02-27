/* Grelha do Elemento
  src/pages/ElementoObjetivos.jsx
 2026-02-18 - Joao Taveira (jltaveira@gmail.com) */

// src/pages/ElementoObjetivos.jsx
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, getDoc, query, where, writeBatch, serverTimestamp, deleteDoc } from "firebase/firestore";
import { db, auth } from "../firebase";

const AREA_META = {
  FISICO: { nome: "Físico", bg: "#16a34a", text: "#ffffff", tint: "rgba(22,163,74,0.15)" },
  AFETIVO: { nome: "Afetivo", bg: "#dc2626", text: "#ffffff", tint: "rgba(220,38,38,0.15)" },
  CARACTER: { nome: "Caráter", bg: "#2563eb", text: "#ffffff", tint: "rgba(37,99,235,0.15)" },
  ESPIRITUAL: { nome: "Espiritual", bg: "#9333ea", text: "#ffffff", tint: "rgba(147,51,234,0.15)" },
  INTELECTUAL: { nome: "Intelectual", bg: "#ea580c", text: "#ffffff", tint: "rgba(234,88,12,0.15)" },
  SOCIAL: { nome: "Social", bg: "#eab308", text: "#000000", tint: "rgba(234,179,8,0.25)" },
};

const AREA_ORDER = ["FISICO", "AFETIVO", "CARACTER", "ESPIRITUAL", "INTELECTUAL", "SOCIAL"];
const ESTADOS = { DISPONIVEL: "DISPONIVEL", ESCOLHA: "ESCOLHA", VALIDADO: "VALIDADO", CONFIRMADO: "CONFIRMADO", REALIZADO: "REALIZADO", CONCLUIDO: "CONCLUIDO", RECUSADO: "RECUSADO" };

// Funções Auxiliares (Inalteradas)
function normKey(s) { return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase(); }
function areaToKey(a) { const k = normKey(a); if (k === "CARATER") return "CARACTER"; return AREA_META[k] ? k : "OUTRA"; }
function secaoFromSecaoDocId(s) { const str = String(s || "").toLowerCase(); if (str.includes("alcateia")) return "LOBITOS"; if (str.includes("expedicao")) return "EXPLORADORES"; if (str.includes("comunidade")) return "PIONEIROS"; if (str.includes("cla")) return "CAMINHEIROS"; return null; }
function estadoVisivelAoElemento(e) { return (e === ESTADOS.REALIZADO || e === ESTADOS.VALIDADO) ? "EM_ANALISE" : (e || ESTADOS.DISPONIVEL); }
function estadoLabel(e) { const map = { DISPONIVEL: "Disponível", EM_ANALISE: "Em análise", ESCOLHA: "Pendente (submetido)", CONFIRMADO: "Confirmado", CONCLUIDO: "Concluído", RECUSADO: "Recusado" }; return map[e] || e; }
function extrairCodigo(oid) { const m = String(oid || "").match(/_([A-Z]\d+)$/); return m ? m[1] : ""; }
function descCatalogo(o) { const d = String(o?.descricao || "").trim(); if (d) return d; const oe = String(o?.oportunidadeEducativa || "").trim(); const m = oe.match(/^[A-Z]\d+\s*-\s*(.*)$/); return m ? m[1] : oe; }
function getCicloId(d = new Date()) { const y = d.getFullYear(); const m = d.getMonth() + 1; const sy = m >= 10 ? y : y - 1; return `${sy}-${sy + 1}`; }

export default function ElementoObjetivos({ profile }) {
  // --- Estados Originais ---
  const [catalogo, setCatalogo] = useState([]);
  const [progresso, setProgresso] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [mostrarTudo, setMostrarTudo] = useState(false);
  const [activeArea, setActiveArea] = useState("FISICO");
  const [draftSet, setDraftSet] = useState(() => new Set());
  const [cicloMeta, setCicloMeta] = useState(null);

  // --- Novos Estados (Mural e Tabs) ---
  const [tabGlobal, setTabGlobal] = useState("MURAL"); // Abre no Mural por defeito
  const [mural, setMural] = useState([]);
  const [muralArquivado, setMuralArquivado] = useState([]);

  const uid = auth.currentUser?.uid;
  const secao = secaoFromSecaoDocId(profile?.secaoDocId);
  const souGuiaSub = profile?.tipo === "ELEMENTO" && (profile?.isGuia || profile?.isSubGuia);
  const cicloId = useMemo(() => getCicloId(new Date()), []);

  // Lógica de Saudação (Estilo Dirigente)
  const saudacaoNome = profile?.totem || profile?.nome?.split(" ")[0] || "Escuteiro";
  const detalheUnidade = `Clã ${profile?.secaoDocId?.split("_")[1] || "115"} • Agrupamento ${profile?.agrupamentoId?.split("_")[0] || "1104"} ${profile?.agrupamentoId?.split("_")[1] || "Paranhos"}`;

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!uid || !secao || !profile?.agrupamentoId || !profile?.secaoDocId) { setLoading(false); return; }
      setErr(""); setInfo(""); setLoading(true);
      try {
        // Carregamento Original
        const catSnap = await getDocs(query(collection(db, "catalogoObjetivos"), where("secao", "==", secao)));
        const progSnap = await getDocs(collection(db, "users", uid, "objetivos"));
        const metaSnap = await getDoc(doc(db, "users", uid, "meta", "cicloProgresso"));

        // Carregamento do Mural (Apenas MURAL)
        const qMural = query(
          collection(db, "oportunidades_agrupamento"),
          where("agrupamentoId", "==", profile.agrupamentoId),
          where("secaoDocId", "==", profile.secaoDocId),
          where("destinatarios", "==", "MURAL")
        );
        const muralSnap = await getDocs(qMural);
        const todasOps = muralSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (!alive) return;
        setCatalogo(catSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setProgresso(progSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setCicloMeta(metaSnap.exists() ? metaSnap.data() : null);

        // Define Mural
        setMural(todasOps.filter(o => !o.arquivada));
        setMuralArquivado(todasOps.filter(o => o.arquivada));

      } catch (e) { if (alive) setErr("Erro ao carregar dados: " + e.message); } 
      finally { if (alive) setLoading(false); }
    }
    load();
    return () => { alive = false; };
  }, [uid, secao, profile?.agrupamentoId, profile?.secaoDocId]);

  // --- Lógica de Memo dos Objetivos (Inalterada) ---
  const progressoById = useMemo(() => { const m = new Map(); for (const p of progresso) m.set(p.id, p); return m; }, [progresso]);

  const mergedItems = useMemo(() => catalogo.map(o => {
    const p = progressoById.get(o.id);
    const estadoRaw = p?.estado || ESTADOS.DISPONIVEL;
    const bloqueado = !!p && (p.submetidoAt != null || [ESTADOS.VALIDADO, ESTADOS.REALIZADO, ESTADOS.CONFIRMADO, ESTADOS.CONCLUIDO].includes(estadoRaw));
    return {
      ...o, _oid: o.id, _codigo: extrairCodigo(o.id), _descricao: descCatalogo(o), _areaKey: areaToKey(o.areaDesenvolvimento),
      _trilho: o.trilhoEducativo || "Sem trilho", _estadoRaw: estadoRaw, _estado: estadoVisivelAoElemento(estadoRaw),
      _bloqueado: bloqueado, _podeSelecionar: (!p || estadoRaw === ESTADOS.RECUSADO) && !bloqueado,
    };
  }), [catalogo, progressoById]);

  const items = useMemo(() => mostrarTudo ? mergedItems : mergedItems.filter(x => [ESTADOS.ESCOLHA, "EM_ANALISE", ESTADOS.CONFIRMADO, ESTADOS.CONCLUIDO, ESTADOS.RECUSADO].includes(x._estado)), [mergedItems, mostrarTudo]);

  const grouped = useMemo(() => {
    const res = new Map(AREA_ORDER.map(a => [a, new Map()]));
    for (const it of items) {
      if (!res.has(it._areaKey)) continue;
      const mm = res.get(it._areaKey);
      if (!mm.has(it._trilho)) mm.set(it._trilho, []);
      mm.get(it._trilho).push(it);
    }
    for (const mm of res.values()) {
      for (const arr of mm.values()) arr.sort((a, b) => String(a._codigo).localeCompare(String(b._codigo), "pt-PT", { numeric: true }));
    }
    return res;
  }, [items]);

  const trilhosAtivos = useMemo(() => Array.from(grouped.get(activeArea)?.entries() || []), [grouped, activeArea]);
  const isVazia = trilhosAtivos.length === 0 || trilhosAtivos.every(([, arr]) => arr.length === 0);
  const draftItems = useMemo(() => mergedItems.filter(x => draftSet.has(x._oid)), [draftSet, mergedItems]);
  const isPrimeiraSubmissao = !cicloMeta || cicloMeta.cicloId !== cicloId || !cicloMeta.firstSubmittedAt;

  // --- Função Submeter (Inalterada) ---
  async function submeter() {
    if (draftItems.length === 0) return;
    if (isPrimeiraSubmissao) {
      const counts = draftItems.reduce((acc, it) => { acc[it._areaKey] = (acc[it._areaKey] || 0) + 1; return acc; }, {});
      const missing = AREA_ORDER.filter(a => !counts[a]).map(a => AREA_META[a]?.nome);
      if (missing.length > 0) { setErr(`Exige 1 objetivo por área. Falta: ${missing.join(", ")}`); return; }
    }
    setErr(""); setInfo("");
    try {
      const batch = writeBatch(db);
      draftItems.forEach(it => {
        const st = souGuiaSub ? ESTADOS.VALIDADO : ESTADOS.ESCOLHA;
        const payload = { oportunidadeId: it._oid, secao, estado: st, bloqueado: false, escolhidoAt: serverTimestamp(), submetidoAt: serverTimestamp(), updatedAt: serverTimestamp() };
        if (souGuiaSub) payload.validadoAt = serverTimestamp();
        batch.set(doc(db, "users", uid, "objetivos", it._oid), payload, { merge: true });
      });
      batch.set(doc(db, "users", uid, "meta", "cicloProgresso"), isPrimeiraSubmissao ? { cicloId, firstSubmittedAt: serverTimestamp(), updatedAt: serverTimestamp() } : { updatedAt: serverTimestamp() }, { merge: true });
      await batch.commit();
      setProgresso(prev => [...prev.filter(p => !draftSet.has(p.id)), ...draftItems.map(it => ({ id: it._oid, estado: souGuiaSub ? ESTADOS.VALIDADO : ESTADOS.ESCOLHA, submetidoAt: new Date() }))]);
      setDraftSet(new Set());
      setInfo("Proposta submetida com sucesso!");
      setTimeout(() => setInfo(""), 4000);
    } catch (e) { setErr(e.message); }
  }

  if (loading) return <div className="az-panel" style={{ textAlign: "center", padding: "40px" }}><p className="az-muted">A preparar o teu plano...</p></div>;

  return (
    <div className="az-grid" style={{ gap: 24 }}>
      
      {/* HEADER DE SAUDAÇÃO (Igual ao Dirigente) */}
      <div className="az-card" style={{ background: "linear-gradient(135deg, rgba(0, 150, 136, 0.1) 0%, rgba(0,0,0,0) 100%)" }}>
        <div className="az-card-inner">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <div>
              <h1 className="az-h1" style={{ fontSize: "2rem", marginBottom: 4 }}>
                Boa caça, {saudacaoNome}! 🏕️
              </h1>
              <div className="az-small" style={{ opacity: 0.8, fontWeight: 600 }}>
                {detalheUnidade}
              </div>
            </div>
            
            {tabGlobal === "MURAL" && (
              <button onClick={() => setTabGlobal("OBJETIVOS")} className="az-btn az-btn-teal" style={{ padding: "12px 24px", fontWeight: 700 }}>
                🎯 Gerir Meus Objetivos
              </button>
            )}
          </div>
        </div>
      </div>

      {/* NAVEGAÇÃO DE TABS GLOBAIS */}
      <div className="az-tabs-container" style={{ display: "flex", gap: 8 }}>
        <button 
          onClick={() => setTabGlobal("MURAL")}
          className={`az-tab-pill ${tabGlobal === "MURAL" ? "active" : ""}`}
          style={{
            padding: "8px 20px", borderRadius: "24px", cursor: "pointer",
            border: tabGlobal === "MURAL" ? "1px solid var(--brand-teal)" : "1px solid transparent",
            background: tabGlobal === "MURAL" ? "rgba(0, 150, 136, 0.15)" : "transparent",
            color: tabGlobal === "MURAL" ? "#fff" : "var(--text-muted)",
            fontWeight: 700
          }}
        >
          📢 Mural da Unidade
        </button>
        <button 
          onClick={() => setTabGlobal("OBJETIVOS")}
          className={`az-tab-pill ${tabGlobal === "OBJETIVOS" ? "active" : ""}`}
          style={{
            padding: "8px 20px", borderRadius: "24px", cursor: "pointer",
            border: tabGlobal === "OBJETIVOS" ? "1px solid var(--brand-teal)" : "1px solid transparent",
            background: tabGlobal === "OBJETIVOS" ? "rgba(0, 150, 136, 0.15)" : "transparent",
            color: tabGlobal === "OBJETIVOS" ? "#fff" : "var(--text-muted)",
            fontWeight: 700
          }}
        >
          🎯 Meus Objetivos
        </button>
      </div>

      {/* --- CONTEÚDO CONDICIONAL --- */}
      
      {tabGlobal === "MURAL" ? (
        <div className="animate-fade-in">
          <div className="az-panel" style={{ background: "rgba(255,255,255,0.05)", padding: "12px 20px", borderRadius: "12px", marginBottom: 16 }}>
             <h3 style={{ margin: 0, color: "#fff", fontSize: "16px" }}>📢 O que anda a acontecer por aí?</h3>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {mural.length === 0 ? (
              <div className="az-panel" style={{ textAlign: "center", padding: "60px 20px" }}>
                <div style={{ fontSize: 40, opacity: 0.3, marginBottom: 16 }}>🍃</div>
                <p className="az-muted">O mural está calmo por agora. <br/>Aguardamos novas comunicações da Chefia!</p>
              </div>
            ) : (
              mural.map(op => (
                <div key={op.id} style={{
                  background: "#121212", border: "1px solid #1a2a2a", borderTop: "3px solid var(--brand-teal)",
                  borderRadius: "12px", padding: "24px"
                }}>
                  <h4 style={{ color: "#ff8a00", margin: "0 0 12px 0", fontSize: "1.1rem" }}>{op.titulo}</h4>
                  <div 
                    style={{ color: "#ccc", fontSize: "0.95rem", lineHeight: "1.6" }} 
                    dangerouslySetInnerHTML={{ __html: op.descricao }} 
                  />
                  {op.link && (
                    <div style={{ marginTop: 20, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 16 }}>
                      <a href={op.link} target="_blank" rel="noreferrer" style={{ color: "#4a90e2", textDecoration: "none", fontWeight: 600 }}>
                        Ver Detalhes 🔗
                      </a>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* --- ABA DE OBJETIVOS (Toda a tua lógica original aqui dentro) --- */
        <div className="animate-fade-in az-grid" style={{ gap: 24 }}>
          <div className="az-card">
            <div className="az-card-inner az-row" style={{ justifyContent: "space-between" }}>
              <div><h2 className="az-h2">🎯 O Meu Caminho</h2><div className="az-small az-muted"><b>Secção:</b> {secao || "—"} • <b>Ciclo:</b> {cicloId}</div></div>
              <button className={`az-btn ${mostrarTudo ? "az-btn-teal" : ""}`} style={{ fontWeight: 800 }} onClick={() => setMostrarTudo(!mostrarTudo)}>
                {mostrarTudo ? "👁 Ver Todo o Catálogo" : "🔍 Ver só Ativos"}
              </button>
            </div>
          </div>

          {err && <div className="az-error-msg">{err}</div>}
          {info && <div className="az-alert az-alert--ok" style={{ background: "rgba(22,163,74,0.15)", color: "#4ade80", padding: 12, borderRadius: 8 }}>{info}</div>}

          <div className="az-card" style={{ borderColor: draftItems.length > 0 ? "var(--brand-teal)" : "var(--stroke)" }}>
            <div className="az-card-inner">
              <div className="az-row" style={{ justifyContent: "space-between" }}>
                <div style={{ fontWeight: 800 }}>📥 {draftItems.length} objetivo(s)</div>
                <button onClick={submeter} disabled={draftItems.length === 0} className={`az-btn ${draftItems.length > 0 ? "az-btn-primary" : ""}`} style={{ fontWeight: 800 }}>Submeter Proposta</button>
              </div>
            </div>
          </div>

          <div className="az-tabs">
            {AREA_ORDER.map(a => {
              const isActive = activeArea === a;
              const meta = AREA_META[a];
              return (
                <button key={a} className="az-tab" onClick={() => setActiveArea(a)} style={{
                  background: isActive ? meta.bg : "rgba(255,255,255,0.05)",
                  color: isActive ? meta.text : "var(--muted)",
                  border: `1px solid ${isActive ? meta.bg : "transparent"}`,
                  fontWeight: isActive ? 800 : 600,
                  boxShadow: isActive ? `0 4px 12px ${meta.tint}` : "none"
                }}>
                  {meta.nome}
                </button>
              )
            })}
          </div>

          <div className="az-grid" style={{ gap: 16 }}>
            {trilhosAtivos.map(([trilho, arrObjetivos]) => {
              if (!arrObjetivos.length) return null;
              const metaAtiva = AREA_META[activeArea];
              return (
                <div key={trilho} className="az-card">
                  <div className="az-card-inner">
                    <h3 style={{ margin: "0 0 16px 0", borderBottom: "1px solid var(--stroke)", paddingBottom: 8 }}>{trilho}</h3>
                    <div className="az-grid-2">
                      {arrObjetivos.map((o) => {
                        const selected = draftSet.has(o._oid);
                        const estado = o._estado;
                        return (
                          <div key={o._oid} className="az-panel az-panel-sm" style={{ outline: selected ? `2px solid ${metaAtiva.bg}` : "none" }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span className="az-pill" style={{ background: metaAtiva.bg, color: metaAtiva.text, border: "none" }}>{o._codigo}</span>
                              <span className="az-pill" style={{ background: estado === ESTADOS.CONCLUIDO ? "rgba(22,163,74,0.15)" : "rgba(15,23,42,0.06)", color: estado === ESTADOS.CONCLUIDO ? "#16a34a" : "#334155", border: "none" }}>
                                {estadoLabel(estado)}
                              </span>
                            </div>
                            <div style={{ marginTop: 12, fontWeight: 600 }}>{o._descricao}</div>
                            <div className="az-divider" style={{ margin: "12px 0", borderColor: "rgba(15,23,42,0.1)" }} />
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {o._podeSelecionar && (
                                <button onClick={() => setDraftSet(p => { const n = new Set(p); n.has(o._oid) ? n.delete(o._oid) : n.add(o._oid); return n; })} className="az-btn" style={{
                                  padding: "6px 12px", fontSize: 13, fontWeight: 800,
                                  background: selected ? "rgba(220,38,38,0.1)" : metaAtiva.bg,
                                  color: selected ? "#dc2626" : metaAtiva.text,
                                  borderColor: selected ? "#dc2626" : "transparent"
                                }}>
                                  {selected ? "🚫 Remover" : "➕ Adicionar à Proposta"}
                                </button>
                              )}
                              {estado === ESTADOS.ESCOLHA && !o._bloqueado && (
                                <button className="az-btn" style={{ padding: "6px 12px", fontSize: 13, background: "rgba(220,38,38,0.1)", color: "#dc2626", border: "none" }} onClick={async () => { if(window.confirm("Cancelar proposta?")){ await deleteDoc(doc(db, "users", uid, "objetivos", o._oid)); setProgresso(p => p.filter(x => x.id !== o._oid)); }}}>
                                  Cancelar
                                </button>
                              )}
                              {(estado === "EM_ANALISE" || estado === ESTADOS.CONFIRMADO || estado === ESTADOS.CONCLUIDO) && <span className="az-small" style={{ color: "#64748b" }}>🔒 Bloqueado pela Chefia</span>}
                              {estado === ESTADOS.RECUSADO && <span className="az-small" style={{ color: "#ea580c", fontWeight: 800 }}>⚠️ Podes propor novamente</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
            {isVazia && (
              <div className="az-card" style={{ borderStyle: "dashed", borderColor: AREA_META[activeArea]?.bg || "var(--stroke)" }}>
                <div className="az-card-inner" style={{ textAlign: "center", padding: "40px" }}><div style={{ fontSize: 32, opacity: 0.5 }}>🍃</div><p className="az-muted">Nenhum objetivo nesta área.</p></div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
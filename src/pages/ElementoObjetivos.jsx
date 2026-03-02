/* Grelha do Elemento
  src/pages/ElementoObjetivos.jsx
 2026-02-18 - Joao Taveira (jltaveira@gmail.com) */

// src/pages/ElementoObjetivos.jsx
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, getDoc, query, where, writeBatch, serverTimestamp, deleteDoc, updateDoc } from "firebase/firestore";
import { db, auth } from "../firebase";

const AREA_META = {
  FISICO: { nome: "Físico", bg: "#16a34a", text: "#ffffff", tint: "rgba(22,163,74,0.15)" },
  AFETIVO: { nome: "Afetivo", bg: "#dc2626", text: "#ffffff", tint: "rgba(220,38,38,0.15)" },
  CARACTER: { nome: "Caráter", bg: "#2563eb", text: "#ffffff", tint: "rgba(37,99,235,0.15)" },
  ESPIRITUAL: { nome: "Espiritual", bg: "#9333ea", text: "#ffffff", tint: "rgba(147,51,234,0.15)" },
  INTELECTUAL: { nome: "Intelectual", bg: "#ea580c", text: "#ffffff", tint: "rgba(234,88,12,0.15)" },
  SOCIAL: { nome: "Social", bg: "#eab308", text: "#000000", tint: "rgba(234,179,8,0.25)" },
};

const ESTADO_CORES = {
  CONCLUIDO: { bg: "var(--brand-green)", color: "#fff", border: "none" },
  CONFIRMADO: { bg: "#0ea5e9", color: "#fff", border: "none" },
  REALIZADO: { bg: "#8b5cf6", color: "#fff", border: "none" },
  VALIDADO: { bg: "var(--brand-teal)", color: "#fff", border: "none" },
  ESCOLHA: { bg: "rgba(23,154,171,0.2)", color: "var(--brand-teal)", border: "1px solid var(--brand-teal)" },
  RECUSADO: { bg: "rgba(236,131,50,0.2)", color: "var(--brand-orange)", border: "1px dashed var(--brand-orange)" },
  NONE: { bg: "rgba(255,255,255,0.05)", color: "var(--muted)", border: "1px dashed rgba(255,255,255,0.2)" }
};

const AREA_ORDER = ["FISICO", "AFETIVO", "CARACTER", "ESPIRITUAL", "INTELECTUAL", "SOCIAL"];
const ESTADOS = { DISPONIVEL: "DISPONIVEL", ESCOLHA: "ESCOLHA", VALIDADO: "VALIDADO", CONFIRMADO: "CONFIRMADO", REALIZADO: "REALIZADO", CONCLUIDO: "CONCLUIDO", RECUSADO: "RECUSADO" };

// Funções Auxiliares
function normKey(s) { return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase(); }
function areaToKey(a) { const k = normKey(a); if (k === "CARATER") return "CARACTER"; return AREA_META[k] ? k : "OUTRA"; }
function secaoFromSecaoDocId(s) { const str = String(s || "").toLowerCase(); if (str.includes("alcateia")) return "LOBITOS"; if (str.includes("expedicao")) return "EXPLORADORES"; if (str.includes("comunidade")) return "PIONEIROS"; if (str.includes("cla")) return "CAMINHEIROS"; return null; }
function estadoVisivelAoElemento(e) { return (e === ESTADOS.REALIZADO || e === ESTADOS.VALIDADO) ? "EM_ANALISE" : (e || ESTADOS.DISPONIVEL); }
function estadoLabel(e) { const map = { DISPONIVEL: "Disponível", EM_ANALISE: "Em análise", ESCOLHA: "Pendente (submetido)", CONFIRMADO: "Confirmado", CONCLUIDO: "Concluído", RECUSADO: "Recusado" }; return map[e] || e; }
function extrairCodigo(oid) { const m = String(oid || "").match(/_([A-Z]\d+)$/); return m ? m[1] : ""; }
function descCatalogo(o) { const d = String(o?.descricao || "").trim(); if (d) return d; const oe = String(o?.oportunidadeEducativa || "").trim(); const m = oe.match(/^[A-Z]\d+\s*-\s*(.*)$/); return m ? m[1] : oe; }
function getCicloId(d = new Date()) { const y = d.getFullYear(); const m = d.getMonth() + 1; const sy = m >= 10 ? y : y - 1; return `${sy}-${sy + 1}`; }

export default function ElementoObjetivos({ profile }) {
  const [catalogo, setCatalogo] = useState([]);
  const [progresso, setProgresso] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [mostrarTudo, setMostrarTudo] = useState(false);
  const [activeArea, setActiveArea] = useState("FISICO");
  const [draftSet, setDraftSet] = useState(() => new Set());
  const [cicloMeta, setCicloMeta] = useState(null);
  const [felicitacoes, setFelicitacoes] = useState([]);

  const uid = auth.currentUser?.uid;
  const secao = secaoFromSecaoDocId(profile?.secaoDocId);
  const souGuiaSub = profile?.tipo === "ELEMENTO" && (profile?.isGuia || profile?.isSubGuia);
  const cicloId = useMemo(() => getCicloId(new Date()), []);

  const saudacaoNome = profile?.totem || profile?.nome?.split(" ")[0] || "Escuteiro";
  const detalheUnidade = `${profile?.secaoDocId?.replace(/[0-9]/g, '').toUpperCase()} • Agrupamento ${profile?.agrupamentoId?.split("_")[0] || "CNE"}`;

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!uid || !secao || !profile?.agrupamentoId || !profile?.secaoDocId) { setLoading(false); return; }
      setErr(""); setInfo(""); setLoading(true);
      try {
        const catSnap = await getDocs(query(collection(db, "catalogoObjetivos"), where("secao", "==", secao)));
        const progSnap = await getDocs(collection(db, "users", uid, "objetivos"));
        const metaSnap = await getDoc(doc(db, "users", uid, "meta", "cicloProgresso"));

        const qFelicita = query(
          collection(db, "notificacoes"),
          where("uidElemento", "==", uid),
          where("tipoAcao", "==", "FELICITACAO"),
          where("resolvida", "==", false)
        );
        const felicitaSnap = await getDocs(qFelicita);

        if (!alive) return;

        setCatalogo(catSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setProgresso(progSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setCicloMeta(metaSnap.exists() ? metaSnap.data() : null);
        setFelicitacoes(felicitaSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      } catch (e) { if (alive) setErr("Erro ao carregar dados: " + e.message); } 
      finally { if (alive) setLoading(false); }
    }
    load();
    return () => { alive = false; };
  }, [uid, secao, profile?.agrupamentoId, profile?.secaoDocId, progresso.length]); 
    
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

  const items = useMemo(() => {
    return mostrarTudo 
      ? mergedItems 
      : mergedItems.filter(x => [ESTADOS.ESCOLHA, ESTADOS.VALIDADO, ESTADOS.CONFIRMADO, ESTADOS.REALIZADO, ESTADOS.RECUSADO].includes(x._estadoRaw));
  }, [mergedItems, mostrarTudo]);

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
      
      {/* 1. HEADER DE SAUDAÇÃO */}
      <div className="az-card" style={{ background: "linear-gradient(135deg, rgba(0, 150, 136, 0.1) 0%, rgba(0,0,0,0) 100%)" }}>
        <div className="az-card-inner">
          <h1 className="az-h1" style={{ fontSize: "2rem", marginBottom: 4 }}>Boa caça, {saudacaoNome}! 🏕️</h1>
          <div className="az-small" style={{ opacity: 0.8, fontWeight: 600 }}>{detalheUnidade}</div>
        </div>
      </div>

      {/* 2. BLOCO DE FELICITAÇÕES (Aparece apenas se existirem) */}
      {felicitacoes.map(f => {
        let icone = "⚜️"; let lema = "Sempre Alerta";
        if (secao === "LOBITOS") { icone = "🐺"; lema = "Da Melhor Vontade"; } 
        else if (secao === "CAMINHEIROS") { lema = "Sempre Alerta para Servir"; }

        return (
          <div key={f.id} className="az-card animate-fade-in" style={{ background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)", border: "2px solid var(--brand-teal)", marginBottom: 20 }}>
            <div className="az-card-inner" style={{ textAlign: "center", padding: "30px" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "15px" }}>🎉 {icone}</div>
              <p style={{ fontSize: "1.15rem", lineHeight: "1.6", color: "#fff", marginBottom: "24px", fontWeight: 500 }}>{f.descricao}</p>
              <button className="az-btn az-btn-teal" style={{ fontWeight: 800, padding: "12px 32px" }} onClick={async () => {
                  try {
                    await updateDoc(doc(db, "notificacoes", f.id), { resolvida: true, resolvidaAt: serverTimestamp() });
                    setFelicitacoes(prev => prev.filter(item => item.id !== f.id));
                  } catch (e) { console.error(e); }
                }}>
                {lema}
              </button>
            </div>
          </div>
        );
      })}

      {/* 3. CONTEÚDO DOS OBJETIVOS */}
      <div className="animate-fade-in az-grid" style={{ gap: 24 }}>
        
        {/* Título e Botão de Filtro */}
        <div className="az-card">
          <div className="az-card-inner az-row" style={{ justifyContent: "space-between" }}>
            <div>
              <h2 className="az-h2" style={{margin: 0}}>🎯 A minha Pista</h2>
              <div className="az-small az-muted">Ciclo: {cicloId}</div>
            </div>
            <button className={`az-btn ${mostrarTudo ? "az-btn-teal" : ""}`} style={{ fontWeight: 800 }} onClick={() => setMostrarTudo(!mostrarTudo)}>
              {mostrarTudo ? "👁 Ver Apenas Ativos" : "🔍 Ver Todo o Catálogo"}
            </button>
          </div>
        </div>

        {/* Resumo do Progresso */}
        <div className="az-card" style={{ marginBottom: 8 }}>
          <div className="az-card-inner">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 className="az-h3" style={{ margin: 0, fontSize: '1rem' }}>📊 Resumo F.A.C.E.I.S.</h3>
              <span className="az-pill" style={{ background: 'var(--brand-teal)', color: '#fff', fontSize: '10px' }}>
                {progresso.filter(p => p.estado === "CONCLUIDO").length} concluídos
              </span>
            </div>
            <div className="az-grid" style={{ gap: 10 }}>
              {AREA_ORDER.map(a => {
                const catItems = catalogo.filter(c => areaToKey(c.areaDesenvolvimento) === a);
                if (!catItems.length) return null;
                return (
                  <div key={a} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ width: 100, fontSize: 10, fontWeight: 900, color: AREA_META[a].bg, textTransform: "uppercase" }}>{AREA_META[a].nome}</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", flex: 1 }}>
                      {catItems.sort((x, y) => extrairCodigo(x.id).localeCompare(extrairCodigo(y.id), undefined, {numeric: true})).map(c => {
                        const p = progresso.find(pr => pr.id === c.id);
                        const st = ESTADO_CORES[p?.estado || "NONE"];
                        return <div key={c.id} title={`${extrairCodigo(c.id)} - ${descCatalogo(c)}`} style={{ background: st.bg, color: st.color, border: st.border, padding: "3px 8px", fontSize: 10, fontWeight: 800, borderRadius: 4 }}>{extrairCodigo(c.id)}</div>;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Alertas e Proposta */}
        {err && <div className="az-alert az-alert--error">{err}</div>}
        {info && <div className="az-alert az-alert--ok">{info}</div>}

        <div className="az-card" style={{ borderColor: draftItems.length > 0 ? "var(--brand-teal)" : "var(--stroke)" }}>
          <div className="az-card-inner az-row" style={{ justifyContent: "space-between" }}>
            <div style={{ fontWeight: 800 }}>📥 {draftItems.length} objetivo(s) selecionados</div>
            <button onClick={submeter} disabled={draftItems.length === 0} className={`az-btn ${draftItems.length > 0 ? "az-btn-primary" : ""}`} style={{ fontWeight: 800 }}>Submeter Proposta</button>
          </div>
        </div>

        {/* Tabs de Seleção de Áreas */}
        <div className="az-tabs">
          {AREA_ORDER.map(a => (
            <button key={a} className="az-tab" onClick={() => setActiveArea(a)} style={{
              background: activeArea === a ? AREA_META[a].bg : "rgba(255,255,255,0.05)",
              color: activeArea === a ? AREA_META[a].text : "var(--muted)",
              fontWeight: activeArea === a ? 800 : 600,
              border: "none"
            }}>{AREA_META[a].nome}</button>
          ))}
        </div>

        {/* Grelha de Objetivos do Catálogo */}
        <div className="az-grid" style={{ gap: 16 }}>
          {trilhosAtivos.map(([trilho, arrObjetivos]) => (
            <div key={trilho} className="az-card">
              <div className="az-card-inner">
                <h3 style={{ margin: "0 0 16px 0", borderBottom: "1px solid var(--stroke)", paddingBottom: 8 }}>{trilho}</h3>
                <div className="az-grid-2">
                  {arrObjetivos.map((o) => {
                    const selected = draftSet.has(o._oid);
                    const metaAtiva = AREA_META[activeArea];
                    return (
                      <div key={o._oid} className="az-panel az-panel-sm" style={{ outline: selected ? `2px solid ${metaAtiva.bg}` : "none" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span className="az-pill" style={{ background: metaAtiva.bg, color: metaAtiva.text, border: "none" }}>{o._codigo}</span>
                          <span className="az-pill" style={{ background: "rgba(255,255,255,0.05)", fontSize: 10 }}>{estadoLabel(o._estado)}</span>
                        </div>
                        <div style={{ marginTop: 12, fontWeight: 600, fontSize: 13 }}>{o._descricao}</div>
                        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                          {o._podeSelecionar && (
                            <button onClick={() => setDraftSet(p => { const n = new Set(p); n.has(o._oid) ? n.delete(o._oid) : n.add(o._oid); return n; })} className="az-btn" style={{ padding: "6px 12px", fontSize: 11, background: selected ? "#dc2626" : metaAtiva.bg, color: "#fff" }}>
                              {selected ? "🚫 Remover" : "➕ Propor"}
                            </button>
                          )}
                          {o._estado === ESTADOS.ESCOLHA && (
                            <button className="az-btn" style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626", border: "none", fontSize: 11 }} onClick={async () => { if(window.confirm("Anular proposta?")){ await deleteDoc(doc(db, "users", uid, "objetivos", o._oid)); setProgresso(p => p.filter(x => x.id !== o._oid)); }}}>Anular</button>
                          )}
                          {o._bloqueado && o._estado !== ESTADOS.ESCOLHA && <span className="az-small muted">🔒 Validado/Concluído</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
          {isVazia && <div className="az-panel az-muted" style={{textAlign: "center", padding: 40}}>Nenhum objetivo disponível para mostrar nesta área.</div>}
        </div>
      </div>
    </div>
  );
}
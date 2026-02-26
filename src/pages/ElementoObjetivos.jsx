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

  const uid = auth.currentUser?.uid;
  const secao = secaoFromSecaoDocId(profile?.secaoDocId);
  const souGuiaSub = profile?.tipo === "ELEMENTO" && (profile?.isGuia || profile?.isSubGuia);
  const cicloId = useMemo(() => getCicloId(new Date()), []);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!uid || !secao) { setLoading(false); return; }
      setErr(""); setInfo(""); setLoading(true);
      try {
        const catSnap = await getDocs(query(collection(db, "catalogoObjetivos"), where("secao", "==", secao)));
        const progSnap = await getDocs(collection(db, "users", uid, "objetivos"));
        const metaSnap = await getDoc(doc(db, "users", uid, "meta", "cicloProgresso"));
        if (!alive) return;
        setCatalogo(catSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setProgresso(progSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setCicloMeta(metaSnap.exists() ? metaSnap.data() : null);
      } catch (e) { if (alive) setErr("Erro ao carregar dados: " + e.message); } 
      finally { if (alive) setLoading(false); }
    }
    load();
    return () => { alive = false; };
  }, [uid, secao]);

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
  );
}
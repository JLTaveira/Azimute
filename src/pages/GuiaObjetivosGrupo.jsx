/* Guia/Sub-Guia
  src/pages/GuiaObjetivosGrupo.jsx
  2026-02-20 - Joao Taveira (jltaveira@gmail.com) 
  2026-02-27 - MuralOportunidades
 */

import { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import MuralOportunidades from "../components/MuralOportunidades";

const AREA_META = {
  FISICO: { nome: "Físico", bg: "#16a34a", text: "#ffffff" },
  AFETIVO: { nome: "Afetivo", bg: "#dc2626", text: "#ffffff" },
  CARACTER: { nome: "Caráter", bg: "#2563eb", text: "#ffffff" },
  ESPIRITUAL: { nome: "Espiritual", bg: "#9333ea", text: "#ffffff" },
  INTELECTUAL: { nome: "Intelectual", bg: "#ea580c", text: "#ffffff" },
  SOCIAL: { nome: "Social", bg: "#eab308", text: "#000000" },
};

// Ordem das áreas para a grelha visual
const AREA_ORDER = ["FISICO", "AFETIVO", "CARACTER", "ESPIRITUAL", "INTELECTUAL", "SOCIAL"];

// Cores para os estados (Consistente com Chefe e Elemento)
const ESTADO_CORES = {
  CONCLUIDO: { bg: "var(--brand-green)", color: "#fff", border: "none" },
  CONFIRMADO: { bg: "#0ea5e9", color: "#fff", border: "none" },
  REALIZADO: { bg: "#8b5cf6", color: "#fff", border: "none" },
  VALIDADO: { bg: "var(--brand-teal)", color: "#fff", border: "none" },
  ESCOLHA: { bg: "rgba(23,154,171,0.2)", color: "var(--brand-teal)", border: "1px solid var(--brand-teal)" },
  RECUSADO: { bg: "rgba(236,131,50,0.2)", color: "var(--brand-orange)", border: "1px dashed var(--brand-orange)" },
  NONE: { bg: "rgba(255,255,255,0.05)", color: "var(--muted)", border: "1px dashed rgba(255,255,255,0.2)" }
};

// Funções Auxiliares (Aproveitando as que já tinhas)
function areaToKey(a) {
  const k = String(a || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (k === "CARATER") return "CARACTER";
  return AREA_META[k] ? k : "OUTRA";
}

function secaoFromSecaoDocId(secaoDocId) {
  const s = String(secaoDocId || "").toLowerCase();
  if (s.includes("alcateia")) return "LOBITOS";
  if (s.includes("expedicao")) return "EXPLORADORES";
  if (s.includes("comunidade")) return "PIONEIROS";
  if (s.includes("cla")) return "CAMINHEIROS";
  return null;
}

// Termo dinâmico para a subunidade
function getTermoGrupo(secaoDocId) {
  const s = String(secaoDocId || "").toLowerCase();
  if (s.includes("alcateia")) return "Bando";
  if (s.includes("expedicao")) return "Patrulha";
  if (s.includes("comunidade")) return "Equipa";
  if (s.includes("cla")) return "Tribo";
  return "Subunidade";
}

function extrairCodigoFromOid(oid) {
  const m = String(oid || "").match(/_([A-Z]\d+)$/);
  return m ? m[1] : "";
}

function descricaoDoCatalogo(o) {
  const desc = String(o?.descricao || "").trim();
  if (desc) return desc;
  const oe = String(o?.oportunidadeEducativa || "").trim();
  const m = oe.match(/^[A-Z]\d+\s*-\s*(.*)$/);
  return m ? m[1] : oe;
}

export default function GuiaObjetivosGrupo({ profile }) {
  const [tabAtual, setTabAtual] = useState("VALIDAR");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [elementos, setElementos] = useState([]);
  const [objetivos, setObjetivos] = useState([]);
  const [catalogo, setCatalogo] = useState([]);

  const secaoBase = secaoFromSecaoDocId(profile?.secaoDocId);
  const termoGrupo = useMemo(() => getTermoGrupo(profile?.secaoDocId), [profile]);

  useEffect(() => {
    if (!profile?.patrulhaId || !profile?.secaoDocId) return;

    async function fetchData() {
      setLoading(true);
      setErro("");
      try {
        const qCat = query(collection(db, "catalogoObjetivos"), where("secao", "==", secaoBase));
        const snapCat = await getDocs(qCat);
        const cat = snapCat.docs.map(d => ({
          id: d.id,
          _areaKey: areaToKey(d.data().areaDesenvolvimento || d.data().area),
          _trilho: d.data().trilhoEducativo || d.data().trilho || "Geral",
          _codigo: d.data().codigo || extrairCodigoFromOid(d.id),
          _titulo: descricaoDoCatalogo(d.data()),
          ...d.data(),
        }));
        setCatalogo(cat);

        const qUsers = query(
          collection(db, "users"),
          where("agrupamentoId", "==", profile.agrupamentoId),
          where("secaoDocId", "==", profile.secaoDocId),
          where("patrulhaId", "==", profile.patrulhaId),
          where("tipo", "==", "ELEMENTO")
        );
        const snapUsers = await getDocs(qUsers);
        const listaElementos = snapUsers.docs
          .map(d => ({ uid: d.id, ...d.data() }))
          .filter(u => u.uid !== profile.uid && u.ativo !== false);
        setElementos(listaElementos.sort((a, b) => a.nome.localeCompare(b.nome)));

        // BUSCA TODOS OS OBJETIVOS (Para poder desenhar a grelha de progresso)
        const todosObjetivos = [];
        await Promise.all(
          listaElementos.map(async elemento => {
            const snapObjs = await getDocs(collection(db, `users/${elemento.uid}/objetivos`));
            snapObjs.forEach(objSnap => {
              todosObjetivos.push({
                uid: elemento.uid,
                docId: objSnap.id,
                ...objSnap.data(),
              });
            });
          })
        );
        setObjetivos(todosObjetivos);
      } catch (err) {
        setErro("Erro ao carregar os dados da unidade.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [profile, secaoBase]);

  const objetivosEnriquecidos = useMemo(() => {
    return objetivos.map(obj => {
      const catItem = catalogo.find(c => c.id === obj.docId) || {};
      return { ...obj, ...catItem };
    });
  }, [objetivos, catalogo]);

  // Handlers (Inalterados conforme o teu código)
  async function handleValidar(uid, docId, titulo) {
    if (!window.confirm(`Validar proposta "${titulo}"?`)) return;
    try {
      await updateDoc(doc(db, "users", uid, "objetivos", docId), {
        estado: "VALIDADO",
        validadoPor: auth.currentUser.uid,
        validadoAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setObjetivos(prev => prev.map(o => (o.uid === uid && o.docId === docId) ? { ...o, estado: "VALIDADO" } : o));
      alert("Validado!");
    } catch (e) { alert("Erro ao validar."); }
  }

  async function handleRecusar(uid, docId, titulo) {
    if (!window.confirm(`Recusar proposta "${titulo}"?`)) return;
    try {
      await updateDoc(doc(db, "users", uid, "objetivos", docId), {
        estado: "RECUSADO",
        updatedAt: serverTimestamp()
      });
      setObjetivos(prev => prev.map(o => (o.uid === uid && o.docId === docId) ? { ...o, estado: "RECUSADO" } : o));
    } catch (e) { alert("Erro ao recusar."); }
  }

  async function handleInformarConclusao(uid, docId, titulo) {
    if (!window.confirm(`Marcar "${titulo}" como realizado?`)) return;
    try {
      await updateDoc(doc(db, "users", uid, "objetivos", docId), {
        estado: "REALIZADO",
        realizadoAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setObjetivos(prev => prev.map(o => (o.uid === uid && o.docId === docId) ? { ...o, estado: "REALIZADO" } : o));
      alert("Enviado ao Chefe!");
    } catch (e) { alert("Erro ao comunicar conclusão."); }
  }

  if (loading) return <div className="az-loading-screen"><div className="az-logo-pulse">⏳</div></div>;

  const grouped = {};
  // Para a tab de VALIDAR, mostramos apenas o que requer ação (ESCOLHA ou CONFIRMADO)
  objetivosEnriquecidos.filter(o => ["ESCOLHA", "CONFIRMADO"].includes(o.estado)).forEach(obj => {
    if (!grouped[obj.uid]) {
      const el = elementos.find(e => e.uid === obj.uid);
      grouped[obj.uid] = { nome: el?.nome || "Elemento", objs: [] };
    }
    grouped[obj.uid].objs.push(obj);
  });

  return (
    <div className="az-page-container">
      <div className="az-tabs-container" style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        <button onClick={() => setTabAtual("VALIDAR")} className={`az-tab-pill ${tabAtual === "VALIDAR" ? "active" : ""}`} style={tabStyle(tabAtual === "VALIDAR")}>
          🎯 Validar Propostas
        </button>
        <button onClick={() => setTabAtual("VISAO_GERAL")} className={`az-tab-pill ${tabAtual === "VISAO_GERAL" ? "active" : ""}`} style={tabStyle(tabAtual === "VISAO_GERAL")}>
          👁️ Visão da {termoGrupo}
        </button>
        <button onClick={() => setTabAtual("OPORTUNIDADES")} className={`az-tab-pill ${tabAtual === "OPORTUNIDADES" ? "active" : ""}`} style={tabStyle(tabAtual === "OPORTUNIDADES")}>
          📢 Oportunidades
        </button>
      </div>

      {tabAtual === "VALIDAR" && (
        <div className="animate-fade-in">
          {Object.keys(grouped).length === 0 ? (
            <div className="az-panel" style={{ textAlign: "center", padding: "60px 20px" }}><p className="az-muted" style={{ color: "var(--muted)" }}>Tudo em dia!</p></div>
          ) : (
            Object.values(grouped).map(group => (
              <div key={group.nome} className="az-card" style={{ marginBottom: 16 }}>
                <div className="az-card-inner">
                  <h3 style={{ margin: "0 0 16px 0", color: "var(--brand-teal)", borderBottom: "1px solid var(--stroke)", paddingBottom: 8 }}>👤 {group.nome}</h3>
                  <div className="az-grid" style={{ gap: 12 }}>
                    {group.objs.map(obj => (
                      <div key={obj.docId} className="az-panel az-panel-sm" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                        <span className="az-area-badge" style={{ background: AREA_META[obj._areaKey]?.bg, color: "#fff" }}>{obj._codigo}</span>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ fontWeight: 700 }}>{obj._titulo}</div>
                          <div className="az-small muted">Trilho: {obj._trilho}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {obj.estado === "ESCOLHA" && (
                            <>
                              <button className="az-btn az-btn-primary" onClick={() => handleValidar(obj.uid, obj.docId, obj._titulo)}>✅ Validar</button>
                              <button className="az-btn" style={{ color: "var(--danger)" }} onClick={() => handleRecusar(obj.uid, obj.docId, obj._titulo)}>❌</button>
                            </>
                          )}
                          {obj.estado === "CONFIRMADO" && (
                            <button className="az-btn az-btn-teal" onClick={() => handleInformarConclusao(obj.uid, obj.docId, obj._titulo)}>🏅 Marcar Realizado</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tabAtual === "VISAO_GERAL" && (
        <div className="animate-fade-in az-grid" style={{ gap: 16 }}>
          <div className="az-panel" style={{ background: "rgba(255,255,255,0.05)", padding: "12px 20px" }}>
             <h3 style={{ margin: 0, color: "var(--brand-teal)", fontSize: "16px" }}>⛺ {termoGrupo}: {profile?.patrulhaId}</h3>
          </div>
          {elementos.map(el => {
            const seusObjetivos = objetivosEnriquecidos.filter(o => o.uid === el.uid);
            return (
              <div key={el.uid} className="az-card">
                <div className="az-card-inner">
                  <div style={{ fontWeight: 800, marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
                    <span>👤 {el.nome}</span>
                    <span className="az-small muted">{seusObjetivos.filter(o => o.estado === "CONCLUIDO").length} concluídos</span>
                  </div>
                  <div className="az-grid" style={{ gap: 8 }}>
                    {AREA_ORDER.map(a => {
                      const catItems = catalogo.filter(c => c._areaKey === a);
                      return (
                        <div key={a} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <div style={{ width: 90, fontSize: 10, fontWeight: 900, color: AREA_META[a].bg, textTransform: "uppercase" }}>{AREA_META[a].nome}</div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {catItems.map(c => {
                              const obj = seusObjetivos.find(o => o.docId === c.id);
                              const st = ESTADO_CORES[obj?.estado || "NONE"];
                              return (
                                <div key={c.id} title={`${c._codigo} - ${c._titulo}`} style={{ background: st.bg, color: st.color, border: st.border, padding: "2px 6px", fontSize: 9, fontWeight: 800, borderRadius: 4 }}>
                                  {c._codigo}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tabAtual === "OPORTUNIDADES" && (
        <div className="animate-fade-in"><MuralOportunidades profile={profile} contextoRole="ELEMENTO" /></div>
      )}
    </div>
  );
}

// Helper de estilo para os botões das tabs
function tabStyle(active) {
  return {
    padding: "6px 16px", borderRadius: "20px", cursor: "pointer", fontSize: "14px",
    border: active ? "1px solid var(--brand-teal)" : "1px solid transparent",
    background: active ? "rgba(0, 150, 136, 0.1)" : "transparent",
    color: active ? "#fff" : "var(--text-muted)",
  };
}
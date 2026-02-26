/* Chefe Unidade Objetivos
    ./src/pages/ChefeUnidadeObjetivos.jsx
  2026-02-20 - Joao Taveira (jltaveira@gmail.com)
  2026-02-26 integração dos objectivos
 */

import { useEffect, useState, useMemo, Fragment } from "react";
import { collection, query, where, getDocs, doc, updateDoc, setDoc, deleteDoc, addDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../firebase";

const AREA_META = {
  FISICO: { nome: "Físico", bg: "#16a34a", text: "#ffffff" },
  AFETIVO: { nome: "Afetivo", bg: "#dc2626", text: "#ffffff" },
  CARACTER: { nome: "Caráter", bg: "#2563eb", text: "#ffffff" },
  ESPIRITUAL: { nome: "Espiritual", bg: "#9333ea", text: "#ffffff" },
  INTELECTUAL: { nome: "Intelectual", bg: "#ea580c", text: "#ffffff" },
  SOCIAL: { nome: "Social", bg: "#eab308", text: "#000000" },
};
const AREA_ORDER = ["FISICO", "AFETIVO", "CARACTER", "ESPIRITUAL", "INTELECTUAL", "SOCIAL"];

const ESTADO_CORES = {
  CONCLUIDO: { bg: "var(--brand-green)", color: "#fff", border: "none" },
  CONFIRMADO: { bg: "var(--brand-green)", color: "#fff", border: "none" },
  REALIZADO: { bg: "var(--brand-green)", color: "#fff", border: "none" },
  VALIDADO: { bg: "var(--brand-teal)", color: "#fff", border: "none" },
  ESCOLHA: { bg: "rgba(23,154,171,0.2)", color: "var(--brand-teal)", border: "1px solid var(--brand-teal)" },
  RECUSADO: { bg: "rgba(236,131,50,0.2)", color: "var(--brand-orange)", border: "1px dashed var(--brand-orange)" },
  NONE: { bg: "rgba(255,255,255,0.05)", color: "var(--muted)", border: "1px dashed rgba(255,255,255,0.2)" }
};

function areaToKey(a) {
  const k = String(a || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (k === "CARATER") return "CARACTER";
  return AREA_META[k] ? k : "OUTRA";
}

function getTermoGrupo(secaoDocId) {
  const s = String(secaoDocId || "").toLowerCase();
  if (s.includes("alcateia")) return "Bando";
  if (s.includes("expedicao")) return "Patrulha";
  if (s.includes("comunidade")) return "Equipa";
  if (s.includes("cla")) return "Tribo";
  return "Subunidade";
}

function secaoFromSecaoDocId(secaoDocId) {
  const s = String(secaoDocId || "").toLowerCase();
  if (s.includes("alcateia")) return "LOBITOS";
  if (s.includes("expedicao")) return "EXPLORADORES";
  if (s.includes("comunidade")) return "PIONEIROS";
  if (s.includes("cla")) return "CAMINHEIROS";
  return null;
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

// 🚨 CORREÇÃO AQUI: Estava "SecretarioAgrupamentoDashboard", mudei para "ChefeUnidadeObjetivos"
export default function ChefeUnidadeObjetivos({ profile, readOnly }) {
  const [tabAtual, setTabAtual] = useState(readOnly ? "SECÇÃO" : "PENDENTES");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  
  const [elementos, setElementos] = useState([]);
  const [objetivosUsers, setObjetivosUsers] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [mapaSubunidades, setMapaSubunidades] = useState({});

  const [progArea, setProgArea] = useState("");
  const [progObj, setProgObj] = useState("");
  const [progChecked, setProgChecked] = useState(new Set());
  const [progInitial, setProgInitial] = useState(new Set());

  const termoGrupo = getTermoGrupo(profile?.secaoDocId);
  const secaoBase = secaoFromSecaoDocId(profile?.secaoDocId);

  useEffect(() => {
    if (!profile?.secaoDocId) return;
    async function fetchData() {
      setLoading(true); setErro("");
      try {
        const subsSnap = await getDocs(collection(db, "agrupamento", profile.agrupamentoId, "secoes", profile.secaoDocId, "subunidades"));
        const mapSubs = {};
        subsSnap.forEach(d => { mapSubs[d.id] = d.data().nome || d.id; });
        setMapaSubunidades(mapSubs);

        const qUsers = query(collection(db, "users"), where("agrupamentoId", "==", profile.agrupamentoId), where("secaoDocId", "==", profile.secaoDocId), where("tipo", "==", "ELEMENTO"));
        const snapUsers = await getDocs(qUsers);
        const listaElementos = [];
        snapUsers.forEach(d => listaElementos.push({ uid: d.id, ...d.data() }));
        setElementos(listaElementos.sort((a,b) => String(a.nome).localeCompare(String(b.nome))));

        const qCat = query(collection(db, "catalogoObjetivos"), where("secao", "==", secaoBase));
        const snapCat = await getDocs(qCat);
        const cat = snapCat.docs.map(d => {
          const data = d.data();
          return { id: d.id, _areaKey: areaToKey(data.areaDesenvolvimento || data.area), _trilho: data.trilhoEducativo || data.trilho || "Geral", _codigo: data.codigo || extrairCodigoFromOid(d.id), _titulo: descricaoDoCatalogo(data), ...data };
        });
        setCatalogo(cat);

        const todosObjetivos = [];
        await Promise.all(
          listaElementos.map(async (elemento) => {
            const snapObjs = await getDocs(query(collection(db, `users/${elemento.uid}/objetivos`)));
            snapObjs.forEach(objSnap => {
              todosObjetivos.push({ uid: elemento.uid, docId: objSnap.id, estado: objSnap.data().estado || "DISPONIVEL", patrulhaId: elemento.patrulhaId || "sem_grupo", isGuiaOuSub: elemento.isGuia || elemento.isSubGuia });
            });
          })
        );
        setObjetivosUsers(todosObjetivos);
      } catch (err) { setErro("Erro ao aceder aos dados da tua Secção."); } 
      finally { setLoading(false); }
    }
    fetchData();
  }, [profile, secaoBase]);

  const objetivosEnriquecidos = useMemo(() => {
    return objetivosUsers.map(obj => {
      const catItem = catalogo.find(c => c.id === obj.docId) || {};
      return { ...obj, ...catItem };
    });
  }, [objetivosUsers, catalogo]);

  useEffect(() => {
    if (!progObj) { setProgChecked(new Set()); setProgInitial(new Set()); return; }
    const hasIt = new Set();
    objetivosUsers.forEach(o => { if (o.docId === progObj && o.estado !== "RECUSADO") hasIt.add(o.uid); });
    setProgChecked(hasIt); setProgInitial(new Set(hasIt));
  }, [progObj, objetivosUsers]);

  async function alterarEstado(objUid, objDocId, titulo, novoEstado) {
    if (readOnly) return;
    if (!window.confirm(`Marcar o objetivo como ${novoEstado}?`)) return;
    try {
      const ref = doc(db, `users/${objUid}/objetivos/${objDocId}`);
      const payload = { estado: novoEstado, updatedAt: serverTimestamp() };
      if (novoEstado === "CONFIRMADO") payload.confirmadoAt = serverTimestamp();
      if (novoEstado === "CONCLUIDO") { payload.concluidoAt = serverTimestamp(); payload.bloqueado = true; }
      if (novoEstado === "RECUSADO") payload.recusadoAt = serverTimestamp();
      
      await updateDoc(ref, payload);
      setObjetivosUsers(prev => prev.map(item => (item.uid === objUid && item.docId === objDocId) ? { ...item, ...payload } : item));

      if (novoEstado === "CONCLUIDO") {
        const catSize = catalogo.length;
        if (catSize > 0) {
          let countConcluidos = 1; 
          objetivosUsers.forEach(o => {
            if (o.uid === objUid && o.docId !== objDocId && o.estado === "CONCLUIDO") countConcluidos++;
          });

          if (countConcluidos === catSize) {
            const elemento = elementos.find(e => e.uid === objUid);
            await addDoc(collection(db, "notificacoes"), {
              agrupamentoId: profile.agrupamentoId || null,
              secaoDocId: profile.secaoDocId || null,
              tipoAcao: "ANILHA_MERITO",
              descricao: `🏅 Elegível para Anilha de Mérito (100% dos Objetivos Concluídos)`,
              elementoNome: elemento?.nome || objUid,
              uidElemento: objUid,
              patrulhaId: elemento?.patrulhaId || null,
              createdAt: serverTimestamp(),
              resolvida: false
            });
          }
        }
      }
    } catch (err) { alert("Erro ao guardar."); }
  }

  async function salvarProgressoEmMassa() {
    if (readOnly || !progObj) return;
    const toAdd = [...progChecked].filter(uid => !progInitial.has(uid));
    const toRemove = [...progInitial].filter(uid => !progChecked.has(uid));
    if (toAdd.length === 0 && toRemove.length === 0) { alert("Não há alterações para guardar."); return; }
    if (!window.confirm(`Vais atribuir o objetivo a ${toAdd.length} elemento(s) e removê-lo de ${toRemove.length}. Confirmar?`)) return;

    setLoading(true);
    try {
      const batch = writeBatch(db);
      const objCat = catalogo.find(c => c.id === progObj);

      toRemove.forEach(uid => { batch.delete(doc(db, `users/${uid}/objetivos/${progObj}`)); });
      toAdd.forEach(uid => {
         batch.set(doc(db, `users/${uid}/objetivos/${progObj}`), { oportunidadeId: progObj, secao: secaoBase, titulo: objCat._titulo, area: objCat._areaKey, trilho: objCat._trilho, estado: "CONCLUIDO", bloqueado: true, concluidoAt: serverTimestamp(), updatedAt: serverTimestamp(), atribuidoPeloChefe: true });
      });

      await batch.commit();

      let novos = [...objetivosUsers].filter(o => !(o.docId === progObj && toRemove.includes(o.uid))); 
      toAdd.forEach(uid => {
         const el = elementos.find(e => e.uid === uid);
         novos.push({ uid, docId: progObj, estado: "CONCLUIDO", patrulhaId: el?.patrulhaId || "sem_grupo", isGuiaOuSub: el?.isGuia || el?.isSubGuia });
      });
      setObjetivosUsers(novos); 
      setProgInitial(new Set(progChecked)); 

      const catSize = catalogo.length;
      if (catSize > 0) {
        for (const uid of toAdd) {
          let countConcluidos = 1;
          objetivosUsers.forEach(o => {
            if (o.uid === uid && o.docId !== progObj && o.estado === "CONCLUIDO") countConcluidos++;
          });

          if (countConcluidos === catSize) {
            const el = elementos.find(e => e.uid === uid);
            await addDoc(collection(db, "notificacoes"), {
              agrupamentoId: profile.agrupamentoId || null,
              secaoDocId: profile.secaoDocId || null,
              tipoAcao: "ANILHA_MERITO",
              descricao: `🏅 Elegível para Anilha de Mérito (100% dos Objetivos Concluídos)`,
              elementoNome: el?.nome || uid,
              uidElemento: uid,
              patrulhaId: el?.patrulhaId || null,
              createdAt: serverTimestamp(),
              resolvida: false
            });
          }
        }
      }
      alert("Progresso atualizado com sucesso!");
    } catch(err) { alert("Erro ao guardar progresso."); } finally { setLoading(false); }
  }

  const radarData = useMemo(() => {
    const totalEl = elementos.length || 1;
    const catCounts = { areas: {}, trilhos: {} };
    catalogo.forEach(c => {
      if (!catCounts.areas[c._areaKey]) catCounts.areas[c._areaKey] = 0;
      if (!catCounts.trilhos[`${c._areaKey}_${c._trilho}`]) catCounts.trilhos[`${c._areaKey}_${c._trilho}`] = { nome: c._trilho, max1: 0 };
      catCounts.areas[c._areaKey]++; catCounts.trilhos[`${c._areaKey}_${c._trilho}`].max1++;
    });

    const secStats = { areas: {}, trilhos: {} };
    const pStats = {};
    AREA_ORDER.forEach(a => secStats.areas[a] = 0);
    Object.keys(catCounts.trilhos).forEach(tk => secStats.trilhos[tk] = 0);

    objetivosEnriquecidos.forEach(obj => {
      if (obj.estado === "ESCOLHA" || obj.estado === "RECUSADO" || obj.estado === "DISPONIVEL") return;
      const a = obj._areaKey; const tk = `${a}_${obj._trilho}`; const pId = obj.patrulhaId;
      if (secStats.areas[a] !== undefined) secStats.areas[a]++;
      if (secStats.trilhos[tk] !== undefined) secStats.trilhos[tk]++;
      if (!pStats[pId]) {
        pStats[pId] = { elementsCount: elementos.filter(e=>e.patrulhaId === pId).length, areas: {}, trilhos: {} };
        AREA_ORDER.forEach(ax => pStats[pId].areas[ax] = 0);
        Object.keys(catCounts.trilhos).forEach(tx => pStats[pId].trilhos[tx] = 0);
      }
      if (pStats[pId].areas[a] !== undefined) pStats[pId].areas[a]++;
      if (pStats[pId].trilhos[tk] !== undefined) pStats[pId].trilhos[tk]++;
    });
    return { catCounts, secStats, pStats, totalEl };
  }, [objetivosEnriquecidos, catalogo, elementos]);

  const pendentes = objetivosEnriquecidos.filter(o => o.estado === "VALIDADO" || o.estado === "REALIZADO" || (o.estado === "ESCOLHA" && o.isGuiaOuSub));
  const pendentesGrouped = useMemo(() => {
    const mapa = {};
    pendentes.forEach(obj => {
      const pId = obj.patrulhaId; const el = elementos.find(e => e.uid === obj.uid);
      if (!mapa[pId]) mapa[pId] = { nome: mapaSubunidades[pId] || pId, elementos: {} };
      if (!mapa[pId].elementos[obj.uid]) mapa[pId].elementos[obj.uid] = { nome: el?.nome || obj.uid, isGuia: obj.isGuiaOuSub, objs: [] };
      mapa[pId].elementos[obj.uid].objs.push(obj);
    });
    return Object.values(mapa).sort((a,b) => a.nome.localeCompare(b.nome));
  }, [pendentes, mapaSubunidades, elementos]);

  if (loading) return <div className="az-loading-screen"><div className="az-logo-pulse">⏳</div></div>;

  return (
    <div className="az-grid" style={{ gap: 24 }}>
      <div className="az-card">
        <div className="az-card-inner az-row" style={{ justifyContent: "space-between" }}>
          <div><h2 className="az-h2">📋 Objetivos Educativos</h2><p className="az-muted az-small" style={{ marginTop: 4 }}>Analisa e orienta o percurso F.A.C.E.I.S de todos os teus elementos.</p></div>
          {pendentes.length > 0 && !readOnly && <div className="az-pill" style={{ background: "var(--brand-orange)", color: "white", fontWeight: 800 }}>🚨 {pendentes.length} aguardam ação</div>}
        </div>
      </div>

      <div className="az-tabs">
        {!readOnly && <button className={`az-tab ${tabAtual === "PENDENTES" ? "az-tab--active" : ""}`} onClick={() => setTabAtual("PENDENTES")}>🚨 Pendentes</button>}
        <button className={`az-tab ${tabAtual === "SECÇÃO" ? "az-tab--active" : ""}`} onClick={() => setTabAtual("SECÇÃO")}>👁 Visão Geral</button>
        <button className={`az-tab ${tabAtual === "RADAR" ? "az-tab--active" : ""}`} onClick={() => setTabAtual("RADAR")}>📊 Radar Pedagógico</button>
        <button className={`az-tab ${tabAtual === "PROGRESSO" ? "az-tab--active" : ""}`} onClick={() => setTabAtual("PROGRESSO")}>📈 Progresso</button>
      </div>

      {tabAtual === "PENDENTES" && !readOnly && (
        <div className="az-grid" style={{ gap: 16 }}>
          {pendentesGrouped.length === 0 ? <div className="az-panel" style={{ textAlign: "center", padding: "40px" }}><p className="az-muted">Tudo em dia!</p></div> : (
            pendentesGrouped.map(pat => (
              <div key={pat.nome} className="az-card">
                <div className="az-card-inner">
                  <h3 style={{ margin: "0 0 16px", color: "var(--brand-teal)", borderBottom: "1px solid var(--stroke)", paddingBottom: 8 }}>{termoGrupo}: {pat.nome}</h3>
                  <div className="az-grid" style={{ gap: 20 }}>
                    {Object.entries(pat.elementos).map(([uid, el]) => (
                      <div key={uid}>
                        <div style={{ fontWeight: 800, marginBottom: 8 }}>👤 {el.nome} {el.isGuia && <span className="az-pill" style={{ fontSize: 10, background: "var(--brand-orange)", color: "white" }}>Guia/Sub</span>}</div>
                        <div className="az-grid" style={{ gap: 8 }}>
                          {el.objs.map(obj => (
                            <div key={obj.docId} className="az-panel az-panel-sm" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                              <span className="az-area-badge" style={{ background: AREA_META[obj._areaKey]?.bg, color: AREA_META[obj._areaKey]?.text }}>{obj._codigo}</span>
                              <div style={{ flex: 1, minWidth: 200 }}><div style={{ fontWeight: 700, color: "var(--panel-text)" }}>{obj._titulo}</div><div className="az-small muted">Trilho: {obj._trilho}</div></div>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button className="az-btn az-btn-primary" onClick={() => alterarEstado(obj.uid, obj.docId, obj._titulo, "CONCLUIDO")}>🏅 Concluir</button>
                                <button className="az-btn" style={{ borderColor: "rgba(255,107,107,.4)", color: "var(--danger)" }} onClick={() => alterarEstado(obj.uid, obj.docId, obj._titulo, "RECUSADO")}>❌ Recusar</button>
                              </div>
                            </div>
                          ))}
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

      {tabAtual === "SECÇÃO" && (
        <div className="az-grid" style={{ gap: 16 }}>
          {Array.from(new Set(elementos.map(e => e.patrulhaId || "sem_grupo"))).sort().map(pId => {
             const els = elementos.filter(e => (e.patrulhaId || "sem_grupo") === pId);
             const nomePatrulha = mapaSubunidades[pId] || (pId === "sem_grupo" ? "Elementos sem grupo" : pId);
             return (
               <div key={pId} className="az-card">
                 <div className="az-card-inner">
                    <h3 style={{ margin: "0 0 16px", color: "var(--brand-teal)", borderBottom: "1px solid var(--stroke)", paddingBottom: 8 }}>{pId === "sem_grupo" ? "⛺" : `⛺ ${termoGrupo}:`} {nomePatrulha}</h3>
                    <div className="az-grid" style={{ gap: 16 }}>
                      {els.map(el => {
                        const objMap = {};
                        objetivosUsers.filter(o => o.uid === el.uid).forEach(o => objMap[o.docId] = o.estado);
                        return (
                          <div key={el.uid} className="az-panel az-panel-sm">
                            <div style={{ fontWeight: 800, color: "var(--panel-text)", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                              <span>👤 {el.nome} {(el.isGuia || el.isSubGuia) && <span className="az-small" style={{color:"var(--brand-orange)"}}>(Guia/Sub)</span>}</span>
                              <span className="az-small muted">{Object.keys(objMap).length} ativos/feitos</span>
                            </div>
                            <div className="az-grid" style={{ gap: 8 }}>
                              {AREA_ORDER.map(a => {
                                const catItems = catalogo.filter(c => c._areaKey === a);
                                if (!catItems.length) return null;
                                return (
                                  <div key={a} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                    <div style={{ width: 85, fontSize: 11, fontWeight: 800, color: AREA_META[a].bg, textTransform: "uppercase" }}>{AREA_META[a].nome}</div>
                                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
                                      {catItems.map(c => {
                                        const estado = objMap[c.id] || "NONE";
                                        const st = ESTADO_CORES[estado];
                                        return <div key={c.id} title={`${c._codigo} - ${c._titulo}\nEstado: ${estado}`} style={{ background: st.bg, color: st.color, border: st.border, padding: "2px 6px", fontSize: 10, fontWeight: 800, borderRadius: 4, cursor: "help" }}>{c._codigo}</div>
                                      })}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                 </div>
               </div>
             )
          })}
        </div>
      )}

      {tabAtual === "RADAR" && (
        <div className="az-grid" style={{ gap: 24 }}>
          <div className="az-card">
            <div className="az-card-inner">
              <h3 style={{ borderBottom: "1px solid var(--stroke)", paddingBottom: 8, marginBottom: 16 }}>🌍 Progresso da Secção</h3>
              <p className="az-small az-muted" style={{ marginBottom: 16 }}>Áreas e Trilhos superados no total da unidade.</p>
              <div className="az-grid-2">
                {AREA_ORDER.map(a => {
                  const maxArea = (radarData.catCounts.areas[a] || 1) * radarData.totalEl;
                  const statArea = radarData.secStats.areas[a] || 0;
                  const percArea = Math.round((statArea / maxArea) * 100);
                  const trilhosKeys = Object.keys(radarData.catCounts.trilhos).filter(tk => tk.startsWith(a));
                  if (!trilhosKeys.length) return null;
                  return (
                    <div key={a} className="az-panel az-panel-sm" style={{ borderColor: `${AREA_META[a].bg}40` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", color: AREA_META[a].bg, fontWeight: 900, marginBottom: 6 }}>
                        <span>{AREA_META[a].nome}</span><span>{percArea}% <span style={{fontSize: 10, opacity:0.6, fontWeight:400}}>({statArea}/{maxArea})</span></span>
                      </div>
                      <div style={{ height: 6, background: "rgba(0,0,0,0.1)", borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
                        <div style={{ height: "100%", width: `${percArea}%`, background: AREA_META[a].bg, transition: "width 1s" }} />
                      </div>
                      <div style={{ paddingLeft: 10, borderLeft: `2px solid ${AREA_META[a].bg}40`, display: "grid", gap: 6 }}>
                        {trilhosKeys.map(tk => {
                          const maxT = radarData.catCounts.trilhos[tk].max1 * radarData.totalEl;
                          const statT = radarData.secStats.trilhos[tk] || 0;
                          return (
                            <div key={tk} style={{ fontSize: 12, display: "flex", justifyContent: "space-between", color: "var(--panel-text)" }}>
                              <span style={{opacity: 0.8}}>{radarData.catCounts.trilhos[tk].nome}</span><span style={{fontWeight: 700}}>{Math.round((statT/maxT)*100)}%</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {tabAtual === "PROGRESSO" && (
        <div className="az-card">
          <div className="az-card-inner">
            <h3 style={{ margin: "0 0 8px 0" }}>📈 Objetivos</h3>
            <p className="az-small az-muted" style={{ marginBottom: 20 }}>Gere globalmente os objetivos por secção. Seleciona a área e o objetivo para atribuir ou remover em massa.
              {readOnly && <b style={{ color: "var(--brand-orange)", display: "block", marginTop: 4 }}>Modo Consulta: Apenas o Chefe de Unidade pode guardar alterações.</b>}
            </p>
            <div className="az-form-group" style={{ marginBottom: 16 }}>
              <label>1. Seleciona a Área de Desenvolvimento:</label>
              <div className="az-tabs" style={{ marginTop: 4 }}>
                {AREA_ORDER.map(a => {
                  const isActive = progArea === a; const meta = AREA_META[a];
                  return <button key={a} type="button" className="az-tab" style={{ background: isActive ? meta.bg : "rgba(255,255,255,0.05)", color: isActive ? meta.text : "var(--muted)", border: `1px solid ${isActive ? meta.bg : "transparent"}`, fontWeight: isActive ? 800 : 600 }} onClick={() => { setProgArea(a); setProgObj(""); }}>{meta.nome}</button>
                })}
              </div>
            </div>
            {progArea && (
              <div className="az-form-group" style={{ marginBottom: 24 }}>
                <label>2. Escolhe o Objetivo:</label>
                <select className="az-select" value={progObj} onChange={e => setProgObj(e.target.value)}>
                  <option value="">-- Seleciona um objetivo de {AREA_META[progArea].nome} --</option>
                  {catalogo.filter(c => c._areaKey === progArea).map(c => <option key={c.id} value={c.id}>[{c._codigo}] {c._titulo}</option>)}
                </select>
              </div>
            )}
            {progObj && (
              <div className="az-form-group">
                <label>3. Elementos ({progChecked.size} já possuem este objetivo):</label>
                <div className="az-panel az-grid-2" style={{ maxHeight: 400, overflowY: "auto", padding: 12 }}>
                  {elementos.map(el => {
                    const isChecked = progChecked.has(el.uid);
                    return (
                      <label key={el.uid} style={{ display: "flex", alignItems: "center", gap: 10, cursor: readOnly ? "default" : "pointer", padding: "8px", background: isChecked ? "rgba(22,163,74,0.1)" : "transparent", border: isChecked ? "1px solid rgba(22,163,74,0.3)" : "1px solid transparent", borderRadius: 8, transition: "all 0.1s" }}>
                        <input type="checkbox" disabled={readOnly} checked={isChecked} onChange={(e) => { const next = new Set(progChecked); if (e.target.checked) next.add(el.uid); else next.delete(el.uid); setProgChecked(next); }} style={{ transform: "scale(1.3)", accentColor: "var(--brand-green)" }} />
                        <span style={{ color: "var(--panel-text)", fontWeight: isChecked ? 800 : 500 }}>{el.nome} <span className="az-small muted">({mapaSubunidades[el.patrulhaId] || "Sem grupo"})</span></span>
                      </label>
                    );
                  })}
                </div>
                {!readOnly && (
                  <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <button type="button" className="az-btn" style={{ fontSize: 12 }} onClick={() => setProgChecked(new Set(elementos.map(e => e.uid)))}>Selecionar Todos</button>
                    <button type="button" className="az-btn" style={{ fontSize: 12, marginLeft: 8 }} onClick={() => setProgChecked(new Set())}>Limpar Tudo</button>
                    <button type="button" className="az-btn az-btn-primary" style={{ marginLeft: "auto", fontWeight: 800, padding: "12px 24px" }} onClick={salvarProgressoEmMassa}>💾 Guardar Alterações</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
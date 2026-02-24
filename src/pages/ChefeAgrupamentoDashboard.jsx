/* Pagina de gestão do Chefe de Agrupamento
  src/pages/ChefeAgrupamentoDashboard.jsx
 2026-02-18 - Joao Taveira (jltaveira@gmail.com) */


import { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

// IMPORT DA IMAGEM CA
import caImg from "../assets/ca.png";

const AREAS_CNE = [
  { id: "FISICO", label: "Físico", colorVar: "#16a34a" },
  { id: "AFETIVO", label: "Afetivo", colorVar: "#dc2626" },
  { id: "CARACTER", label: "Caráter", colorVar: "#2563eb" },
  { id: "ESPIRITUAL", label: "Espiritual", colorVar: "#9333ea" },
  { id: "INTELECTUAL", label: "Intelectual", colorVar: "#ea580c" },
  { id: "SOCIAL", label: "Social", colorVar: "#eab308" }
];

const SECOES_ORDEM = ["LOBITOS", "EXPLORADORES", "PIONEIROS", "CAMINHEIROS"];
// ADICIONADA A FUNÇÃO "AUXILIAR" À LISTA
const TODAS_FUNCOES = ["CHEFE_AGRUPAMENTO", "SECRETARIO_AGRUPAMENTO", "CHEFE_UNIDADE", "CHEFE_UNIDADE_ADJUNTO", "INSTRUTOR_SECAO", "AUXILIAR"];

export default function ChefeAgrupamentoDashboard({ profile }) {
  const [tabAtual, setTabAtual] = useState("RADAR"); 
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [dirigentes, setDirigentes] = useState([]);
  const [objetivosGlobais, setObjetivosGlobais] = useState([]);
  const [secoesAtivas, setSecoesAtivas] = useState([]); 
  
  const [editandoUid, setEditandoUid] = useState(null);
  const [editTotem, setEditTotem] = useState("");
  const [editSecao, setEditSecao] = useState("");
  const [editFuncoes, setEditFuncoes] = useState([]);

  useEffect(() => {
    if (!profile?.agrupamentoId) return;
    fetchDadosAgrupamento();
  }, [profile]);

  async function fetchDadosAgrupamento() {
    setLoading(true); setErro("");
    try {
      const secSnap = await getDocs(collection(db, "agrupamento", profile.agrupamentoId, "secoes"));
      const listaSecoes = [];
      secSnap.forEach(d => listaSecoes.push(d.id));
      setSecoesAtivas(listaSecoes.sort());

      const qDir = query(collection(db, "users"), where("agrupamentoId", "==", profile.agrupamentoId), where("tipo", "==", "DIRIGENTE"));
      const snapDir = await getDocs(qDir);
      const listaDir = [];
      snapDir.forEach(d => listaDir.push({ uid: d.id, ...d.data() }));
      setDirigentes(listaDir);

      const qElem = query(collection(db, "users"), where("agrupamentoId", "==", profile.agrupamentoId), where("tipo", "==", "ELEMENTO"));
      const snapElem = await getDocs(qElem);
      const listaElem = [];
      snapElem.forEach(d => listaElem.push({ uid: d.id, secaoDocId: d.data().secaoDocId || "Outra" }));

      const todosObj = [];
      await Promise.all(
        listaElem.map(async (el) => {
          const qObj = query(collection(db, `users/${el.uid}/objetivos`), where("estado", "in", ["VALIDADO", "REALIZADO", "CONFIRMADO", "CONCLUIDO"]));
          const snapObj = await getDocs(qObj);
          snapObj.forEach(o => { todosObj.push({ ...o.data(), secaoAgrupamento: determinarSecaoGeral(el.secaoDocId) }); });
        })
      );
      setObjetivosGlobais(todosObj);
    } catch (err) { setErro("Não foi possível carregar os dados."); } finally { setLoading(false); }
  }

  function determinarSecaoGeral(secaoDocId) {
    const s = String(secaoDocId).toLowerCase();
    if (s.includes("alcateia")) return "LOBITOS";
    if (s.includes("expedicao")) return "EXPLORADORES";
    if (s.includes("comunidade")) return "PIONEIROS";
    if (s.includes("cla") || s.includes("clã")) return "CAMINHEIROS";
    return "OUTRA";
  }

  function iniciarEdicao(dir) {
    setEditandoUid(dir.uid); setEditTotem(dir.totem || ""); setEditSecao(dir.secaoDocId || ""); setEditFuncoes(dir.funcoes || []);
  }

  // NOVA LÓGICA DE SELEÇÃO EXCLUSIVA PARA O "AUXILIAR"
  function handleFuncaoToggle(funcao, isChecked) {
    if (isChecked) {
      if (funcao === "AUXILIAR") {
        // Se selecionou Auxiliar, apaga todas as outras e fica só com esta
        setEditFuncoes(["AUXILIAR"]);
      } else {
        // Se selecionou outra qualquer (ex: Chefe), garante que tira o Auxiliar
        setEditFuncoes(prev => [...prev.filter(f => f !== "AUXILIAR"), funcao]);
      }
    } else {
      // Remover função
      setEditFuncoes(prev => prev.filter(f => f !== funcao));
    }
  }

  async function guardarEdicao(uid) {
    try {
      await updateDoc(doc(db, "users", uid), { totem: editTotem || null, secaoDocId: editSecao || null, funcoes: editFuncoes, updatedAt: serverTimestamp() });
      setDirigentes(prev => prev.map(d => d.uid === uid ? { ...d, totem: editTotem, secaoDocId: editSecao, funcoes: editFuncoes } : d));
      setEditandoUid(null);
    } catch(err) { alert("Erro ao guardar as alterações: " + err.message); }
  }

  const metricas = useMemo(() => {
    const globalCount = { total: 0, areas: {} };
    const secoesCount = {};
    AREAS_CNE.forEach(a => globalCount.areas[a.id] = 0);
    SECOES_ORDEM.forEach(s => { secoesCount[s] = { total: 0, areas: {} }; AREAS_CNE.forEach(a => secoesCount[s].areas[a.id] = 0); });

    objetivosGlobais.forEach(obj => {
      const area = obj.area || "OUTROS"; const sec = obj.secaoAgrupamento;
      if (globalCount.areas[area] !== undefined) { globalCount.areas[area]++; globalCount.total++; }
      if (secoesCount[sec] && secoesCount[sec].areas[area] !== undefined) { secoesCount[sec].areas[area]++; secoesCount[sec].total++; }
    });
    return { globalCount, secoesCount };
  }, [objetivosGlobais]);

  const calcPerc = (valor, total) => total > 0 ? Math.round((valor / total) * 100) : 0;

  const RenderFaceisBars = ({ dataObj }) => (
    <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
      {AREAS_CNE.map(a => {
        const perc = calcPerc(dataObj.areas[a.id], dataObj.total);
        return (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
            <div style={{ width: 80, fontWeight: 600, color: a.colorVar }}>{a.label}</div>
            <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", height: 6, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${perc}%`, height: "100%", background: a.colorVar, transition: "width 1s ease-out" }} />
            </div>
            <div style={{ width: 40, textAlign: "right", fontWeight: 700 }}>{perc}%</div>
          </div>
        );
      })}
    </div>
  );

  if (loading) return <div className="az-loading-screen"><div className="az-logo-pulse">⏳</div></div>;

  return (
    <div className="az-grid" style={{ gap: 24 }}>
      <div className="az-card">
        <div className="az-card-inner">
          <h2 className="az-h2" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src={caImg} alt="CA" style={{ height: 32 }} />
            Adultos no Escutismo
          </h2>
          <p className="az-muted az-small" style={{ marginTop: 4 }}>Evolução pedagógica do Agrupamento.</p>
        </div>
      </div>

      <div className="az-tabs">
        <button className={`az-tab ${tabAtual === "RADAR" ? "az-tab--active" : ""}`} onClick={() => setTabAtual("RADAR")}>📊 Radar Pedagógico</button>
        <button className={`az-tab ${tabAtual === "DIRIGENTES" ? "az-tab--active" : ""}`} onClick={() => setTabAtual("DIRIGENTES")}>👥 Dirigentes ({dirigentes.length})</button>
      </div>

      {tabAtual === "RADAR" && (
        <div className="az-grid" style={{ gap: 24 }}>
          <div className="az-card">
            <div className="az-card-inner">
              <h3 style={{ borderBottom: "1px solid var(--stroke)", paddingBottom: 8, marginBottom: 16 }}>🌍 Visão Global do Agrupamento</h3>
              <p className="az-small az-muted" style={{ marginBottom: 16 }}>Distribuição das áreas F.A.C.E.I.S. trabalhadas em todo o Agrupamento.</p>
              <RenderFaceisBars dataObj={metricas.globalCount} />
            </div>
          </div>
          <h3 style={{ marginTop: 12, opacity: 0.8 }}>Análise Sectorial</h3>
          <div className="az-grid-2">
            {SECOES_ORDEM.map(sec => (
              <div key={sec} className="az-card">
                <div className="az-card-inner">
                  <div style={{ fontWeight: 800, color: "var(--text)", marginBottom: 12 }}>{sec} <span className="az-muted" style={{ fontWeight: 400, fontSize: 12 }}>({metricas.secoesCount[sec].total} obj.)</span></div>
                  <RenderFaceisBars dataObj={metricas.secoesCount[sec]} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tabAtual === "DIRIGENTES" && (
        <div className="az-card">
          <div className="az-card-inner">
            <div className="az-row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
              <div><h3 style={{ margin: 0 }}>Dirigentes</h3><p className="az-small az-muted" style={{ margin: "4px 0 0" }}>Edição de Dirigentes do Agrupamento.</p></div>
            </div>
            <div className="az-table-wrap">
              <table className="az-table">
                <thead><tr><th>Nome / Tótem</th><th>Secção / Unidade</th><th>Funções Especiais</th><th style={{ textAlign: "right" }}>Ação</th></tr></thead>
                <tbody>
                  {dirigentes.map(dir => (
                    editandoUid === dir.uid ? (
                      <tr key={`edit-${dir.uid}`} style={{ background: "rgba(23,154,171,.1)" }}>
                        <td colSpan="4" style={{ padding: "20px" }}>
                          <div style={{ fontWeight: 800, marginBottom: 16, color: "var(--brand-teal)", fontSize: 16 }}>A editar: {dir.nome}</div>
                          <div className="az-grid-2" style={{ alignItems: "start", gap: 24 }}>
                            <div className="az-grid" style={{ gap: 12 }}>
                              <div className="az-form-group"><label>Tótem</label><input className="az-input" value={editTotem} onChange={e => setEditTotem(e.target.value)} placeholder="Ex: Lobo Solitário" /></div>
                              <div className="az-form-group"><label>Colocação (Secção)</label><select className="az-select" value={editSecao} onChange={e => setEditSecao(e.target.value)}><option value="">-- Agrupamento (Sem Secção) --</option>{secoesAtivas.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                            </div>
                            <div className="az-form-group">
                              <label>Cargos & Funções</label>
                              
                              {/* MELHORIA VISUAL NA CAIXA DAS FUNÇÕES */}
                              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, background: "rgba(0,0,0,0.4)", padding: 12, borderRadius: 8, border: "1px solid var(--stroke)" }}>
                                {TODAS_FUNCOES.map(f => (
                                  <label key={f} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "4px 0" }}>
                                    <input 
                                      type="checkbox" 
                                      checked={editFuncoes.includes(f)} 
                                      onChange={(e) => handleFuncaoToggle(f, e.target.checked)} 
                                      style={{ accentColor: "var(--brand-teal)", transform: "scale(1.2)" }} 
                                    />
                                    
                                    {/* COR DO TEXTO FORÇADA A BRANCO E VERIFICAÇÃO SE É AUXILIAR */}
                                    <span style={{ fontSize: 13, color: "#ffffff", fontWeight: editFuncoes.includes(f) ? 800 : 500 }}>
                                      {f.replace(/_/g, " ")}
                                      {f === "AUXILIAR" && <span style={{ marginLeft: 8, fontSize: 10, background: "var(--danger)", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>Bloqueia Login</span>}
                                    </span>
                                  </label>
                                ))}
                              </div>

                            </div>
                          </div>
                          <div style={{ marginTop: 20, display: "flex", gap: 12, justifyContent: "flex-end", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 16 }}>
                            <button className="az-btn" onClick={() => setEditandoUid(null)}>Cancelar</button>
                            <button className="az-btn az-btn-teal" style={{ fontWeight: 800 }} onClick={() => guardarEdicao(dir.uid)}>💾 Guardar Alterações</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={dir.uid}>
                        <td style={{ paddingTop: 14 }}><div style={{ fontWeight: 700, color: "var(--text)" }}>{dir.nome}</div><div className="az-small" style={{ color: "var(--brand-orange)" }}>{dir.totem || "Sem Tótem"}</div></td>
                        <td style={{ paddingTop: 14 }}><span className="az-pill" style={{ background: "rgba(255,255,255,0.08)" }}>{dir.secaoDocId || "Agrupamento"}</span></td>
                        <td style={{ paddingTop: 14 }}>
                          {dir.funcoes?.length > 0 ? (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {dir.funcoes.map(f => (
                                <span key={f} className="az-pill" style={{ fontSize: 10, background: f === "AUXILIAR" ? "rgba(220,38,38,.15)" : "rgba(23,154,171,.15)", color: f === "AUXILIAR" ? "var(--danger)" : "var(--brand-teal)", border: "none" }}>
                                  {f.replace(/_/g, " ")}
                                </span>
                              ))}
                            </div>
                          ) : (<span className="az-muted az-small">-</span>)}
                        </td>
                        <td style={{ textAlign: "right", paddingTop: 14 }}><button className="az-btn" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => iniciarEdicao(dir)}>✏️ Editar</button></td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
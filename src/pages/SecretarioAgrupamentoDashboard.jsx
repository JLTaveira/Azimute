/* Secretário de Agrupamento Dashboard
  src/pages/SecretarioAgrupamentoDashboard.jsx
 2026-02-20 - Joao Taveira (jltaveira@gmail.com) */

/* SECRETARIOAGRUPAMENTODASHBOARD.jsx - Correção do campo NIN
   Painel do Secretário com vista de Efetivo e Formatação de Notificações
   2026-02-22 - Azimute Helper */

import { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

import saImg from "../assets/sa.png";

// Helpers de formatação
function formatarData(timestamp) {
  if (!timestamp || !timestamp.toDate) return "Data desconhecida";
  const d = timestamp.toDate();
  return d.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Mantemos como fallback caso algum user antigo não tenha o campo nin
function extractNIN(email) {
  if (!email) return "Sem NIN";
  return email.split("@")[0];
}

function nomeEtapa(id) {
  const map = { PATA_TENRA: "Pata Tenra", LOBO_VALENTE: "Lobo Valente", LOBO_CORTES: "Lobo Cortês", LOBO_AMIGO: "Lobo Amigo", APELO: "Apelo", ALIANCA: "Aliança", RUMO: "Rumo", DESCOBERTA: "Descoberta", DESPRENDIMENTO: "Desprendimento", CONHECIMENTO: "Conhecimento", VONTADE: "Vontade", CONSTRUCAO: "Construção", CAMINHO: "Caminho", COMUNIDADE: "Comunidade", SERVICO: "Serviço", PARTIDA: "Partida" };
  return map[id] || id || "—";
}

function getTermoSubunidade(secaoDocId) {
  const s = String(secaoDocId || "").toLowerCase();
  if (s.includes("alcateia")) return "Bando";
  if (s.includes("expedicao")) return "Patrulha";
  if (s.includes("comunidade")) return "Equipa";
  if (s.includes("cla") || s.includes("clã")) return "Tribo";
  return "Subunidade";
}

const SECOES_ORDEM = ["alcateia", "expedicao", "comunidade", "cla"];
function sortSecoes(a, b) {
  const indexA = SECOES_ORDEM.findIndex(s => String(a).toLowerCase().includes(s));
  const indexB = SECOES_ORDEM.findIndex(s => String(b).toLowerCase().includes(s));
  return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
}

export default function SecretarioAgrupamentoDashboard({ profile }) {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("PENDENTES"); 

  const [notificacoes, setNotificacoes] = useState([]);
  const [elementos, setElementos] = useState([]);
  const [secoesMap, setSecoesMap] = useState({});

  useEffect(() => {
    if (!profile?.agrupamentoId) return;
    fetchDadosSecretaria();
  }, [profile]);

  async function fetchDadosSecretaria() {
    setLoading(true);
    setErro("");
    try {
      const qNotif = query(collection(db, "notificacoes"), where("agrupamentoId", "==", profile.agrupamentoId));
      const snapNotif = await getDocs(qNotif);
      const listaNotif = [];
      snapNotif.forEach(d => listaNotif.push({ id: d.id, ...d.data() }));
      
      listaNotif.sort((a, b) => {
        const dataA = a.createdAt?.toMillis() || 0;
        const dataB = b.createdAt?.toMillis() || 0;
        return dataB - dataA;
      });
      setNotificacoes(listaNotif);

      const qUsers = query(collection(db, "users"), where("agrupamentoId", "==", profile.agrupamentoId), where("tipo", "==", "ELEMENTO"));
      const snapUsers = await getDocs(qUsers);
      const listaElem = [];
      snapUsers.forEach(d => listaElem.push({ uid: d.id, ...d.data() }));
      setElementos(listaElem.sort((a,b) => String(a.nome).localeCompare(String(b.nome))));

      const secSnap = await getDocs(collection(db, "agrupamento", profile.agrupamentoId, "secoes"));
      const estrutura = {};
      
      for (const sDoc of secSnap.docs) {
        estrutura[sDoc.id] = { nome: sDoc.data().nome || sDoc.id, subunidades: {} };
        const subsSnap = await getDocs(collection(db, "agrupamento", profile.agrupamentoId, "secoes", sDoc.id, "subunidades"));
        subsSnap.forEach(subDoc => {
          estrutura[sDoc.id].subunidades[subDoc.id] = subDoc.data().nome || subDoc.id;
        });
      }
      setSecoesMap(estrutura);

    } catch (err) {
      setErro("Não foi possível carregar as informações do Agrupamento.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResolver(id) {
    if (!window.confirm(`Confirmas que esta alteração já foi incluída em Ordem de Serviço ou no software oficial (SIIE)?`)) return;
    try {
      const ref = doc(db, "notificacoes", id);
      const payload = { resolvida: true, resolvidaAt: serverTimestamp(), resolvidaPorUid: profile.uid };
      await updateDoc(ref, payload);
      setNotificacoes(prev => prev.map(n => n.id === id ? { ...n, ...payload, resolvidaAt: new Date() } : n));
    } catch (err) {
      alert("Erro ao atualizar o estado: " + err.message);
    }
  }

  const notificacoesFiltradas = useMemo(() => {
    if (filtro === "PENDENTES") return notificacoes.filter(n => !n.resolvida);
    if (filtro === "RESOLVIDAS") return notificacoes.filter(n => n.resolvida);
    return [];
  }, [notificacoes, filtro]);

  const pendentesCount = notificacoes.filter(n => !n.resolvida).length;

  const renderEfetivo = () => {
    const secoesIds = Object.keys(secoesMap).sort(sortSecoes);

    if (secoesIds.length === 0) return <div className="az-muted" style={{ padding: 20 }}>Nenhum dado de secção encontrado.</div>;

    return secoesIds.map(secId => {
      const secaoData = secoesMap[secId];
      const elementosSecao = elementos.filter(e => e.secaoDocId === secId);
      const termoGrupo = getTermoSubunidade(secId);
      
      const elementosPorSub = {};
      elementosSecao.forEach(e => {
        const pId = e.patrulhaId || "sem_grupo";
        if (!elementosPorSub[pId]) elementosPorSub[pId] = [];
        elementosPorSub[pId].push(e);
      });

      return (
        <div key={secId} className="az-card" style={{ marginBottom: 24 }}>
          <div className="az-card-inner">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--stroke)", paddingBottom: 12, marginBottom: 16 }}>
              <h3 className="az-h2" style={{ margin: 0, fontSize: 20, color: "var(--brand-teal)" }}>{secaoData.nome}</h3>
              <span className="az-pill">👥 {elementosSecao.length} Elementos</span>
            </div>

            {Object.keys(elementosPorSub).length === 0 ? (
              <p className="az-muted">Sem elementos registados nesta secção.</p>
            ) : (
              <div className="az-grid" style={{ gap: 20 }}>
                {Object.entries(elementosPorSub).sort(([a], [b]) => a.localeCompare(b)).map(([subId, lista]) => {
                  const nomeSub = secaoData.subunidades[subId] || (subId === "sem_grupo" ? "Sem Unidade Atribuída" : subId);
                  
                  return (
                    <div key={subId}>
                      <h4 style={{ margin: "0 0 8px 0", color: "var(--text)", opacity: 0.9 }}>
                        {subId === "sem_grupo" ? "⚠️ " : `⛺ ${termoGrupo}: `} {nomeSub}
                      </h4>
                      
                      <div className="az-table-wrap">
                        <table className="az-table" style={{ fontSize: 13 }}>
                          <thead>
                            <tr>
                              <th style={{ width: 120 }}>NIN</th>
                              <th>Nome</th>
                              <th>Tótem</th>
                              <th>Cargo</th>
                              <th>Etapa de Progresso</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lista.map(el => (
                              <tr key={el.uid}>
                                {/* LÊ O CAMPO 'nin' DIRETAMENTE AQUI */}
                                <td style={{ fontFamily: "monospace", color: "var(--muted)" }}>{el.nin || extractNIN(el.email)}</td>
                                <td style={{ fontWeight: 600, color: "var(--text)" }}>{el.nome}</td>
                                <td>{el.totem || <span style={{ opacity: 0.3 }}>-</span>}</td>
                                <td>
                                  {el.isGuia ? <span className="az-pill" style={{ fontSize: 10, background: "rgba(236,131,50,.15)", color: "var(--brand-orange)", border: "none" }}>Guia</span> :
                                   el.isSubGuia ? <span className="az-pill" style={{ fontSize: 10, background: "rgba(236,131,50,.1)", color: "var(--brand-orange)", border: "none" }}>Sub-Guia</span> : 
                                   <span style={{ opacity: 0.3 }}>-</span>}
                                </td>
                                <td>{nomeEtapa(el.etapaProgresso)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      );
    });
  };

  if (loading) return <div className="az-loading-screen"><div className="az-logo-pulse">⏳</div></div>;
  if (erro) return <div className="az-alert az-alert--error">{erro}</div>;

  return (
    <div className="az-grid" style={{ gap: 24 }}>
      <div className="az-card">
        <div className="az-card-inner az-row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 className="az-h2" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={saImg} alt="SA" style={{ height: 32 }} />
              Secretaria do Agrupamento
            </h2>
            <p className="az-muted az-small" style={{ marginTop: 4 }}>
              Gere as alterações pedagógicas e os efetivos para emissão de Ordens de Serviço.
            </p>
          </div>
          {pendentesCount > 0 && (
            <div className="az-pill" style={{ background: "var(--brand-orange)", color: "white", fontWeight: 800 }}>
              🚨 {pendentesCount} Ações Pendentes
            </div>
          )}
        </div>
      </div>

      <div className="az-tabs">
        <button className={`az-tab ${filtro === "PENDENTES" ? "az-tab--active" : ""}`} onClick={() => setFiltro("PENDENTES")}>📥 Caixa de Entrada ({pendentesCount})</button>
        <button className={`az-tab ${filtro === "RESOLVIDAS" ? "az-tab--active" : ""}`} onClick={() => setFiltro("RESOLVIDAS")}>🗄️ Arquivo / Emitidas</button>
        <button className={`az-tab ${filtro === "EFETIVO" ? "az-tab--active" : ""}`} onClick={() => setFiltro("EFETIVO")}>👥 Efetivo Global (Consulta)</button>
      </div>

      {(filtro === "PENDENTES" || filtro === "RESOLVIDAS") && (
        <div className="az-card">
          <div className="az-card-inner" style={{ padding: 0 }}>
            {notificacoesFiltradas.length === 0 ? (
              <div style={{ padding: "60px 20px", textAlign: "center" }}><div style={{ fontSize: 40, opacity: 0.5 }}>📭</div><p className="az-muted" style={{ marginTop: 12 }}>{filtro === "PENDENTES" ? "A secretaria está em dia. Não há alterações pendentes." : "O arquivo está vazio."}</p></div>
            ) : (
              <div className="az-table-wrap" style={{ border: "none", borderRadius: 0 }}>
                <table className="az-table">
                  <thead>
                    <tr><th style={{ width: 130 }}>Data/Hora</th><th style={{ width: 120 }}>NIN</th><th>Elemento / Secção</th><th>Alteração / Registo</th>{filtro === "PENDENTES" && <th style={{ textAlign: "right" }}>Ordem de Serviço</th>}</tr>
                  </thead>
                  <tbody>
                    {notificacoesFiltradas.map(notif => {
                      const elEncontrado = elementos.find(e => e.uid === notif.uidElemento);
                      
                      // LÊ O CAMPO 'nin' DIRETAMENTE AQUI TAMBÉM
                      const ninText = elEncontrado?.nin || extractNIN(elEncontrado?.email);
                      
                      const secaoNomeLimpo = secoesMap[notif.secaoDocId || notif.secao]?.nome || notif.secaoDocId || notif.secao || "Geral";

                      return (
                        <tr key={notif.id} style={{ background: filtro === "PENDENTES" ? "rgba(23,154,171,.03)" : "transparent" }}>
                          <td style={{ color: "var(--muted)", fontSize: 12, paddingTop: 16 }}>{formatarData(notif.createdAt)}</td>
                          <td style={{ fontFamily: "monospace", color: "var(--brand-teal)", fontWeight: 700, paddingTop: 16 }}>{ninText}</td>
                          <td style={{ paddingTop: 16 }}>
                            <div style={{ fontWeight: 800, color: "var(--text)" }}>{notif.elementoNome || "Desconhecido"}</div>
                            <div className="az-small muted" style={{ marginTop: 2 }}>{secaoNomeLimpo}</div>
                          </td>
                          <td style={{ paddingTop: 16 }}>
                            <span className="az-pill" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text)", border: "1px solid var(--stroke)" }}>{notif.descricao}</span>
                            {notif.tipoAcao === "OBJETIVO_CONCLUIDO" && <span className="az-small" style={{ marginLeft: 8, opacity: 0.6 }}>🏅 Competência</span>}
                          </td>
                          {filtro === "PENDENTES" && (
                            <td style={{ textAlign: "right", paddingTop: 16 }}>
                              <button className="az-btn az-btn-primary" style={{ padding: "6px 14px", fontSize: 13, fontWeight: 800 }} onClick={() => handleResolver(notif.id)}>✅ Confirmar em O.S.</button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {filtro === "EFETIVO" && renderEfetivo()}
    </div>
  );
}
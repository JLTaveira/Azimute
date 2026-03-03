/* Secção Dashboard
src/pages/SecaoDashboard.jsx
 2026-02-17 - Joao Taveira (jltaveira@gmail.com) */

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where, updateDoc, serverTimestamp, setDoc, addDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";
import MuralOportunidades from "../components/MuralOportunidades";

import pataTenra from "../assets/patatenra.png";
import loboValente from "../assets/lobovalente.png";
import loboCortes from "../assets/lobocortes.png";
import loboAmigo from "../assets/loboamigo.png";
import apeloImg from "../assets/apelo.png";
import aliancaImg from "../assets/alianca.png";
import rumoImg from "../assets/rumo.png";
import descobertaImg from "../assets/descoberta.png";
import desprendimentoImg from "../assets/desprendimento.png";
import conhecimentoImg from "../assets/conhecimento.png";
import vontadeImg from "../assets/vontade.png";
import construcaoImg from "../assets/construcao.png";
import caminhoImg from "../assets/caminho.png";
import comunidadeImg from "../assets/comunidade.png";
import servicoImg from "../assets/servico.png";
import partidaImg from "../assets/partida.png";
import cuImg from "../assets/cu.png";
import instrutorImg from "../assets/instrutor.png";

function isDirigente(u) { return u?.tipo === "DIRIGENTE"; }
function isElemento(u) { return u?.tipo === "ELEMENTO"; }
function hasFuncao(u, f) { return Array.isArray(u?.funcoes) && u.funcoes.includes(f); }
function isGuia(u) { return u?.isGuia === true; }
function isSubGuia(u) { return u?.isSubGuia === true; }

function nomeEtapa(id) {
  const map = { PATA_TENRA: "Pata Tenra", LOBO_VALENTE: "Lobo Valente", LOBO_CORTES: "Lobo Cortês", LOBO_AMIGO: "Lobo Amigo", APELO: "Apelo", ALIANCA: "Aliança", RUMO: "Rumo", DESCOBERTA: "Descoberta", DESPRENDIMENTO: "Desprendimento", CONHECIMENTO: "Conhecimento", VONTADE: "Vontade", CONSTRUCAO: "Construção", CAMINHO: "Caminho", COMUNIDADE: "Comunidade", SERVICO: "Serviço", PARTIDA: "Partida" };
  return map[id] || id || "—";
}

function nomeFuncao(id) {
  const map = { CHEFE_UNIDADE: "Chefe de Unidade", CHEFE_UNIDADE_ADJUNTO: "Chefe de Unidade Adjunto", INSTRUTOR_SECAO: "Instrutor de Secção" };
  return map[id] || (id ? id.replace(/_/g, " ") : "—");
}

function funcaoPrincipal(funcoes = []) {
  const order = ["CHEFE_UNIDADE", "CHEFE_UNIDADE_ADJUNTO", "INSTRUTOR_SECAO"];
  for (const f of order) if (funcoes.includes(f)) return f;
  return funcoes?.[0] || "";
}

export default function SecaoDashboard({ profile, onOpenGuiaObjetivos }) {
  const [secao, setSecao] = useState(null);
  const [subunidades, setSubunidades] = useState([]);
  const [membros, setMembros] = useState([]);
  const [errSecao, setErrSecao] = useState("");
  const [errSubs, setErrSubs] = useState("");
  const [errMembros, setErrMembros] = useState("");
  const [info, setInfo] = useState("");
  const [resettingUid, setResettingUid] = useState(null);
  const [shareModal, setShareModal] = useState(null);

  const agrupamentoId = profile?.agrupamentoId;
  const secaoDocId = profile?.secaoDocId;
  const souDirigente = isDirigente(profile);
  const souChefeUnidade = souDirigente && hasFuncao(profile, "CHEFE_UNIDADE");
  const souGuia = isElemento(profile) && isGuia(profile);
  const souSubGuia = isElemento(profile) && isSubGuia(profile);
  const cargoMural = souChefeUnidade ? "CHEFE_UNIDADE" : (souDirigente ? "DIRIGENTE" : "ELEMENTO");
  const podeAbrirObjetivosGrupo = souChefeUnidade || souGuia || souSubGuia;

  const sec = (secaoDocId || "").toLowerCase();
  const isLobitos = sec.includes("alcateia");
  const isExploradores = sec.includes("expedicao");
  const isPioneiros = sec.includes("comunidade");
  const isCaminheiros = sec.includes("cla");

  const nomeSubunidades = isLobitos ? "Bandos" : isExploradores ? "Patrulhas" : isPioneiros ? "Equipas" : isCaminheiros ? "Tribos" : "Subunidades";
  const nomeElementoLista = isLobitos ? "Lobitos por Bando" : isExploradores ? "Exploradores por Patrulha" : isPioneiros ? "Pioneiros por Equipa" : isCaminheiros ? "Caminheiros por Tribo" : "Elementos";
  const labelGrupo = isLobitos ? "Bando" : isExploradores ? "Patrulha" : isPioneiros ? "Equipa" : isCaminheiros ? "Tribo" : "Grupo";

  const etapasPorSecao = isLobitos ? ["PATA_TENRA", "LOBO_VALENTE", "LOBO_CORTES", "LOBO_AMIGO"] : isExploradores ? ["APELO", "ALIANCA", "RUMO", "DESCOBERTA"] : isPioneiros ? ["DESPRENDIMENTO", "CONHECIMENTO", "VONTADE", "CONSTRUCAO"] : isCaminheiros ? ["CAMINHO", "COMUNIDADE", "SERVICO", "PARTIDA"] : [];
  const etapaImgMap = { PATA_TENRA: pataTenra, LOBO_VALENTE: loboValente, LOBO_CORTES: loboCortes, LOBO_AMIGO: loboAmigo, APELO: apeloImg, ALIANCA: aliancaImg, RUMO: rumoImg, DESCOBERTA: descobertaImg, DESPRENDIMENTO: desprendimentoImg, CONHECIMENTO: conhecimentoImg, VONTADE: vontadeImg, CONSTRUCAO: construcaoImg, CAMINHO: caminhoImg, COMUNIDADE: comunidadeImg, SERVICO: servicoImg, PARTIDA: partidaImg };
  const funcaoImgMap = { CHEFE_UNIDADE: cuImg, CHEFE_UNIDADE_ADJUNTO: cuImg, INSTRUTOR_SECAO: instrutorImg };

  useEffect(() => {
    async function load() {
      if (!agrupamentoId || !secaoDocId) return;
      setErrSecao(""); setErrSubs(""); setErrMembros(""); setInfo("");
      try {
        const secaoSnap = await getDoc(doc(db, "agrupamento", agrupamentoId, "secoes", secaoDocId));
        setSecao(secaoSnap.exists() ? { id: secaoDocId, ...secaoSnap.data() } : null);
      } catch (e) { setErrSecao(e.message); }

      const podeVerSubunidades = souDirigente || souChefeUnidade || ((souGuia || souSubGuia) && profile?.patrulhaId);
      if (podeVerSubunidades) {
        try {
          const subsSnap = await getDocs(collection(db, "agrupamento", agrupamentoId, "secoes", secaoDocId, "subunidades"));
          const subs = subsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          if ((souGuia || souSubGuia) && profile?.patrulhaId) setSubunidades(subs.filter((s) => s.id === profile.patrulhaId));
          else setSubunidades(subs);
        } catch (e) { setErrSubs(e.message); }
      }

      const podeVerMembros = souDirigente || souChefeUnidade || souGuia || souSubGuia;
      if (podeVerMembros) {
        try {
          let q = null;
          if (souDirigente || souChefeUnidade) q = query(collection(db, "users"), where("agrupamentoId", "==", agrupamentoId), where("secaoDocId", "==", secaoDocId));
          else if ((souGuia || souSubGuia) && profile?.patrulhaId) q = query(collection(db, "users"), where("agrupamentoId", "==", agrupamentoId), where("secaoDocId", "==", secaoDocId), where("patrulhaId", "==", profile.patrulhaId));
          
          if (q) {
            const usersSnap = await getDocs(q);
            const membrosAtivos = [];
            usersSnap.forEach((d) => {
              // 🚨 FILTRO AQUI
              if (d.data().ativo !== false) {
                membrosAtivos.push({ uid: d.id, ...d.data() });
              }
            });
            setMembros(membrosAtivos);
          }
        } catch (e) { setErrMembros(e.message); }
      }
    }
    load();
  }, [agrupamentoId, secaoDocId, souDirigente, souChefeUnidade, souGuia, souSubGuia, profile?.patrulhaId]);

  const membrosByUid = useMemo(() => { const map = new Map(); for (const m of membros) map.set(m.uid, m); return map; }, [membros]);
  const subunidadesOrdenadas = useMemo(() => { const s = [...subunidades]; s.sort((a, b) => String(a.nome || a.id).localeCompare(String(b.nome || b.id))); return s; }, [subunidades]);
  const subunidadesAtivasOrdenadas = useMemo(() => subunidadesOrdenadas.filter((x) => x.ativo === true), [subunidadesOrdenadas]);
  const dirigentes = useMemo(() => membros.filter((m) => isDirigente(m)), [membros]);
  const elementos = useMemo(() => membros.filter((m) => isElemento(m)), [membros]);

  const elementosPorGrupo = useMemo(() => {
    const groups = new Map();
    for (const e of elementos) { const key = e.patrulhaId || "sem_grupo"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(e); }
    for (const [k, arr] of groups) { arr.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""))); groups.set(k, arr); }
    return groups;
  }, [elementos]);

  async function atualizarElemento(uidAlvo, patch) {
    if (!souChefeUnidade) return;
    const atual = membrosByUid.get(uidAlvo);
    if (atual) {
      let mudou = false;
      for (const k of Object.keys(patch || {})) { if ((atual?.[k] ?? null) !== (patch?.[k] ?? null)) { mudou = true; break; } }
      if (!mudou) return;
    }
    setErrMembros(""); setInfo("");
    try {
      await updateDoc(doc(db, "users", uidAlvo), { ...patch, updatedAt: serverTimestamp() });
      setMembros((prev) => prev.map((m) => (m.uid === uidAlvo ? { ...m, ...patch } : m)));

      if ("etapaProgresso" in (patch || {})) {
        const antes = atual?.etapaProgresso ?? null;
        const depois = patch?.etapaProgresso ?? null;
        if (antes !== depois) {
          await setDoc(doc(collection(db, "notificacoes")), { agrupamentoId: agrupamentoId || null, secaoDocId: secaoDocId || null, tipoAcao: "ETAPA_ALTERADA", descricao: `Mudou de etapa: de "${nomeEtapa(antes)}" para "${nomeEtapa(depois)}"`, elementoNome: atual?.nome || uidAlvo, uidElemento: uidAlvo, patrulhaId: atual?.patrulhaId || null, createdAt: serverTimestamp(), resolvida: false });
        }
      }
      setInfo("Alterações gravadas!"); setTimeout(() => setInfo(""), 3000);
    } catch (e) { setErrMembros("Erro ao atualizar: " + e.message); }
  }

  // NOVA FUNÇÃO: Reset de Password
  async function handleResetPassword(uid, nome) {
    if (!window.confirm(`⚠️ Atenção!\nVais repor a password de ${nome}.\n\nA nova password será: Azimute2026\nO elemento será obrigado a alterá-la no próximo login.\n\nConfirmar?`)) return;
    
    setResettingUid(uid);
    try {
      const resetPwd = httpsCallable(functions, 'resetUserPassword');
      await resetPwd({ uid });
      alert(`✅ Password de ${nome} reposta com sucesso!`);
    } catch (error) {
      alert("❌ Erro ao repor password: " + error.message);
    } finally {
      setResettingUid(null);
    }
  }

  const etapaId = profile?.etapaProgresso || "";
  const etapaSrc = etapaId ? etapaImgMap[etapaId] : null;
  const funcaoId = funcaoPrincipal(profile?.funcoes || []);
  const funcaoSrc = funcaoId ? funcaoImgMap[funcaoId] : null;

  async function handleDistribuirInternamente(oportunidade, sufixoTag) {
    try {
      const sId = profile.secaoDocId; // O ID longo (ex: 1104cla)
      const tagFinal = `${sId}${sufixoTag}`; // Gera 1104cla, 1104cla_GUIAS ou 1104cla_DIRIGENTES
      
      // Define o destinatário para o filtro automático do Mural unificado
      let destino = "MURAL";
      if (sufixoTag === "_GUIAS") destino = "GUIAS";
      if (sufixoTag === "_DIRIGENTES") destino = "DIRIGENTES";

      await addDoc(collection(db, "oportunidades_agrupamento"), {
        ...oportunidade,
        agrupamentoId: profile.agrupamentoId,
        secaoDocId: sId,
        alvos: [tagFinal], // A tag que os elementos da secção "ouvem"
        autor: profile.nome,
        destinatarios: destino,
        createdAt: serverTimestamp(),
        arquivada: false
      });
      
      setShareModal(null);
      alert("Informação partilhada com sucesso!");
    } catch (e) {
      alert("Erro ao partilhar.");
    }
  }

  return (
    <div className="az-grid" style={{ gap: 24 }}>
      {(errSecao || errSubs || errMembros) && ( <div className="az-alert az-alert--error">{errSecao && <div>{errSecao}</div>}{errSubs && <div>{errSubs}</div>}{errMembros && <div>{errMembros}</div>}</div> )}
      {info && <div className="az-alert az-alert--ok">{info}</div>}

      <div className="az-card" style={{ background: "linear-gradient(135deg, rgba(23,154,171,.12) 0%, rgba(23,154,171,.02) 100%)", borderColor: "rgba(23,154,171,.2)" }}>
        <div className="az-card-inner az-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 className="az-h1" style={{ fontSize: 26, marginBottom: 6 }}>Boa caça, {profile?.totem || profile?.nome || "Escuteiro"}! 🏕️</h1>
            <p className="az-muted" style={{ margin: 0, fontSize: 15 }}>Dashboard <b>{secao?.nome || secaoDocId}</b> • Agrupamento {agrupamentoId.replace(/_/g, ' ')}</p>
            <div className="az-row" style={{ marginTop: 14, gap: 10 }}>
              {souDirigente ? (
                <span className="az-pill" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {funcaoSrc && <img src={funcaoSrc} alt="Cargo" style={{ height: 20 }} />}
                  {nomeFuncao(funcaoId)}
                </span>
              ) : (
                <span className="az-pill">{etapaSrc && <img src={etapaSrc} alt="Etapa" style={{ height: 18 }} />}Etapa: {nomeEtapa(etapaId)}</span>
              )}

              {souGuia && <span className="az-pill" style={{ background: "rgba(236,131,50,.15)", color: "var(--brand-orange)" }}>⚜️ Guia de {labelGrupo}</span>}
              {souSubGuia && <span className="az-pill" style={{ background: "rgba(236,131,50,.15)", color: "var(--brand-orange)" }}>⚜️ Sub-Guia de {labelGrupo}</span>}
            </div>
          </div>
          {podeAbrirObjetivosGrupo && (
            <button className="az-btn az-btn-teal" onClick={onOpenGuiaObjetivos} style={{ padding: "12px 20px", fontSize: 15, fontWeight: 700 }}>
              {souChefeUnidade ? "📋 Validar Objetivos" : "⚜️ Conselho de Guias"}
            </button>
          )}
        </div>
      </div>

          <MuralOportunidades 
        profile={profile} 
        contextoRole={cargoMural}
        // Só permite partilhar se for o Chefe de Unidade
        onDistribute={souChefeUnidade ? (op) => setShareModal(op) : null}
      />

      {!souDirigente && !souChefeUnidade && !souGuia && !souSubGuia && (
        <div className="az-panel" style={{ textAlign: "center", padding: "40px 20px" }}><div style={{ fontSize: 40, opacity: 0.5 }}>🎯</div><h3 style={{ margin: "12px 0 4px" }}>O teu trilho está à tua espera</h3><p className="az-muted" style={{ margin: 0 }}>Usa o menu lateral para gerires os teus objetivos F.A.C.E.I.S.</p></div>
      )}

      {(souDirigente || souChefeUnidade || ((souGuia || souSubGuia) && profile?.patrulhaId)) && (
        <div className="az-grid-2" style={{ alignItems: "start" }}>
          <div className="az-grid" style={{ gap: 20 }}>
            {(souDirigente || souChefeUnidade) && (
              <div className="az-card">
                <div className="az-card-inner">
                  <h3 style={{ margin: "0 0 12px", borderBottom: "1px solid var(--stroke)", paddingBottom: 8 }}>👥 Equipa de Animação</h3>
                  {dirigentes.length === 0 ? <div className="az-muted az-small">Sem dirigentes associados.</div> : (
                    <div className="az-grid" style={{ gap: 8 }}>
                      {dirigentes.sort((a,b) => String(a.nome).localeCompare(String(b.nome))).map(d => (
                        <div key={d.uid} className="az-panel az-panel-sm" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <b style={{ color: "var(--panel-text)" }}>{d.nome}</b>
                          <span className="az-small muted">{nomeFuncao(funcaoPrincipal(d.funcoes))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <div className="az-card">
              <div className="az-card-inner">
                <h3 style={{ margin: "0 0 12px", borderBottom: "1px solid var(--stroke)", paddingBottom: 8 }}>⛺ Estrutura de {nomeSubunidades}</h3>
                {subunidadesAtivasOrdenadas.length === 0 ? <div className="az-muted az-small">Sem {nomeSubunidades.toLowerCase()} ativas.</div> : (
                  <div className="az-grid" style={{ gap: 8 }}>
                    {subunidadesAtivasOrdenadas.map(s => {
                      const guia = s.guiaUid ? membrosByUid.get(s.guiaUid) : null;
                      const subGuia = s.subGuiaUid ? membrosByUid.get(s.subGuiaUid) : null;
                      return (
                        <div key={s.id} className="az-panel az-panel-sm az-grid" style={{ gap: 4 }}>
                          <b style={{ color: "var(--panel-text)" }}>{s.nome || s.id}</b>
                          <div className="az-small muted" style={{ display: "flex", gap: 12 }}>
                            <span><b>G:</b> {guia?.nome || "—"}</span><span><b>SG:</b> {subGuia?.nome || "—"}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="az-card">
            <div className="az-card-inner">
              <h3 style={{ margin: "0 0 12px", borderBottom: "1px solid var(--stroke)", paddingBottom: 8 }}>👦 {nomeElementoLista}</h3>
              <div className="az-grid" style={{ gap: 16 }}>
                {[...elementosPorGrupo.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([grupoId, list]) => {
                  const sub = subunidades.find((x) => x.id === grupoId);
                  return (
                    <div key={grupoId}>
                      <div style={{ fontWeight: 800, color: "var(--brand-teal)", marginBottom: 8, display: "flex", alignItems: "center" }}>
                        {sub?.nome || (grupoId === "sem_grupo" ? "Elementos sem unidade" : grupoId)}
                        {sub && !sub.ativo && (
                          <span className="az-pill" style={{ marginLeft: 8, fontSize: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.2)" }}>
                            Inativa
                          </span>
                        )}
                      </div>
                      
                      <div className="az-grid" style={{ gap: 8 }}>
                        {list.map(e => (
                          <div key={e.uid} className="az-panel az-panel-sm" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                            <div style={{ flex: 1, minWidth: 150 }}>
                              <b style={{ color: "var(--panel-text)" }}>{e.nome}</b>
                              {(e.isGuia || e.isSubGuia) && (
                                <span className="az-pill" style={{ marginLeft: 6, fontSize: 10, background: "rgba(236,131,50,.15)", color: "#ea580c", border: "1px solid rgba(236,131,50,.3)" }}>
                                  {e.isGuia ? "Guia" : "Sub-Guia"}
                                </span>
                              )}
                            </div>
                            
                            {souChefeUnidade ? (
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                
                                {/* BOTÃO DE RESET AQUI */}
                                <button 
                                  className="az-btn" 
                                  style={{ padding: "5px 8px", fontSize: 11, borderColor: "rgba(236,131,50,.5)", color: "var(--brand-orange)", background: "rgba(236,131,50,.05)" }} 
                                  title="Repor Password" 
                                  onClick={() => handleResetPassword(e.uid, e.nome)} 
                                  disabled={resettingUid === e.uid}
                                >
                                  {resettingUid === e.uid ? "⏳" : "🔑 Reset"}
                                </button>

                                <input 
                                  className="az-input" 
                                  style={{ padding: "6px 10px", width: "130px", fontSize: 13 }} 
                                  placeholder="Inserir Tótem..." 
                                  defaultValue={e.totem || ""} 
                                  onBlur={(ev) => atualizarElemento(e.uid, { totem: ev.target.value || null })} 
                                  title="Escreve e clica fora para gravar"
                                />

                                <select className="az-select" style={{ padding: "6px 10px", width: "auto", fontSize: 13 }} value={e.patrulhaId || ""} onChange={(ev) => atualizarElemento(e.uid, { patrulhaId: ev.target.value || null })}>
                                  <option value="">(Sem {labelGrupo})</option>
                                  {subunidadesAtivasOrdenadas.map(s => <option key={s.id} value={s.id}>{s.nome || s.id}</option>)}
                                </select>
                                {etapasPorSecao.length > 0 && (
                                  <select className="az-select" style={{ padding: "6px 10px", width: "auto", fontSize: 13 }} value={e.etapaProgresso || ""} onChange={(ev) => atualizarElemento(e.uid, { etapaProgresso: ev.target.value || null })}>
                                    <option value="">(Sem etapa)</option>
                                    {etapasPorSecao.map(id => <option key={id} value={id}>{nomeEtapa(id)}</option>)}
                                  </select>
                                )}
                              </div>
                            ) : (
                              <div className="az-small" style={{ color: "var(--panel-muted)", fontWeight: 600 }}>
                                Etapa: {nomeEtapa(e.etapaProgresso || "")} {e.totem && `• ${e.totem}`}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {shareModal && (
        <div className="az-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20 }}>
          <div className="az-card" style={{ width: '100%', maxWidth: 400 }}>
            <div className="az-card-inner">
              <h3 style={{ color: 'var(--brand-teal)', marginBottom: 20 }}>📤 Partilhar com a Unidade</h3>
              <p className="az-small muted" style={{ marginBottom: 20 }}>Enviar para: <b>{shareModal.titulo}</b></p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button className="az-btn az-btn-primary" onClick={() => handleDistribuirInternamente(shareModal, "")}>🌍 Toda a Secção (Elementos)</button>
                <button className="az-btn az-btn-teal" onClick={() => handleDistribuirInternamente(shareModal, "_GUIAS")}>⚜️ Só Guias e Sub-Guias</button>
                <button className="az-btn" style={{ background: 'rgba(255,255,255,0.05)' }} onClick={() => handleDistribuirInternamente(shareModal, "_DIRIGENTES")}>👔 Só Equipa de Animação</button>
                <button className="az-btn-text" style={{ marginTop: 8 }} onClick={() => setShareModal(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
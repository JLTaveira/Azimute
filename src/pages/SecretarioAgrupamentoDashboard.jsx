/* Secretário de Agrupamento Dashboard
  src/pages/SecretarioAgrupamentoDashboard.jsx
 2026-02-20 - Joao Taveira (jltaveira@gmail.com) */

import { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, addDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../firebase";
import * as XLSX from "xlsx"; 

import saImg from "../assets/sa.png";

function formatarDataHora(timestamp) {
  if (!timestamp) return "Data desconhecida";
  const d = timestamp.toDate ? timestamp.toDate() : timestamp;
  return d.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatarDataHoraSegundos(timestamp) {
  if (!timestamp) return "";
  const d = timestamp.toDate ? timestamp.toDate() : timestamp;
  return d.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

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
  const [dirigentes, setDirigentes] = useState([]);
  const [secoesMap, setSecoesMap] = useState({});
  
  const [toggleNin, setToggleNin] = useState("");
  const [toggleResult, setToggleResult] = useState(null);
  const [exportOpcao, setExportOpcao] = useState("TODOS");
  const [uploadList, setUploadList] = useState([]);
  const [editNomeInputs, setEditNomeInputs] = useState({});
  const [importing, setImporting] = useState(false);
  const [resettingUid, setResettingUid] = useState(null);

  useEffect(() => {
    if (!profile?.agrupamentoId) return;
    fetchDadosSecretaria();
  }, [profile]);

  async function fetchDadosSecretaria() {
    setLoading(true); setErro("");
    try {
      const qNotif = query(collection(db, "notificacoes"), where("agrupamentoId", "==", profile.agrupamentoId));
      const snapNotif = await getDocs(qNotif);
      const listaNotif = [];
      snapNotif.forEach(d => listaNotif.push({ id: d.id, ...d.data() }));
      listaNotif.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setNotificacoes(listaNotif);

      const qUsers = query(collection(db, "users"), where("agrupamentoId", "==", profile.agrupamentoId), where("tipo", "==", "ELEMENTO"));
      const snapUsers = await getDocs(qUsers);
      const listaElem = [];
      snapUsers.forEach(d => listaElem.push({ uid: d.id, ...d.data() }));
      setElementos(listaElem.sort((a, b) => String(a.nome).localeCompare(String(b.nome))));

      const qDir = query(collection(db, "users"), where("agrupamentoId", "==", profile.agrupamentoId), where("tipo", "==", "DIRIGENTE"));
      const snapDir = await getDocs(qDir);
      const listaDir = [];
      snapDir.forEach(d => listaDir.push({ uid: d.id, ...d.data() }));
      setDirigentes(listaDir.sort((a, b) => String(a.nome).localeCompare(String(b.nome))));

      const secSnap = await getDocs(collection(db, "agrupamento", profile.agrupamentoId, "secoes"));
      const estrutura = {};
      for (const sDoc of secSnap.docs) {
        estrutura[sDoc.id] = { nome: sDoc.data().nome || sDoc.id, subunidades: {} };
        const subsSnap = await getDocs(collection(db, "agrupamento", profile.agrupamentoId, "secoes", sDoc.id, "subunidades"));
        subsSnap.forEach(subDoc => { estrutura[sDoc.id].subunidades[subDoc.id] = subDoc.data().nome || subDoc.id; });
      }
      setSecoesMap(estrutura);
    } catch (err) { setErro("Erro ao carregar dados."); } finally { setLoading(false); }
  }

  async function handleResolver(id) {
    if (!window.confirm(`Confirmas que esta alteração já foi incluída em Ordem de Serviço e/ou no SIIE?`)) return;
    try {
      await updateDoc(doc(db, "notificacoes", id), { resolvida: true, resolvidaAt: serverTimestamp(), resolvidaPorUid: auth.currentUser.uid });
      setNotificacoes(prev => prev.map(n => n.id === id ? { ...n, resolvida: true } : n));
    } catch (err) { alert("Erro ao atualizar: " + err.message); }
  }

  async function handleResetPassword(uid, nome) {
    if (!window.confirm(`⚠️ Repor password de ${nome} para Azimute2026?`)) return;
    setResettingUid(uid);
    try {
      const resetPwd = httpsCallable(functions, 'resetUserPassword');
      await resetPwd({ uid });
      alert(`✅ Sucesso!`);
    } catch (error) { alert("❌ Erro: " + error.message); } finally { setResettingUid(null); }
  }

  async function procurarParaToggle() {
    setToggleResult(null);
    if (!toggleNin || toggleNin.length < 9) { alert("Digita um NIN válido."); return; }
    try {
      const q = query(collection(db, "users"), where("nin", "==", toggleNin.trim()));
      const snap = await getDocs(q);
      if (snap.empty) alert("NIN não encontrado no sistema.");
      else setToggleResult({ uid: snap.docs[0].id, ...snap.docs[0].data() });
    } catch (err) { alert("Erro ao pesquisar."); }
  }

  async function confirmarToggle() {
    const newState = toggleResult.ativo === false;
    const isTransfer = toggleResult.agrupamentoId !== profile.agrupamentoId;
    if (!window.confirm("Confirmar alteração de estado?")) return;

    try {
      const toggleFn = httpsCallable(functions, 'toggleUserStatus');
      await toggleFn({ uid: toggleResult.uid, ativo: newState });

      const msgOS = newState ? "Voltou ao ativo!" : "Saiu do ativo!";

      await addDoc(collection(db, "notificacoes"), {
        agrupamentoId: profile.agrupamentoId,
        uidElemento: toggleResult.uid,
        elementoNome: toggleResult.nome,
        secaoDocId: toggleResult.secaoDocId || "GERAL",
        descricao: msgOS, // O frontend vai montar a string completa na tabela
        tipo: "ESTADO_CONTA",
        resolvida: false,
        createdAt: serverTimestamp()
      });

      alert("✅ Sucesso registado para Ordem de Serviço / SIIE.");
      setToggleResult(null); setToggleNin(""); fetchDadosSecretaria();
    } catch (err) { alert("Erro: " + err.message); }
  }

  function exportarExcel() {
    let dados = exportOpcao === "TODOS" ? [...dirigentes, ...elementos] : exportOpcao === "DIRIGENTES" ? dirigentes : elementos.filter(e => e.secaoDocId === exportOpcao);
    if (dados.length === 0) { alert("Sem dados."); return; }
    let csv = "NIN,Nome,Tipo,Seccao,Patrulha_Tribo,Ativo,Etapa,Totem,Funcoes\n";
    dados.forEach(d => {
      const nin = d.nin || extractNIN(d.email);
      const secao = secoesMap[d.secaoDocId]?.nome || d.secaoDocId || "Agrupamento";
      const patrulha = secoesMap[d.secaoDocId]?.subunidades?.[d.patrulhaId] || d.patrulhaId || "-";
      csv += `${nin},${d.nome || ""},${d.tipo || ""},${secao},${patrulha},${d.ativo === false ? "Inativo" : "Ativo"},${d.etapaProgresso ? nomeEtapa(d.etapaProgresso) : "-"},${d.totem || ""},${(d.funcoes || []).join("|")}\n`;
    });
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `Efetivo_${exportOpcao}.csv`; link.click();
  }

  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const dataBytes = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(dataBytes, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        if (rows.length < 2) return;
        const headers = rows[0].map(h => String(h).trim().toLowerCase());
        const jsonParsedData = [];
        for (let i = 1; i < rows.length; i++) {
          if (rows[i].length > 0 && String(rows[i][0]).trim() !== "") {
            const obj = {}; headers.forEach((h, idx) => { obj[h] = String(rows[i][idx] || "").trim(); });
            jsonParsedData.push(obj);
          }
        }
        processUpload(jsonParsedData);
      } catch (err) { alert("Erro ao ler Excel."); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ""; 
  }

  function processUpload(data) {
    const processed = data.map(row => {
      const ninStr = row.nin || "";
      const existing = [...elementos, ...dirigentes].find(u => (u.nin === ninStr || extractNIN(u.email) === ninStr));
      let status = existing ? (existing.ativo === false ? "INACTIVE" : "EXISTS") : "NEW";
      
      let mappedSecao = row.secaodocid || row.secao || "";
      const strLow = mappedSecao.toLowerCase();
      if (strLow.includes("lobito")) mappedSecao = Object.keys(secoesMap).find(id => id.includes("alcateia")) || mappedSecao;
      else if (strLow.includes("explorador")) mappedSecao = Object.keys(secoesMap).find(id => id.includes("expedicao")) || mappedSecao;
      else if (strLow.includes("pioneiro")) mappedSecao = Object.keys(secoesMap).find(id => id.includes("comunidade")) || mappedSecao;
      else if (strLow.includes("caminheiro")) mappedSecao = Object.keys(secoesMap).find(id => id.includes("cla")) || mappedSecao;

      return {
        ...row, secaoFinal: mappedSecao, status, existingUid: existing?.uid, existingName: existing?.nome
      };
    });
    setUploadList(processed);
  }

  async function salvarEdicaoNome(uid, index) {
    const novoNome = editNomeInputs[uid];
    if (!novoNome) return;
    try {
      await updateDoc(doc(db, "users", uid), { nome: novoNome, updatedAt: serverTimestamp() });
      alert("✅ Nome atualizado!"); fetchDadosSecretaria();
      setUploadList(prev => { const arr = [...prev]; arr[index].existingName = novoNome; return arr; });
    } catch (err) { alert("Erro ao salvar nome."); }
  }

  async function importarParaBaseDados() {
    const validos = uploadList.filter(u => u.status === "NEW");
    if (validos.length === 0) return;
    setImporting(true);
    try {
      const funcImport = httpsCallable(functions, 'importUsersBatch');
      const res = await funcImport({ users: validos });
      alert(`✅ Importação concluída! Sucessos: ${res.data.success}. Verifica a Caixa de Entrada para confirmares em OS/SIIE.`);
      setUploadList([]); fetchDadosSecretaria();
    } catch (error) { alert("Erro na importação."); } finally { setImporting(false); }
  }

  const notificacoesFiltradas = useMemo(() => {
    return filtro === "PENDENTES" ? notificacoes.filter(n => !n.resolvida) : notificacoes.filter(n => n.resolvida);
  }, [notificacoes, filtro]);
  
  const contagemPendentes = notificacoes.filter(n => !n.resolvida).length;

  return (
    <div className="az-grid" style={{ gap: 24 }}>
      <div className="az-card">
        <div className="az-card-inner az-row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 className="az-h2" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={saImg} alt="SA" style={{ height: 32 }} /> Secretaria
            </h2>
            <p className="az-muted az-small">Gestão de Efetivos e O.S. / SIIE.</p>
          </div>
        </div>
      </div>

      <div className="az-tabs">
        <button className={`az-tab ${filtro === "PENDENTES" ? "az-tab--active" : ""}`} onClick={() => setFiltro("PENDENTES")}>📥 Caixa de Entrada ({contagemPendentes})</button>
        <button className={`az-tab ${filtro === "RESOLVIDAS" ? "az-tab--active" : ""}`} onClick={() => setFiltro("RESOLVIDAS")}>🗄️ Arquivo / Emitidas</button>
        <button className={`az-tab ${filtro === "EFETIVO" ? "az-tab--active" : ""}`} onClick={() => setFiltro("EFETIVO")}>👥 Efetivo Global (Consulta)</button>
      </div>

      {(filtro === "PENDENTES" || filtro === "RESOLVIDAS") && (
        <div className="az-card">
          <div className="az-card-inner" style={{ padding: "0" }}>
             {notificacoesFiltradas.length === 0 ? (
               <p className="az-muted" style={{textAlign: 'center', padding: 40}}>Sem registos pendentes para OS/SIIE.</p>
             ) : (
               <div className="az-table-wrap" style={{border: 'none', borderRadius: 0}}>
                  <table className="az-table" style={{ fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 140 }}>Data/Hora</th>
                        <th style={{ width: 140 }}>NIN</th>
                        <th>Elemento / Secção</th>
                        <th>Alteração / Registo</th>
                        <th style={{textAlign: 'right', width: 180}}>Ordem de Serviço/SIIE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notificacoesFiltradas.map(n => {
                        const user = [...elementos, ...dirigentes].find(e => e.uid === n.uidElemento);
                        const userNIN = user?.nin || extractNIN(user?.email) || "N/A";
                        const nomeSecao = secoesMap[n.secaoDocId]?.nome || n.secaoDocId || "Agrupamento";
                        const fullDesc = `${formatarDataHoraSegundos(n.createdAt)} | ${userNIN} | ${n.elementoNome} | ${n.descricao}`;
                        
                        return (
                          <tr key={n.id} style={{ background: filtro === "PENDENTES" ? "rgba(23,154,171,.03)" : "transparent" }}>
                            <td style={{ color: "var(--muted)", paddingTop: 16 }}>{formatarDataHora(n.createdAt)}</td>
                            <td style={{ fontFamily: "monospace", color: "var(--brand-teal)", fontWeight: 700, paddingTop: 16 }}>{userNIN}</td>
                            <td style={{ paddingTop: 16 }}>
                              <div style={{ fontWeight: 800, color: "var(--text)" }}>{n.elementoNome || "Desconhecido"}</div>
                              <div className="az-small muted" style={{ marginTop: 2 }}>{nomeSecao}</div>
                            </td>
                            <td style={{ paddingTop: 16 }}>
                              <span className="az-pill" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)", padding: "6px 12px" }}>
                                {fullDesc}
                              </span>
                            </td>
                            <td style={{textAlign: 'right', paddingTop: 16}}>
                              {!n.resolvida && <button className="az-btn az-btn-primary" onClick={() => handleResolver(n.id)}>✅ Confirmar em OS/SIIE</button>}
                            </td>
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

      {filtro === "EFETIVO" && (
        <>
          <div className="az-card" style={{ background: "rgba(23,154,171,.03)" }}>
            <div className="az-card-inner">
              <h3 className="az-h2" style={{fontSize: 18, marginBottom: 16}}>⚙️ Secretário do Agrupamento</h3>
               <div className="az-grid-2">
                  <div className="az-panel" style={{ color: "#fff", background: "rgba(0,0,0,0.3)", borderColor: "rgba(255,255,255,0.1)" }}>
                    <h4 style={{marginBottom: 8}}>🔄 Ativar / Desativar / Transferir</h4>
                    <p className="az-small muted" style={{marginBottom: 12}}>Pesquisa por NIN para alterar estado pedagógico.</p>
                    <div className="az-row">
                      <input type="text" className="az-input" style={{flex: 1}} value={toggleNin} onChange={e => setToggleNin(e.target.value)} placeholder="NIN do utilizador" />
                      <button className="az-btn az-btn-teal" onClick={procurarParaToggle}>Procurar</button>
                    </div>
                    {toggleResult && (
                      <div style={{ marginTop: 15, padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 8 }}>
                        <strong>👤 {toggleResult.nome}</strong>
                        {toggleResult.agrupamentoId !== profile.agrupamentoId && <p style={{ color: "#ec8332", fontSize: 11, marginTop: 4 }}>⚠️ Elemento de outro Agrupamento.</p>}
                        <button className="az-btn" style={{ width: "100%", marginTop: 10, background: toggleResult.ativo === false ? "var(--brand-green)" : "var(--danger)", border: 'none', color: '#fff' }} onClick={confirmarToggle}>
                          {toggleResult.ativo === false ? "♻️ Reativar / Transferir" : "⛔ Desativar Conta"}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="az-panel" style={{ color: "#fff", background: "rgba(0,0,0,0.3)", borderColor: "rgba(255,255,255,0.1)" }}>
                    <h4 style={{marginBottom: 8}}>📊 Exportar Listagens (CSV)</h4>
                    <p className="az-small muted" style={{marginBottom: 12}}>Exportação completa de dados por secção.</p>
                    <select className="az-select" style={{marginBottom: 8}} value={exportOpcao} onChange={e => setExportOpcao(e.target.value)}>
                      <option value="TODOS">Todos (Agrupamento Inteiro)</option>
                      <option value="DIRIGENTES">Apenas Dirigentes</option>
                      {Object.keys(secoesMap).sort(sortSecoes).map(sec => <option key={sec} value={sec}>Secção: {secoesMap[sec].nome}</option>)}
                    </select>
                    <button className="az-btn" style={{width: '100%', background: "rgba(255,255,255,0.1)"}} onClick={exportarExcel}>⬇️ Descarregar CSV</button>
                  </div>
               </div>

               <div className="az-panel" style={{ marginTop: 16, background: "rgba(0,0,0,0.3)", borderColor: "rgba(255,255,255,0.1)", color: "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h4>📥 Importar Utilizadores (Excel)</h4>
                    <button className="az-btn az-btn-teal" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => { window.location.href = "/Template_Azimute.xlsx"; }}>📄 Baixar Template</button>
                  </div>
                  <input type="file" accept=".xlsx" className="az-input" style={{padding: 8}} onChange={handleFileUpload} />
                  
                  {uploadList.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <h5>Resultados ({uploadList.length})</h5>
                        <button className="az-btn az-btn-teal" onClick={importarParaBaseDados} disabled={importing}>{importing ? "⏳..." : "🚀 Importar Novos"}</button>
                      </div>
                      <div className="az-table-wrap" style={{ maxHeight: 250, overflowY: "auto" }}>
                        <table className="az-table" style={{ fontSize: 11 }}>
                          <thead><tr><th>NIN</th><th>Nome</th><th>Estado</th></tr></thead>
                          <tbody>
                            {uploadList.map((item, i) => (
                              <tr key={i}>
                                <td>{item.nin}</td>
                                <td>{item.nome}</td>
                                <td>
                                  {item.status === "NEW" ? "✅ Novo" : item.status === "INACTIVE" ? "⛔ Inativo" : "⚠️ Existe"}
                                  {item.status === "EXISTS" && <input className="az-input" style={{fontSize: 10, padding: 2}} value={editNomeInputs[item.existingUid] || item.existingName} onChange={e => setEditNomeInputs({...editNomeInputs, [item.existingUid]: e.target.value})} onBlur={() => salvarEdicaoNome(item.existingUid, i)} />}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
               </div>
            </div>
          </div>

          <div className="az-card" style={{ marginBottom: 24, borderColor: "rgba(236,131,50,.3)" }}>
            <div className="az-card-inner">
              <h3 className="az-h2" style={{ margin: 0, fontSize: 20, color: "var(--brand-orange)" }}>Equipa de Animação (Dirigentes)</h3>
              <div className="az-table-wrap">
                <table className="az-table" style={{ fontSize: 13 }}>
                  <thead><tr><th style={{ width: 120 }}>NIN</th><th>Nome</th><th>Cargo / Funções</th><th style={{ textAlign: "right" }}>Ações Secretaria</th></tr></thead>
                  <tbody>
                    {dirigentes.map(dir => (
                      <tr key={dir.uid} style={{ opacity: dir.ativo === false ? 0.4 : 1 }}>
                        <td style={{ fontFamily: "monospace" }}>{dir.nin || extractNIN(dir.email)}</td>
                        <td style={{ fontWeight: 600 }}>{dir.nome} {dir.ativo === false && <span className="az-pill" style={{ background: "var(--danger)", fontSize: 10, border: 'none' }}>INATIVO</span>}</td>
                        <td>{dir.funcoes?.join(", ").replace(/_/g, " ") || "-"}</td>
                        <td style={{ textAlign: "right" }}>
                          <button className="az-btn" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => handleResetPassword(dir.uid, dir.nome)} disabled={resettingUid === dir.uid || dir.ativo === false}>{resettingUid === dir.uid ? "⏳" : "🔑 Reset Pass"}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {Object.keys(secoesMap).sort(sortSecoes).map(secId => {
            const secaoData = secoesMap[secId];
            const elementosSecao = elementos.filter(e => e.secaoDocId === secId && e.ativo !== false);
            const termoGrupo = getTermoSubunidade(secId);
            const elementosPorSub = {};
            
            elementosSecao.forEach(e => {
              const pId = e.patrulhaId || "sem_grupo";
              if (!elementosPorSub[pId]) elementosPorSub[pId] = [];
              elementosPorSub[pId].push(e);
            });

            if (elementosSecao.length === 0) return null;

            return (
              <div key={secId} className="az-card" style={{ marginBottom: 24 }}>
                <div className="az-card-inner">
                  <h3 style={{ color: "var(--brand-teal)", fontSize: 18, borderBottom: '1px solid var(--stroke)', paddingBottom: 8, marginBottom: 12 }}>{secaoData.nome}</h3>
                  <div className="az-grid" style={{ gap: 20 }}>
                    {Object.entries(elementosPorSub).sort(([a], [b]) => a.localeCompare(b)).map(([subId, lista]) => (
                      <div key={subId}>
                        <h4 style={{ margin: "0 0 8px 0", color: "var(--text)", opacity: 0.9 }}>{subId === "sem_grupo" ? "⚠️ Sem Unidade" : `⛺ ${termoGrupo}: ${secaoData.subunidades[subId] || subId}`}</h4>
                        <div className="az-table-wrap">
                          <table className="az-table" style={{ fontSize: 13 }}>
                            <thead><tr><th>NIN</th><th>Nome</th><th>Cargo</th><th>Etapa de Progresso</th></tr></thead>
                            <tbody>
                              {lista.map(el => (
                                <tr key={el.uid}>
                                  <td style={{ fontFamily: "monospace" }}>{el.nin || extractNIN(el.email)}</td>
                                  <td style={{ fontWeight: 600 }}>{el.nome}</td>
                                  <td>{el.isGuia ? "Guia" : el.isSubGuia ? "Sub-Guia" : "-"}</td>
                                  <td>{nomeEtapa(el.etapaProgresso)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
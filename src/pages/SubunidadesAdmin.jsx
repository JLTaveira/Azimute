/* Gestão de Unidade:
 Gerir Bandos/ Patrulhas / Equipas / Tribos
 Atribuir função Guia
 src/pages/SubunidadesAdmin.jsx
 2026-02-17 - Joao Taveira (jltaveira@gmail.com) */

/* SUBUNIDADESADMIN.jsx - Versão Azimute UI
   Gestão de Bandos/Patrulhas/Equipas/Tribos e atribuição de Guias
   2026-02-22 - Azimute Helper */

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, query, where, writeBatch, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

function isDirigente(u) { return u?.tipo === "DIRIGENTE"; }
function isElemento(u) { return u?.tipo === "ELEMENTO"; }
function hasFuncao(u, f) { return Array.isArray(u?.funcoes) && u.funcoes.includes(f); }
function slugifyId(s) { return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }

export default function SubunidadesAdmin({ profile, onBack, readOnly = false }) {
  const [secao, setSecao] = useState(null);
  const [subunidades, setSubunidades] = useState([]);
  const [membros, setMembros] = useState([]);
  const [nomeNova, setNomeNova] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const agrupamentoId = profile?.agrupamentoId;
  const secaoDocId = profile?.secaoDocId;
  const souDirigente = isDirigente(profile);
  const canEdit = souDirigente && hasFuncao(profile, "CHEFE_UNIDADE") && !readOnly;

  const sec = (secaoDocId || "").toLowerCase();
  const isLobitos = sec.includes("alcateia");
  const isExploradores = sec.includes("expedicao");
  const isPioneiros = sec.includes("comunidade");
  const isCaminheiros = sec.includes("cla");

  const nomeSubunidades = isLobitos ? "Bandos" : isExploradores ? "Patrulhas" : isPioneiros ? "Equipas" : isCaminheiros ? "Tribos" : "Subunidades";
  const labelSingular = isLobitos ? "Bando" : isExploradores ? "Patrulha" : isPioneiros ? "Equipa" : isCaminheiros ? "Tribo" : "Subunidade";
  const secIcon = isLobitos ? "🐺" : isExploradores ? "🏕️" : isPioneiros ? "🔥" : "🎒";

  useEffect(() => {
    async function load() {
      if (!agrupamentoId || !secaoDocId) return;
      setErr(""); setInfo(""); setSecao(null); setSubunidades([]); setMembros([]);
      try {
        const secaoSnap = await getDoc(doc(db, "agrupamento", agrupamentoId, "secoes", secaoDocId));
        setSecao(secaoSnap.exists() ? { id: secaoDocId, ...secaoSnap.data() } : null);
        const subsSnap = await getDocs(collection(db, "agrupamento", agrupamentoId, "secoes", secaoDocId, "subunidades"));
        const subs = subsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        subs.sort((a, b) => String(a.nome || a.id).localeCompare(String(b.nome || b.id)));
        setSubunidades(subs);
        const usersSnap = await getDocs(query(collection(db, "users"), where("agrupamentoId", "==", agrupamentoId), where("secaoDocId", "==", secaoDocId)));
        const users = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
        users.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));
        setMembros(users);
      } catch (e) { setErr(e.message); }
    }
    load();
  }, [agrupamentoId, secaoDocId]);

  const membrosByUid = useMemo(() => { const m = new Map(); for (const u of membros) m.set(u.uid, u); return m; }, [membros]);
  const elementos = useMemo(() => membros.filter((m) => isElemento(m)), [membros]);
  const elementosPorSub = useMemo(() => {
    const map = new Map();
    for (const e of elementos) { const key = e.patrulhaId || "sem_grupo"; if (!map.has(key)) map.set(key, []); map.get(key).push(e); }
    for (const [k, arr] of map) { arr.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""))); map.set(k, arr); }
    return map;
  }, [elementos]);

  async function refresh() {
    try {
      setErr(""); setInfo("");
      const subsSnap = await getDocs(collection(db, "agrupamento", agrupamentoId, "secoes", secaoDocId, "subunidades"));
      const subs = subsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      subs.sort((a, b) => String(a.nome || a.id).localeCompare(String(b.nome || b.id)));
      setSubunidades(subs);
      const usersSnap = await getDocs(query(collection(db, "users"), where("agrupamentoId", "==", agrupamentoId), where("secaoDocId", "==", secaoDocId)));
      const users = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      users.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));
      setMembros(users);
    } catch (e) { setErr(e.message); }
  }

  async function setAtivo(sub, ativo) {
    if (!canEdit) return;
    try {
      const batch = writeBatch(db);
      const subRef = doc(db, "agrupamento", agrupamentoId, "secoes", secaoDocId, "subunidades", sub.id);
      if (!ativo) {
        batch.update(subRef, { ativo: false, guiaUid: null, subGuiaUid: null, updatedAt: serverTimestamp() });
        if (sub.guiaUid) batch.update(doc(db, "users", sub.guiaUid), { isGuia: false, updatedAt: serverTimestamp() });
        if (sub.subGuiaUid) batch.update(doc(db, "users", sub.subGuiaUid), { isSubGuia: false, updatedAt: serverTimestamp() });
      } else { batch.update(subRef, { ativo: true, updatedAt: serverTimestamp() }); }
      await batch.commit(); setInfo(`Estado atualizado.`); setTimeout(() => setInfo(""), 3000); await refresh();
    } catch (e) { setErr(e.message); }
  }

  async function atribuirGuia(sub, novoUid) {
    if (!canEdit) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "agrupamento", agrupamentoId, "secoes", secaoDocId, "subunidades", sub.id), { guiaUid: novoUid || null, updatedAt: serverTimestamp() });
      if (sub.guiaUid) batch.update(doc(db, "users", sub.guiaUid), { isGuia: false, updatedAt: serverTimestamp() });
      if (novoUid) batch.update(doc(db, "users", novoUid), { isGuia: true, isSubGuia: false, updatedAt: serverTimestamp() });
      await batch.commit(); setInfo("Guia atualizado."); setTimeout(() => setInfo(""), 3000); await refresh();
    } catch (e) { setErr(e.message); }
  }

  async function atribuirSubGuia(sub, novoUid) {
    if (!canEdit) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "agrupamento", agrupamentoId, "secoes", secaoDocId, "subunidades", sub.id), { subGuiaUid: novoUid || null, updatedAt: serverTimestamp() });
      if (sub.subGuiaUid) batch.update(doc(db, "users", sub.subGuiaUid), { isSubGuia: false, updatedAt: serverTimestamp() });
      if (novoUid) batch.update(doc(db, "users", novoUid), { isSubGuia: true, isGuia: false, updatedAt: serverTimestamp() });
      await batch.commit(); setInfo("Sub-Guia atualizado."); setTimeout(() => setInfo(""), 3000); await refresh();
    } catch (e) { setErr(e.message); }
  }

  async function criarSubunidade() {
    if (!canEdit || isLobitos) return;
    const nome = String(nomeNova || "").trim();
    if (!nome) { setErr(`Indica o nome.`); return; }
    try {
      const id = slugifyId(nome);
      if (!id) { setErr("Nome inválido."); return; }
      const subRef = doc(db, "agrupamento", agrupamentoId, "secoes", secaoDocId, "subunidades", id);
      const existsSnap = await getDoc(subRef);
      if (existsSnap.exists()) { setErr(`Já existe com esse id.`); return; }
      await setDoc(subRef, { nome, ativo: true, guiaUid: null, subGuiaUid: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      setNomeNova(""); setInfo(`Criada com sucesso.`); setTimeout(() => setInfo(""), 3000); await refresh();
    } catch (e) { setErr(e.message); }
  }

  function candidatosGuia(subId) { return (elementosPorSub.get(subId) || []).filter((e) => e?.uid && e.patrulhaId === subId && e.isSubGuia !== true); }
  function candidatosSubGuia(subId) { return (elementosPorSub.get(subId) || []).filter((e) => e?.uid && e.patrulhaId === subId && e.isGuia !== true); }

  if (!souDirigente) return <div className="az-card"><div className="az-card-inner" style={{ textAlign: "center", padding: "40px" }}><h2 className="az-h2" style={{ color: "var(--danger)" }}>Acesso Restrito</h2><p className="az-muted">Apenas dirigentes.</p></div></div>;

  return (
    <div className="az-grid" style={{ gap: 24 }}>
      <div className="az-card">
        <div className="az-card-inner az-row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 className="az-h2">{secIcon} Gestão de {nomeSubunidades}</h2>
            <p className="az-muted az-small" style={{ marginTop: 4 }}>
              {canEdit ? `Cria ${nomeSubunidades.toLowerCase()} e nomeia as equipas de animação.` : "Modo Consulta: Visualização da estrutura."}
            </p>
          </div>
          {onBack && <button className="az-btn" onClick={onBack}>⬅ Voltar</button>}
        </div>
      </div>

      {err && <div className="az-alert az-alert--error">{err}</div>}
      {info && <div className="az-alert az-alert--ok">{info}</div>}

      {canEdit && !isLobitos && (
        <div className="az-card" style={{ borderColor: "rgba(23,154,171,.3)" }}>
          <div className="az-card-inner" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Criar nova {labelSingular}</label>
              <input className="az-input" value={nomeNova} onChange={(e) => setNomeNova(e.target.value)} placeholder={`Nome (ex: Raposa, Santo Nuno...)`} />
            </div>
            <button className="az-btn az-btn-teal" onClick={criarSubunidade} style={{ padding: "10px 24px", fontWeight: 700 }}>➕ Adicionar</button>
          </div>
        </div>
      )}

      <div className="az-grid" style={{ gap: 16 }}>
        {subunidades.map((s) => {
          const guia = s.guiaUid ? membrosByUid.get(s.guiaUid) : null;
          const subGuia = s.subGuiaUid ? membrosByUid.get(s.subGuiaUid) : null;
          return (
            <div key={s.id} className="az-card" style={{ opacity: s.ativo ? 1 : 0.65 }}>
              <div className="az-card-inner">
                <div className="az-row" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--stroke)", paddingBottom: 12, marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{s.nome || s.id}</div>
                    <span className="az-pill" style={{ background: s.ativo ? "rgba(81,160,74,.15)" : "rgba(255,255,255,.1)" }}>{s.ativo ? "🟢 Ativa" : "⚪ Inativa"}</span>
                    <span className="az-pill">👥 {(elementosPorSub.get(s.id) || []).length} elementos</span>
                  </div>
                  {canEdit && <button className="az-btn" onClick={() => setAtivo(s, !s.ativo)} style={{ fontSize: 12, padding: "6px 12px" }}>{s.ativo ? "Desativar" : "Reativar"}</button>}
                </div>

                <div className="az-grid-2">
                  <div className="az-panel az-panel-sm">
                    <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "var(--panel-text)" }}>⚜️ Guia</label>
                    
                    {/* MELHORIA PARA NÃO-CU: TEXTO LIMPO EM VEZ DE SELECT DESATIVADO */}
                    {canEdit && s.ativo ? (
                      <select className="az-select" value={s.guiaUid || ""} onChange={(e) => atribuirGuia(s, e.target.value || null)}>
                        <option value="">-- Sem Guia --</option>
                        {candidatosGuia(s.id).map((u) => <option key={u.uid} value={u.uid}>{u.nome}</option>)}
                      </select>
                    ) : (
                      <div className="az-input" style={{ background: "rgba(0,0,0,0.03)", color: "var(--panel-text)", fontWeight: 700 }}>
                        {guia ? guia.nome : "-- Ninguém nomeado --"}
                      </div>
                    )}
                  </div>

                  <div className="az-panel az-panel-sm">
                    <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "var(--panel-text)" }}>⚜️ Sub-Guia</label>
                    
                    {/* MELHORIA PARA NÃO-CU: TEXTO LIMPO EM VEZ DE SELECT DESATIVADO */}
                    {canEdit && s.ativo ? (
                      <select className="az-select" value={s.subGuiaUid || ""} onChange={(e) => atribuirSubGuia(s, e.target.value || null)}>
                        <option value="">-- Sem Sub-Guia --</option>
                        {candidatosSubGuia(s.id).map((u) => <option key={u.uid} value={u.uid}>{u.nome}</option>)}
                      </select>
                    ) : (
                      <div className="az-input" style={{ background: "rgba(0,0,0,0.03)", color: "var(--panel-text)", fontWeight: 700 }}>
                        {subGuia ? subGuia.nome : "-- Ninguém nomeado --"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
/* Mural de Oportunidades e Avisos do Agrupamento
  src/components/MuralOportunidades.jsx
 2026-02-26 - Joao Taveira (jltaveira@gmail.com) 
*/

import React, { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs, doc, setDoc, getDoc, serverTimestamp, addDoc } from "firebase/firestore";
import { db, auth } from "../firebase";

export default function MuralOportunidades({ profile, onDistribute, contextoRole }) {
  const [oportunidades, setOportunidades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandidoId, setExpandidoId] = useState(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    titulo: "",
    descricao: "",
    link: "",
    validade: "",
    destino: "" 
  });

    const opcoesDestino = useMemo(() => {
    const options = [];
    const f = profile?.funcoes || [];
    const s = profile?.secaoDocId;

    // 1. OPÇÃO TRANSVERSAL: DIREÇÃO
    // Aparece sempre que o utilizador está num papel de tomada de decisão (CA, SA ou CU)
    if (["SECRETARIO_AGRUPAMENTO", "CHEFE_AGRUPAMENTO", "CHEFE_UNIDADE"].includes(contextoRole)) {
      options.push({ label: "📌 Direção", value: "DIRECAO_AGRUP" });
    }

    // 2. CONTEXTO: SECRETÁRIO DE AGRUPAMENTO
    if (contextoRole === "SECRETARIO_AGRUPAMENTO") {
      options.push({ label: "🐺 Alcateia", value: "CHEFIA_LOBITOS" });
      options.push({ label: "🧴 Expedição", value: "CHEFIA_EXPLORADORES" });
      options.push({ label: "🧭 Comunidade", value: "CHEFIA_PIONEIROS" });
      options.push({ label: "🎒 Clã", value: "CHEFIA_CAMINHEIROS" });
      options.push({ label: "📢 Agrupamento", value: "GERAL" });
      options.push({ label: "👥 Adultos", value: "DIRIGENTES_AGRUP" });
      options.push({ label: "⚜️ Guias", value: "TODOS_GUIAS" });
    }

    // 3. CONTEXTO: CHEFE DE AGRUPAMENTO
    if (contextoRole === "CHEFE_AGRUPAMENTO") {
      options.push({ label: "📩 Secretário", value: "SECRETARIA" });
      options.push({ label: "👥 Adultos", value: "DIRIGENTES_AGRUP" });
      options.push({ label: "🐺 Alcateia", value: "CHEFIA_LOBITOS" });
      options.push({ label: "🧴 Expedição", value: "CHEFIA_EXPLORADORES" });
      options.push({ label: "🧭 Comunidade", value: "CHEFIA_PIONEIROS" });
      options.push({ label: "🎒 Clã", value: "CHEFIA_CAMINHEIROS" });
    }

    // 4. CONTEXTO: CHEFE DE UNIDADE (Na tab da Secção)
    if (contextoRole === "CHEFE_UNIDADE" && s) {
      options.push({ label: "🖼️ Unidade", value: s.toUpperCase });
      options.push({ label: "🎯 Guias e Sub-Guias", value: `${s.toUpperCase()}_GUIAS` });
      options.push({ label: "👥 Equipa de Animação", value: `${s.toUpperCase()}_DIRIGENTES` });
    }

    return options;
    }, [profile, contextoRole]); // Importante: contextoRole tem de estar aqui
    const minhasTags = useMemo(() => {
      if (!profile?.funcoes) return [];
      const tags = ["GERAL"];
      const f = profile.funcoes;
      const s = String(profile.secaoDocId || "").toUpperCase();

      // DIRIGENTES (ADULTOS)
      if (profile.tipo === "DIRIGENTE") {
        tags.push("DIRIGENTES_AGRUP"); 
        if (f.some(r => ["SECRETARIO_AGRUPAMENTO", "CHEFE_AGRUPAMENTO", "CHEFE_UNIDADE"].includes(r))) {
          tags.push("DIRECAO_AGRUP");
        }
        if (f.includes("SECRETARIO_AGRUPAMENTO")) tags.push("SECRETARIA");

        if (s) {
          tags.push(s); // Ouve mural da unidade
          tags.push(`${s}_DIRIGENTES`); // Ouve canal privado de adultos da secção
          if (f.includes("CHEFE_UNIDADE")) {
            tags.push(`${s}_GUIAS`); // CU monitoriza canal de guias
            tags.push("TODOS_GUIAS"); // CU ouve SA a falar com guias
            // Tags de contacto direto do CA
            if (s.includes("ALCATEIA")) tags.push("CHEFIA_LOBITOS");
            if (s.includes("EXPEDICAO")) tags.push("CHEFIA_EXPLORADORES");
            if (s.includes("COMUNIDADE")) tags.push("CHEFIA_PIONEIROS");
            if (s.includes("CLA")) tags.push("CHEFIA_CAMINHEIROS");
          }
        }
      }

      // ELEMENTOS (JOVENS)
      if (profile.tipo === "ELEMENTO") {
        if (s) tags.push(s);
        if (profile.isGuia || profile.isSubGuia) {
          tags.push(`${s}_GUIAS`);
          tags.push("TODOS_GUIAS");
        }
      }
      return tags;
    }, [profile]);
  
  useEffect(() => {
    if (profile?.agrupamentoId && minhasTags.length > 0) fetchMural();
  }, [profile, minhasTags]);

  async function fetchMural() {
    setLoading(true);
    try {
      const q = query(
        collection(db, "oportunidades_agrupamento"),
        where("agrupamentoId", "==", profile.agrupamentoId),
        where("alvos", "array-contains-any", minhasTags)
      );
      
      const snap = await getDocs(q);
      const agora = new Date();
      let lista = [];

      for (const d of snap.docs) {
        const data = d.data();
        if (data.dataFim && new Date(data.dataFim) < agora) continue;
        const archSnap = await getDoc(doc(db, "users", auth.currentUser.uid, "arquivados", d.id));
        if (archSnap.exists()) continue;
        lista.push({ id: d.id, ...data });
      }
      setOportunidades(lista);
    } catch (err) { console.error("Erro ao carregar mural:", err); }
    finally { setLoading(false); }
  }

  async function handleArquivar(postId) {
    try {
      await setDoc(doc(db, "users", auth.currentUser.uid, "arquivados", postId), {
        arquivadoEm: serverTimestamp()
      });
      setOportunidades(prev => prev.filter(op => op.id !== postId));
    } catch (err) { alert("Erro ao arquivar."); }
  }

  async function handlePublicarMensagem() {
    if (!formData.destino) return alert("Selecione um destino.");

    try {
      // LÓGICA DE VALIDADE: Se não houver data, define +15 dias por defeito
      let dataLimite = formData.validade;
      if (!dataLimite) {
        const hoje = new Date();
        hoje.setDate(hoje.getDate() + 60); // +60 dias
        dataLimite = hoje.toISOString();
      } else {
        dataLimite = new Date(dataLimite).toISOString();
      }
      await addDoc(collection(db, "oportunidades_agrupamento"), {
        titulo: formData.titulo,
        descricao: formData.descricao,
        link: formData.link || "",
        agrupamentoId: profile.agrupamentoId,
        alvos: [formData.destino.toUpperCase()], // A tag selecionada no dropdown
        autor: profile.nome,
        autorCargo: contextoRole.replace(/_/g, " "),
        createdAt: serverTimestamp(),
        // Sincronizado com o teu filtro de validade do fetchMural
        dataFim: dataLimite,
        arquivada: false
      });
      
      setShowCreateModal(false);
      setFormData({ titulo: "", descricao: "", link: "", validade: "", destino: "" });
      fetchMural();
      alert("Mensagem enviada para o canal correto!");
    } catch (error) {
      alert("Erro ao publicar.");
    }
  }

  if (loading) return <p className="az-muted">A carregar mural...</p>;

  return (
    <div className="az-card" style={{ marginBottom: 24, borderLeft: "4px solid var(--brand-teal)" }}>
      <div className="az-card-inner">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, margin: 0, color: "var(--brand-teal)", display: "flex", alignItems: "center", gap: 8 }}>
            📢 Oportunidades e Avisos
          </h3>

          {(profile.funcoes?.includes("SECRETARIO_AGRUPAMENTO") || 
            profile.funcoes?.includes("CHEFE_AGRUPAMENTO") || 
            profile.funcoes?.includes("CHEFE_UNIDADE")) && (
            <button 
              className="az-btn az-btn-teal" 
              style={{ padding: "6px 12px", fontSize: 12 }}
              onClick={() => setShowCreateModal(true)}
            >
              + Nova Mensagem
            </button>
          )}
        </div>

        {oportunidades.length === 0 ? (
          <p className="az-small az-muted">Sem avisos recentes.</p>
        ) : (
          <div className="az-grid-2">
            {oportunidades.map(op => (
              <div key={op.id} className="az-panel" style={{ background: "rgba(255,255,255,0.03)", display: "flex", flexDirection: "column" }}>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8, color: "var(--brand-orange)" }}>{op.titulo}</div>
                <div 
                  className="az-small"
                  style={{ 
                    marginBottom: 8, 
                    overflow: "hidden", 
                    display: "-webkit-box", 
                    WebkitLineClamp: expandidoId === op.id ? "unset" : "3", 
                    WebkitBoxOrient: "vertical",
                    color: "var(--text-muted)",
                    lineHeight: "1.4"
                  }}
                  dangerouslySetInnerHTML={{ __html: op.descricao }}
                />

                <button 
                  className="az-btn-text" 
                  onClick={() => setExpandidoId(expandidoId === op.id ? null : op.id)}
                  style={{ color: "var(--brand-teal)", fontSize: 11, marginBottom: 12, textAlign: "left", cursor: "pointer", background: "none", border: "none" }}
                >
                  {expandidoId === op.id ? "↑ Ler menos" : "↓ Ler tudo"}
                </button>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10, marginTop: "auto" }}>
                   <a href={op.link} target="_blank" rel="noreferrer" className="az-small" style={{ color: "#3b82f6", textDecoration: "none" }}>Link 🔗</a>
                   <div style={{ display: "flex", gap: 8 }}>
                      <button className="az-btn" style={{ padding: "4px 8px", fontSize: 10, opacity: 0.7 }} onClick={() => handleArquivar(op.id)}>📥 Arquivar</button>
                      {onDistribute && (
                        <button className="az-btn az-btn-teal" style={{ padding: "4px 8px", fontSize: 10 }} onClick={() => onDistribute(op)}>📤 Partilhar</button>
                      )}
                   </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="az-modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20
        }}>
          <div className="az-card" style={{ width: '100%', maxWidth: 500, borderTop: '4px solid var(--brand-teal)' }}>
            <div className="az-card-inner">
              <h3 style={{ color: 'var(--brand-teal)', marginBottom: 20 }}>📢 Nova Comunicação</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label className="az-small" style={{ color: '#aaa', display: 'block', marginBottom: 4 }}>Título</label>
                  <input 
                    type="text" 
                    className="az-input" 
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid #333', color: '#fff', padding: 10, borderRadius: 8 }}
                    value={formData.titulo}
                    onChange={e => setFormData({...formData, titulo: e.target.value})}
                  />
                </div>

                <div>
                  <label className="az-small" style={{ color: '#aaa', display: 'block', marginBottom: 4 }}>Destinatários</label>
                  <select 
                    className="az-input" 
                    style={{ width: '100%', background: '#1a1a1a', border: '1px solid #333', color: '#fff', padding: 10, borderRadius: 8 }}
                    value={formData.destino}
                    onChange={e => setFormData({...formData, destino: e.target.value})}
                  >
                    <option value="">Escolher...</option>
                    {opcoesDestino.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="az-small" style={{ color: '#aaa', display: 'block', marginBottom: 4 }}>Mensagem</label>
                  <textarea 
                    rows="4" 
                    className="az-input" 
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid #333', color: '#fff', padding: 10, borderRadius: 8 }}
                    value={formData.descricao}
                    onChange={e => setFormData({...formData, descricao: e.target.value})}
                  />
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="az-btn" style={{ flex: 1 }} onClick={() => setShowCreateModal(false)}>Cancelar</button>
                  <button 
                    className="az-btn az-btn-teal" 
                    style={{ flex: 1 }}
                    disabled={!formData.titulo || !formData.destino}
                    onClick={handlePublicarMensagem}
                  >
                    Publicar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
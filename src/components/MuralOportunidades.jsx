/* Mural de Oportunidades e Avisos do Agrupamento
  src/components/MuralOportunidades.jsx
 2026-02-26 - Joao Taveira (jltaveira@gmail.com) 
*/

import React, { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs, doc, setDoc, getDoc, serverTimestamp, addDoc } from "firebase/firestore";
import { db, auth } from "../firebase";

export default function MuralOportunidades({ profile, onDistribute, contextoRole, filtroDestinatarios }) {
  const [oportunidades, setOportunidades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandidoId, setExpandidoId] = useState(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    titulo: "",
    descricao: "",
    link: "",
    dataInicio: new Date().toISOString().split('T')[0], // Puxa o dia de hoje por defeito
    dataFim: "", 
    destino: "" 
  });

  const sId = profile?.secaoDocId || ""; // Exato valor da BD: "1104cla"

    const opcoesDestino = useMemo(() => {
      const options = [];
      if (!profile) return options;

      const numAgrup = (profile.agrupamentoId?.split("_")[0] || "0000").padStart(4, '0');
      const sId = profile.secaoDocId || "";
      const secLower = sId.toLowerCase();

      // Deteta a secção atual (cla, alcateia, etc.)
      let sBase = "";
      if (secLower.includes("alcateia")) sBase = "alcateia";
      else if (secLower.includes("expedicao")) sBase = "expedicao";
      else if (secLower.includes("comunidade")) sBase = "comunidade";
      else if (secLower.includes("cla")) sBase = "cla";

      // --- 1. SECRETÁRIO DE AGRUPAMENTO (SA) ---
      if (contextoRole === "SECRETARIO_AGRUPAMENTO") {
        options.push({ label: "⚜️ Chefe de Agrupamento", value: `${numAgrup}ca` });
        options.push({ label: "👔 Direção", value: `${numAgrup}direcao` });
        options.push({ label: "📢 Todo o Agrupamento", value: `${numAgrup}geral` });
        options.push({ label: "👥 Todos os Dirigentes", value: `${numAgrup}dirigentes` });
        options.push({ label: "⚜️ Todos os Guias (Agrup.)", value: `${numAgrup}guias` });
        // Envio exclusivo para Chefes de Unidade
        options.push({ label: "🐺 Chefe de Alcateia (CU)", value: `${numAgrup}calcateia` });
        options.push({ label: "🧴 Chefe de Expedição (CU)", value: `${numAgrup}cexpedicao` });
        options.push({ label: "🧭 Chefe de Comunidade (CU)", value: `${numAgrup}ccomunidade` });
        options.push({ label: "🎒 Chefe de Clã (CU)", value: `${numAgrup}ccla` });
      }

      // --- 2. CHEFE DE AGRUPAMENTO (CA) ---
      else if (contextoRole === "CHEFE_AGRUPAMENTO") {
        options.push({ label: "📩 Secretário de Agrupamento", value: `${numAgrup}sa` });
        options.push({ label: "👔 Direção", value: `${numAgrup}direcao` });
        options.push({ label: "👥 Todos os Dirigentes", value: `${numAgrup}dirigentes` });
        // Envio exclusivo para Chefes de Unidade
        options.push({ label: "🐺 Chefe de Alcateia (CU)", value: `${numAgrup}calcateia` });
        options.push({ label: "🧴 Chefe de Expedição (CU)", value: `${numAgrup}cexpedicao` });
        options.push({ label: "🧭 Chefe de Comunidade (CU)", value: `${numAgrup}ccomunidade` });
        options.push({ label: "🎒 Chefe de Clã (CU)", value: `${numAgrup}ccla` });
      }

      // --- 3. CHEFE DE UNIDADE (CU) ---
      else if (contextoRole === "CHEFE_UNIDADE" && sBase) {
        const prefixoSecao = `${numAgrup}${sBase}`;
        options.push({ label: "👔 Direção", value: `${numAgrup}direcao` });
        options.push({ label: "👥 Equipa de Animação (EA)", value: `${prefixoSecao}ea` });
        options.push({ label: "⚜️ Meus Guias (+ EA)", value: `${prefixoSecao}guias` }); // Enviará para guias e ouviremos com EA também
        options.push({ label: "🌍 Todos (Elementos + EA)", value: `${prefixoSecao}todos` });
      }

      return options;
    }, [profile, contextoRole]);

    const minhasTags = useMemo(() => {
      const tags = [];
      if (!profile) return tags;

      const numAgrup = (profile.agrupamentoId?.split("_")[0] || "0000").padStart(4, '0');
      const sId = profile.secaoDocId || "";
      const secLower = sId.toLowerCase();

      let sBase = "";
      if (secLower.includes("alcateia")) sBase = "alcateia";
      else if (secLower.includes("expedicao")) sBase = "expedicao";
      else if (secLower.includes("comunidade")) sBase = "comunidade";
      else if (secLower.includes("cla")) sBase = "cla";

      const prefixoSecao = `${numAgrup}${sBase}`;

      // --- A. CONTEXTO: SECRETÁRIO DE AGRUPAMENTO ---
      if (contextoRole === "SECRETARIO_AGRUPAMENTO") {
        tags.push(`${numAgrup}sa`, `${numAgrup}direcao`, `${numAgrup}geral`, `${numAgrup}dirigentes`);
      } 
      
      // --- B. CONTEXTO: CHEFE DE AGRUPAMENTO ---
      else if (contextoRole === "CHEFE_AGRUPAMENTO") {
        tags.push(`${numAgrup}ca`, `${numAgrup}direcao`, `${numAgrup}geral`, `${numAgrup}dirigentes`);
      } 
      
      // --- C. CONTEXTO: CHEFE DE UNIDADE (CU) ---
      else if (contextoRole === "CHEFE_UNIDADE") {
        tags.push(`${numAgrup}geral`, `${numAgrup}dirigentes`);
        if (sBase) {
          tags.push(`${numAgrup}c${sBase}`); // Canal exclusivo SA/CA -> CU (ex: 1104ccla)
          tags.push(`${prefixoSecao}ea`, `${prefixoSecao}guias`, `${prefixoSecao}todos`);
        }
      }

      // --- D. CONTEXTO: DIRIGENTE (EA) ---
      else if (contextoRole === "DIRIGENTE") {
        tags.push(`${numAgrup}geral`, `${numAgrup}dirigentes`);
        if (sBase) {
          tags.push(`${prefixoSecao}ea`, `${prefixoSecao}guias`, `${prefixoSecao}todos`);
        }
      }

      // --- E. CONTEXTO: ELEMENTO / GUIA ---
      else if (contextoRole === "ELEMENTO") {
        tags.push(`${numAgrup}geral`);
        if (sBase) {
          tags.push(`${prefixoSecao}todos`);
          if (profile.isGuia || profile.isSubGuia) {
            tags.push(`${prefixoSecao}guias`, `${numAgrup}guias`);
          }
        }
      }

      return tags;
    }, [profile, contextoRole]);


  useEffect(() => {
    if (profile?.agrupamentoId && minhasTags.length > 0) fetchMural();
  }, [profile, minhasTags]);

 
  async function fetchMural() {
    if (!profile?.agrupamentoId) return;
    setLoading(true);
    try {
      const numAgrup = (profile.agrupamentoId.split("_")[0]).padStart(4, '0');
      
      // Busca por prefixo: abrange "1104", "1104_Paranhos", "1104_Teste", etc.
      const q = query(
        collection(db, "oportunidades_agrupamento"),
        where("agrupamentoId", "==", profile.agrupamentoId)
      );
      
      const snap = await getDocs(q);
      const agora = new Date();
      const mapUnico = new Map();

      snap.docs.forEach(d => {
        const data = d.data();
        const alvos = data.alvos || [];
        
        const temPermissao = alvos.some(alvo => minhasTags.includes(alvo));
        if (!temPermissao) return;

        const inicio = data.dataInicio ? new Date(data.dataInicio) : null;
        const fim = data.dataFim ? new Date(data.dataFim) : null;
        if (fim) fim.setHours(23, 59, 59, 999);
        if (inicio && agora < inicio) return;
        if (fim && agora > fim) return;

        mapUnico.set(d.id, { id: d.id, ...data });
      });

      const listaFinal = Array.from(mapUnico.values())
        .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

      setOportunidades(listaFinal);
    } catch (err) {
      console.error("Erro:", err);
    } finally {
      setLoading(false);
    }
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
    const numAgrup = (profile.agrupamentoId.split("_")[0]).padStart(4, '0');
    const nomeAgrup = profile.agrupamentoId.split("_")[1] || "";
    const fullAgrupId = nomeAgrup ? `${numAgrup}_${nomeAgrup}` : numAgrup;

    if (!formData.destino) return alert("Selecione um destino.");
    if (!formData.dataInicio || !formData.dataFim) return alert("As datas de início e fim são obrigatórias.");

    try {
      await addDoc(collection(db, "oportunidades_agrupamento"), {
        titulo: formData.titulo,
        descricao: formData.descricao,
        link: formData.link || "",
        agrupamentoId: fullAgrupId,
        secaoDocId: sId,
        alvos: [formData.destino], 
        autor: profile.nome,
        autorCargo: contextoRole.replace(/_/g, " "),
        createdAt: serverTimestamp(),
        // Gravado como ISO para facilitar a leitura depois
        dataInicio: new Date(formData.dataInicio).toISOString(),
        dataFim: new Date(formData.dataFim).toISOString(),
        destinatarios: (formData.destino.endsWith("_GUIAS") || formData.destino.endsWith("_guias")) ? "GUIAS" : 
               (formData.destino.includes("_DIRIGENTES") || formData.destino.includes("_dirigente") || formData.destino.includes("_direcao")) ? "DIRIGENTES" : "MURAL",
        arquivada: false
      });
      
      setShowCreateModal(false);
      setFormData({ titulo: "", descricao: "", link: "", dataInicio: new Date().toISOString().split('T')[0], dataFim: "", destino: "" });
      fetchMural();
      alert("Mensagem enviada com sucesso!");
    } catch (error) {
      console.error("Erro na publicação:", error);
      alert("Erro ao publicar.");
    }
  }

  if (loading) return <p className="az-muted">A carregar mural...</p>;

  return (
    <div className="az-card" style={{ marginBottom: 24, borderLeft: "4px solid var(--brand-teal)" }}>
      <div className="az-card-inner">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, margin: 0, color: "var(--brand-teal)", display: "flex", alignItems: "center", gap: 8 }}>
            📢 O que se está a passar?
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
                    marginBottom: 8, overflow: "hidden", display: "-webkit-box", 
                    WebkitLineClamp: expandidoId === op.id ? "unset" : "3", 
                    WebkitBoxOrient: "vertical", color: "rgba(255, 255, 255, 0.9)", lineHeight: "1.4"
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
                   {op.link ? (
                     <a href={op.link} target="_blank" rel="noreferrer" className="az-small" style={{ color: "#3b82f6", textDecoration: "none" }}>Link 🔗</a>
                   ) : <span />}
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

                {/* Secção de Datas Adicionada */}
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label className="az-small" style={{ color: '#aaa', display: 'block', marginBottom: 4 }}>Data de Início</label>
                    <input 
                      type="date" 
                      className="az-input" 
                      style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid #333', color: '#fff', padding: 10, borderRadius: 8 }}
                      value={formData.dataInicio}
                      onChange={e => setFormData({...formData, dataInicio: e.target.value})}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="az-small" style={{ color: '#aaa', display: 'block', marginBottom: 4 }}>Data de Fim <span style={{color: "var(--brand-orange)"}}>*</span></label>
                    <input 
                      type="date" 
                      className="az-input" 
                      style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid #333', color: '#fff', padding: 10, borderRadius: 8 }}
                      value={formData.dataFim}
                      onChange={e => setFormData({...formData, dataFim: e.target.value})}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <button className="az-btn" style={{ flex: 1 }} onClick={() => setShowCreateModal(false)}>Cancelar</button>
                  <button 
                    className="az-btn az-btn-teal" 
                    style={{ flex: 1 }}
                    disabled={!formData.titulo || !formData.destino || !formData.dataInicio || !formData.dataFim}
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
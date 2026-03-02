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

    // Prefixo de 4 dígitos (ex: 1104)
      const numAgrup = (profile.agrupamentoId?.split("_")[0] || "0000").padStart(4, '0');
      const sId = profile.secaoDocId || ""; // Ex: 1104cla
      const sBase = sId.replace(/[0-9]/g, ""); // Ex: cla

      // --- CONTEXTO: CHEFE DE AGRUPAMENTO (CA) ---
      if (contextoRole === "CHEFE_AGRUPAMENTO") {
        options.push({ label: "👥 Adultos", value: `${numAgrup}_dirigente` });
        options.push({ label: "👔 Direção", value: `${numAgrup}_direcao` });
        options.push({ label: "📩 Secretário", value: `${numAgrup}_secretaria` });
        options.push({ label: "🐺 Alcateia (CU)", value: `${numAgrup}_alcateia` });
        options.push({ label: "🧴 Expedição (CU)", value: `${numAgrup}_expedicao` });
        options.push({ label: "🧭 Comunidade (CU)", value: `${numAgrup}_pioneiros` });
        options.push({ label: "🎒 Clã (CU)", value: `${numAgrup}_cla` });
      }

      // --- CONTEXTO: SECRETÁRIO DE AGRUPAMENTO (SA) ---
      else if (contextoRole === "SECRETARIO_AGRUPAMENTO") {
        options.push({ label: "📢 Agrupamento", value: `${numAgrup}_agrupamento` });
        options.push({ label: "👥 Adultos", value: `${numAgrup}_dirigente` });
        options.push({ label: "⚜️ Guias (+ Equipas Animação)", value: `${numAgrup}_guias` });
        options.push({ label: "👔 Direção", value: `${numAgrup}_direcao` });
        // Envio exclusivo para os Chefes de Unidade
        options.push({ label: "🐺 Alcateia (CU)", value: `${numAgrup}_alcateia` });
        options.push({ label: "🧴 Expedição (CU)", value: `${numAgrup}_expedicao` });
        options.push({ label: "🧭 Comunidade (CU)", value: `${numAgrup}_pioneiros` });
        options.push({ label: "🎒 Clã (CU)", value: `${numAgrup}_cla` });
      }

      // --- CONTEXTO: CHEFE DE UNIDADE (CU) ---
      else if (contextoRole === "CHEFE_UNIDADE" && sId) {
        options.push({ label: "🖼️ Secção", value: sId });
        options.push({ label: "🎯 Guias e Sub-Guias", value: `${sId}_GUIAS` });
        options.push({ label: "👥 Equipa de Animação", value: `${sId}_DIRIGENTES` });
      }

      return options;
    }, [profile, contextoRole]);

  const minhasTags = useMemo(() => {
    const tags = [];
    if (!profile) return tags;
    // extrai número agrupamento no formato 0000 e aplica a tag da seccao
    const numAgrup = (profile.agrupamentoId?.split("_")[0] || "0000").padStart(4, '0');
    const sId = profile.secaoDocId || "";
    const sBase = sId.replace(/[0-9]/g, "");
    const f = profile.funcoes || [];

    // --- FILTRO POR CONTEXTO DE PÁGINA ---
      // Esta lógica garante que, se o utilizador acumular cargos, as mensagens não se misturam.

      // 1. CONTEXTO: SECRETÁRIO DE AGRUPAMENTO
      if (contextoRole === "SECRETARIO_AGRUPAMENTO") {
        // Na página do SA, ele vê APENAS o que é do cargo e do Agrupamento (Adultos/Estratégico)
        tags.push(`${numAgrup}_secretaria`, `${numAgrup}_direcao`, `${numAgrup}_dirigente`, `${numAgrup}_agrupamento`, `${numAgrup}_guias`);
      } 
      
      // 2. CONTEXTO: CHEFE DE AGRUPAMENTO
      else if (contextoRole === "CHEFE_AGRUPAMENTO") {
        // Na página do CA, ele vê APENAS a Direção e o canal geral de Dirigentes
        tags.push(`${numAgrup}_direcao`, `${numAgrup}_dirigente`);
        if (f.includes("CHEFE_AGRUPAMENTO_ADJUNTO")) tags.push(`${numAgrup}_adjunto`);
      } 
      
      // 3. CONTEXTO: CHEFE DE UNIDADE OU DIRIGENTE DE EQUIPA (No Dashboard de Secção)
      else if (contextoRole === "CHEFE_UNIDADE" || contextoRole === "DIRIGENTE") {
        // Aqui mostramos apenas o que diz respeito à Unidade específica e avisos gerais a adultos
        if (sId) {
          tags.push(sId, `${sId}_DIRIGENTES`, `${sId}_GUIAS`); // Mensagens internas da unidade
          
          // REGRA: Apenas se o cargo no contexto for CU é que ouve a tag de secção do SA/CA (ex: 1104_alcateia)
          if (contextoRole === "CHEFE_UNIDADE" && sBase) {
            tags.push(`${numAgrup}_${sBase}`); 
          }
          
          tags.push(`${numAgrup}_guias`); // Equipa de Animação monitoriza o canal de guias
        }
        tags.push(`${numAgrup}_dirigente`); // Adultos veem sempre avisos gerais de dirigentes
      } 
      
      // 4. CONTEXTO: ELEMENTO (JOVENS)
      else if (contextoRole === "ELEMENTO") {
        tags.push(`${numAgrup}_agrupamento`);
        if (sId) {
          tags.push(sId);
          if (profile.isGuia || profile.isSubGuia) {
            tags.push(`${sId}_GUIAS`, `${numAgrup}_guias`);
          }
        }
      }

      return tags;
    }, [profile, contextoRole]);

  useEffect(() => {
    if (profile?.agrupamentoId && minhasTags.length > 0) fetchMural();
  }, [profile, minhasTags]);

  async function fetchMural() {
    setLoading(true);
    try {

      const q = query(
        collection(db, "oportunidades_agrupamento"),
        where("agrupamentoId", "==", profile.agrupamentoId)
      );
      
      const snap = await getDocs(q);
      const agora = new Date();
      let lista = [];

      for (const d of snap.docs) {
        const data = d.data();
        const agora = new Date();

        
        // 1. Filtro de Segurança por Tags
        const alvos = data.alvos || [];
        const temPermissao = alvos.some(alvo => minhasTags.includes(alvo));
        if (!temPermissao) continue;

        // 2. Filtro de Datas
        const inicio = data.dataInicio ? new Date(data.dataInicio) : null;
        const fim = data.dataFim ? new Date(data.dataFim) : null;
        
        // Garante que o fim dura até às 23h59 do último dia selecionado
        if (fim) fim.setHours(23, 59, 59, 999);

        if (inicio && agora < inicio) continue;
        if (fim && agora > fim) continue;

        // 3. Filtro de Arquivados Pessoais
        const archSnap = await getDoc(doc(db, "users", auth.currentUser.uid, "arquivados", d.id));
        if (archSnap.exists()) continue;

        lista.push({ id: d.id, ...data });
      }
      
      // Ordena pelas mensagens mais recentes
      lista.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setOportunidades(lista);
    } catch (err) {
      console.error("Erro ao carregar mural:", err);
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
    if (!formData.destino) return alert("Selecione um destino.");
    if (!formData.dataInicio || !formData.dataFim) return alert("As datas de início e fim são obrigatórias.");

    try {
      await addDoc(collection(db, "oportunidades_agrupamento"), {
        titulo: formData.titulo,
        descricao: formData.descricao,
        link: formData.link || "",
        agrupamentoId: profile.agrupamentoId,
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
                    WebkitBoxOrient: "vertical", color: "var(--text-muted)", lineHeight: "1.4"
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
/* Secretário de Agrupamento Dashboard
  src/components/MuralOportunidades.jsx
 2026-02-26 - Joao Taveira (jltaveira@gmail.com) 
*/

import React, { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs, doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";

export default function MuralOportunidades({ profile, onDistribute }) {
  const [oportunidades, setOportunidades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandidoId, setExpandidoId] = useState(null);

  // Calcula quais as tags que este utilizador "escuta" com base na sua função
  const minhasTags = useMemo(() => {
    if (!profile?.funcoes) return [];
    const tags = ["GERAL"]; // Todos ouvem o que é Geral
    
    const f = profile.funcoes;
    // Se pertence à Direção (conforme clarificaste), ouve a tag DIRECAO
    if (f.includes("CHEFE_AGRUPAMENTO") || f.includes("CHEFE_AGRUPAMENTO_ADJUNTO") || 
        f.includes("SECRETARIO_AGRUPAMENTO") || f.includes("TESOUREIRO_AGRUPAMENTO") || 
        f.includes("CHEFE_UNIDADE")) {
      tags.push("DIRECAO");
    }

    // Tags específicas por Cargo
    if (f.includes("CHEFE_AGRUPAMENTO")) tags.push("CHEFE_AGRUPAMENTO");
    if (f.includes("TESOUREIRO_AGRUPAMENTO")) tags.push("TESOUREIRO");

    // Tags por Secção (para Chefes de Unidade e elementos)
    const s = String(profile.secaoDocId || "").toLowerCase();
    if (s.includes("alcateia")) tags.push("LOBITOS");
    if (s.includes("expedicao")) tags.push("EXPLORADORES");
    if (s.includes("comunidade")) tags.push("PIONEIROS");
    if (s.includes("cla")) tags.push("CAMINHEIROS");

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
        // Filtro de validade
        if (data.dataFim && new Date(data.dataFim) < agora) continue;

        // Filtro de arquivo pessoal (cada um limpa o seu mural)
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
      // Grava o arquivo na subcoleção do utilizador para ele não voltar a ver
      await setDoc(doc(db, "users", auth.currentUser.uid, "arquivados", postId), {
        arquivadoEm: serverTimestamp()
      });
      setOportunidades(prev => prev.filter(op => op.id !== postId));
    } catch (err) { alert("Erro ao arquivar."); }
  }

  if (loading || oportunidades.length === 0) return null;

  return (
    <div className="az-card" style={{ marginBottom: 24, borderLeft: "4px solid var(--brand-teal)" }}>
      <div className="az-card-inner">
        <h3 style={{ fontSize: 16, marginBottom: 16, color: "var(--brand-teal)", display: "flex", alignItems: "center", gap: 8 }}>
          📢 Oportunidades e Avisos
        </h3>
        <div className="az-grid-2">
          {oportunidades.map(op => {
            const isExposed = expandidoId === op.id;
            return (
              <div key={op.id} className="az-panel" style={{ background: "rgba(255,255,255,0.03)", display: "flex", flexDirection: "column" }}>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8, color: "var(--brand-orange)" }}>{op.titulo}</div>
                
                {/* Texto interpretado como HTML para remover as tags <p> e <strong> */}
                <div 
                  className="az-small"
                  style={{ 
                    marginBottom: 8, 
                    overflow: "hidden", 
                    display: "-webkit-box", 
                    WebkitLineClamp: isExposed ? "unset" : "3", 
                    WebkitBoxOrient: "vertical",
                    color: "var(--text-muted)",
                    lineHeight: "1.4"
                  }}
                  dangerouslySetInnerHTML={{ __html: op.descricao }}
                />

                <button 
                  className="az-btn-text" 
                  onClick={() => setExpandidoId(isExposed ? null : op.id)}
                  style={{ color: "var(--brand-teal)", fontSize: 11, marginBottom: 12, textAlign: "left", cursor: "pointer", background: "none", border: "none" }}
                >
                  {isExposed ? "↑ Ler menos" : "↓ Ler tudo"}
                </button>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10, marginTop: "auto" }}>
                   <a href={op.link} target="_blank" rel="noreferrer" className="az-small" style={{ color: "#3b82f6", textDecoration: "none" }}>Abrir Link 🔗</a>
                   <div style={{ display: "flex", gap: 8 }}>
                      <button className="az-btn" style={{ padding: "4px 8px", fontSize: 10, opacity: 0.7 }} onClick={() => handleArquivar(op.id)}>📥 Arquivar</button>
                      {onDistribute && (
                        <button className="az-btn az-btn-teal" style={{ padding: "4px 8px", fontSize: 10 }} onClick={() => onDistribute(op)}>📤 Re-distribuir</button>
                      )}
                   </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
/* Recursos Oficiais CNE
  ./src/pages/RecursosOficiais.jsx
 2026-02-20 - Joao Taveira (jltaveira@gmail.com) 
 */

import React, { useEffect, useState, useMemo } from "react";
import { collection, query, getDocs, orderBy } from "firebase/firestore";
import { db } from "../firebase";

export default function RecursosOficiais({ profile }) {
  const [recursos, setRecursos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");

  useEffect(() => {
      async function fetchRecursos() {
        setLoading(true); // Inicia o estado de carregamento
        try {
          // Faz a consulta ao Firestore pedindo ordenação descendente pela data
          const q = query(
            collection(db, "recursos_oficiais_cne"), 
            orderBy("dataPublicacao", "desc")
          );
          const snap = await getDocs(q);

          // Processa os dados e aplica um sort extra no JavaScript por segurança
          const listaTratada = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => {
              const dataA = String(a.dataPublicacao || "");
              const dataB = String(b.dataPublicacao || "");
              return dataB.localeCompare(dataA); // Ordena: Recente -> Antigo
            });

          setRecursos(listaTratada);
        } catch (err) {
          console.error("Erro ao carregar recursos:", err);
        } finally {
          setLoading(false); // Finaliza o carregamento, independentemente de erro ou sucesso
        }
      }

      fetchRecursos();
    }, []);

  const filtrados = useMemo(() => 
    recursos.filter(r => r.titulo.toLowerCase().includes(busca.toLowerCase())), 
  [recursos, busca]);

  if (loading) return <p className="az-muted">A carregar biblioteca oficial...</p>;

  return (
    <div className="az-page-container">
      <div className="az-card" style={{ marginBottom: 20, background: 'linear-gradient(135deg, rgba(23,154,171,0.1) 0%, transparent 100%)' }}>
        <div className="az-card-inner">
          <h2 style={{ color: 'var(--brand-teal)', margin: 0 }}>📄 Recursos Oficiais CNE</h2>
          <p className="az-small muted">Documentação atualizada do Ano Escutista 2025/2026.</p>
          
          <input 
            type="text" 
            placeholder="Pesquisar documento (ex: estatutos, fardamento...)" 
            className="az-input"
            style={{ marginTop: 15, width: '100%' }}
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
      </div>

      <div className="az-grid-3">
        {filtrados.map(r => (
          <div 
                key={r.id} 
                className="az-panel az-panel-sm" 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '12px 20px',
                  background: 'rgba(255,255,255,0.03)', 
                  border: '1px solid rgba(255,255,255,0.05)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                  <span style={{ fontSize: 20 }}>📄</span>
                  <div>
                    <div style={{ fontWeight: 700, color: '#ffffff', fontSize: 14 }}>{r.titulo}</div>
                    <div style={{ fontSize: 11, color: 'var(--brand-teal)', marginTop: 2, fontWeight: 600 }}>
                      📅 {r.dataPublicacaoTexto}
                    </div>
                  </div>
                </div>

                <a href={r.link} target="_blank" rel="noreferrer" className="az-btn az-btn-teal" style={{ padding: '6px 16px', fontSize: 12, fontWeight: 700 }}>
                  PDF 📥
                </a>
              </div>
            ))}
      </div>
    </div>
  );
} 
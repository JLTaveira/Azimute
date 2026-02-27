/* Guia/Sub-Guia
  src/pages/GuiaObjetivosGrupo.jsx
  2026-02-20 - Joao Taveira (jltaveira@gmail.com) 
  2026-02-27 - MuralOportunidades
 */

import { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import MuralOportunidades from "../components/MuralOportunidades";

const AREA_META = {
  FISICO: { nome: "Físico", bg: "#16a34a", text: "#ffffff" },
  AFETIVO: { nome: "Afetivo", bg: "#dc2626", text: "#ffffff" },
  CARACTER: { nome: "Caráter", bg: "#2563eb", text: "#ffffff" },
  ESPIRITUAL: { nome: "Espiritual", bg: "#9333ea", text: "#ffffff" },
  INTELECTUAL: { nome: "Intelectual", bg: "#ea580c", text: "#ffffff" },
  SOCIAL: { nome: "Social", bg: "#eab308", text: "#000000" },
};

// Funções Auxiliares para formatação
function areaToKey(a) {
  const k = String(a || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (k === "CARATER") return "CARACTER";
  return AREA_META[k] ? k : "OUTRA";
}

function secaoFromSecaoDocId(secaoDocId) {
  const s = String(secaoDocId || "").toLowerCase();
  if (s.includes("alcateia")) return "LOBITOS";
  if (s.includes("expedicao")) return "EXPLORADORES";
  if (s.includes("comunidade")) return "PIONEIROS";
  if (s.includes("cla")) return "CAMINHEIROS";
  return null;
}

function extrairCodigoFromOid(oid) {
  const m = String(oid || "").match(/_([A-Z]\d+)$/);
  return m ? m[1] : "";
}

function descricaoDoCatalogo(o) {
  const desc = String(o?.descricao || "").trim();
  if (desc) return desc;
  const oe = String(o?.oportunidadeEducativa || "").trim();
  const m = oe.match(/^[A-Z]\d+\s*-\s*(.*)$/);
  return m ? m[1] : oe;
}

export default function GuiaObjetivosGrupo({ profile }) {
  const [tabAtual, setTabAtual] = useState("VALIDAR");
  const [oportunidades, setOportunidades] = useState([]); 
  const [oportunidadesArquivadas, setOportunidadesArquivadas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [elementos, setElementos] = useState([]);
  const [objetivos, setObjetivos] = useState([]);
  const [catalogo, setCatalogo] = useState([]);

  const secaoBase = secaoFromSecaoDocId(profile?.secaoDocId);

  useEffect(() => {
    if (!profile?.patrulhaId || !profile?.secaoDocId) return;

    async function fetchData() {
      setLoading(true); setErro("");
      try {
        // 1. Vai buscar o Catálogo da Secção para sabermos os Títulos e Cores
        const qCat = query(collection(db, "catalogoObjetivos"), where("secao", "==", secaoBase));
        const snapCat = await getDocs(qCat);
        const cat = snapCat.docs.map(d => ({ 
        id: d.id, 
        _areaKey: areaToKey(d.data().areaDesenvolvimento || d.data().area), 
        _trilho: d.data().trilhoEducativo || d.data().trilho || "Geral", 
        _codigo: d.data().codigo || extrairCodigoFromOid(d.id), 
        _titulo: descricaoDoCatalogo(d.data()), 
        ...d.data() 
      }));
      setCatalogo(cat);

        // 2. Vai buscar os Elementos da mesma Patrulha/Bando
        const qUsers = query(
          collection(db, "users"), 
          where("agrupamentoId", "==", profile.agrupamentoId), 
          where("secaoDocId", "==", profile.secaoDocId),
          where("patrulhaId", "==", profile.patrulhaId),
          where("tipo", "==", "ELEMENTO")
        );
        const snapUsers = await getDocs(qUsers);
        const listaElementos = snapUsers.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter(u => u.uid !== profile.uid && u.ativo !== false);
      setElementos(listaElementos.sort((a,b) => a.nome.localeCompare(b.nome)));

        // 3. Vai buscar apenas os Objetivos que estão em "ESCOLHA" (A aguardar validação)
        const todosObjetivos = [];
        await Promise.all(
          listaElementos.map(async (elemento) => {
            const snapObjs = await getDocs(query(collection(db, `users/${elemento.uid}/objetivos`), where("estado", "==", "ESCOLHA")));
            snapObjs.forEach(objSnap => {
              todosObjetivos.push({ uid: elemento.uid, docId: objSnap.id, ...objSnap.data() });
            });
          })
        );
        setObjetivos(todosObjetivos);

        // 4. Vai buscar as Oportunidades Educativas enviadas pelo Chefe para esta Secção //
        const [snapCne, snapAgrup] = await Promise.all([
        getDocs(query(collection(db, "oportunidades_cne"))),
        getDocs(query(collection(db, "oportunidades_agrupamento"), 
                where("agrupamentoId", "==", profile.agrupamentoId)))
      ]);

      const todas = [
        ...snapCne.docs.map(d => ({ id: d.id, ...d.data(), tipo: 'CNE' })),
        ...snapAgrup.docs.map(d => ({ id: d.id, ...d.data(), tipo: 'LOCAL' }))
      ];

        const opsFiltradas = todas.filter(o => {
        // Normalizamos os campos da base de dados
        const pSecaoDoc = o.secaoDocId; // ID específico da Unidade (ex: Clã 115)
        const pSecaoNome = String(o.secao || "").toUpperCase(); // Nome da Secção (ex: LOBITOS)
        const pColuna = String(o.coluna || "").toUpperCase();

        // CONDIÇÃO ESTRITA:
        // 1. Foi enviado especificamente para a tua Unidade (Clã/Patrulha/Bando)
        if (pSecaoDoc === profile.secaoDocId) return true;

        // 2. Foi enviado para a tua Secção (dinâmico: LOBITOS, EXPLORADORES, etc.)
        // mas APENAS se não for uma mensagem de âmbito geral de Agrupamento
        const eParaMinhaSecao = (pSecaoNome === secaoBase) || pColuna.includes(secaoBase);
        
        // Se for para a tua secção e tiver um alvo definido, o Guia vê.
        // Se for "GERAL", o filtro ignora (consultas como elemento noutra tab).
        return (
          o.secaoDocId === profile.secaoDocId && 
          o.destinatarios === "GUIAS"
        );
      });
      
      setOportunidades(opsFiltradas.filter(o => !o.arquivada));
      setOportunidadesArquivadas(opsFiltradas.filter(o => o.arquivada));

      } catch (err) {
        console.error("Erro detalhado:", err);
        setErro("Erro ao carregar os dados da patrulha.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [profile, secaoBase]);

  // Junta os dados do utilizador com os dados bonitos do Catálogo
  const objetivosEnriquecidos = useMemo(() => {
    return objetivos.map(obj => {
      const catItem = catalogo.find(c => c.id === obj.docId) || {};
      return { ...obj, ...catItem };
    });
  }, [objetivos, catalogo]);

  // Função para o Guia clicar em "Validar"
  async function handleValidar(uid, docId, titulo) {
    if (!window.confirm(`Queres validar o objetivo "${titulo || 'Desconhecido'}"?\nIsto enviará a proposta para a aprovação final da Equipa de Animação.`)) return;

    try {
      const ref = doc(db, `users/${uid}/objetivos/${docId}`);
      await updateDoc(ref, {
        estado: "VALIDADO",
        validadoPor: profile.uid,
        validadoAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Remove imediatamente da lista visual
      setObjetivos(prev => prev.filter(o => !(o.uid === uid && o.docId === docId)));
    } catch (error) {
      alert("Erro ao validar objetivo. Verifica as tuas ligações ou permissões.");
    }
  }

  if (loading) return <div className="az-loading-screen"><div className="az-logo-pulse">⏳</div></div>;
  if (erro) return <div className="az-alert az-alert--error">{erro}</div>;

  // Agrupa os objetivos por Elemento para a UI ficar arrumada
  const grouped = {};
  objetivosEnriquecidos.forEach(obj => {
    if (!grouped[obj.uid]) {
      const el = elementos.find(e => e.uid === obj.uid);
      grouped[obj.uid] = { nome: el?.nome || "Elemento Desconhecido", objs: [] };
    }
    grouped[obj.uid].objs.push(obj);
  });

  return (

  <div className="az-page-container">
      <div className="az-tabs-container" style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
      
      <button 
        onClick={() => setTabAtual("VALIDAR")}
        className={`az-tab-pill ${tabAtual === "VALIDAR" ? "active" : ""}`}
        style={{
          padding: "6px 16px",
          borderRadius: "20px",
          border: tabAtual === "VALIDAR" ? "1px solid var(--brand-teal)" : "1px solid transparent",
          background: tabAtual === "VALIDAR" ? "rgba(0, 150, 136, 0.1)" : "transparent",
          color: tabAtual === "VALIDAR" ? "#fff" : "var(--text-muted)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: "14px"
        }}
      >
        🎯 Validar Propostas
      </button>

      <button 
        onClick={() => setTabAtual("OPORTUNIDADES")}
        className={`az-tab-pill ${tabAtual === "OPORTUNIDADES" ? "active" : ""}`}
        style={{
          padding: "6px 16px",
          borderRadius: "20px",
          border: tabAtual === "OPORTUNIDADES" ? "1px solid var(--brand-teal)" : "1px solid transparent",
          background: tabAtual === "OPORTUNIDADES" ? "rgba(0, 150, 136, 0.1)" : "transparent",
          color: tabAtual === "OPORTUNIDADES" ? "#fff" : "var(--text-muted)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: "14px"
        }}
      >
        📢 Oportunidades Educativas
      </button>

    </div>

    {/* 2. Conteúdo Condicional */}
    {tabAtual === "VALIDAR" && (
      <div className="animate-fade-in">
        {Object.keys(grouped).length === 0 ? (
          <div className="az-panel" style={{ textAlign: "center", padding: "60px 20px", background: "rgba(255,255,255,0.05)", borderRadius: "12px" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
            <p style={{ color: "var(--text-muted)", fontSize: "1.1rem" }}>
              Tudo em dia! Não há objetivos propostos na tua unidade a aguardar validação.
            </p>
          </div>
        ) : (
          Object.values(grouped).map(group => (
            <div key={group.nome} className="az-card" style={{ marginBottom: 16 }}>
              <div className="az-card-inner">
                <h3 style={{ margin: "0 0 16px 0", color: "var(--brand-teal)", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--stroke)", paddingBottom: 8 }}>
                  👤 {group.nome}
                </h3>
                
                <div className="az-grid" style={{ display: "grid", gap: 12 }}>
                  {group.objs.map(obj => (
                    <div key={obj.docId} className="az-panel az-panel-sm" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "12px", border: "1px solid var(--stroke)", borderRadius: 8 }}>
                      
                      <span className="az-area-badge" style={{ background: AREA_META[obj._areaKey]?.bg || "#333", color: AREA_META[obj._areaKey]?.text || "#fff", padding: "4px 8px", borderRadius: 4, fontSize: "11px", fontWeight: 700 }}>
                        {obj._codigo || "?"}
                      </span>
                      
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontWeight: 700, color: "var(--panel-text)" }}>{obj._titulo || "Objetivo sem título"}</div>
                        <div className="az-small" style={{ opacity: 0.7, fontSize: "12px" }}>
                          Trilho: {obj._trilho || "Geral"} • Área: {AREA_META[obj._areaKey]?.nome || "Outra"}
                        </div>
                      </div>
                      
                      <button 
                        className="az-btn az-btn-primary" 
                        onClick={() => handleValidar(obj.uid, obj.docId, obj._titulo)}
                      >
                        ✅ Validar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    )}

    {tabAtual === "OPORTUNIDADES" && (
      <div className="animate-fade-in">
        <div className="az-panel" style={{ 
          background: "rgba(255,255,255,0.05)", padding: "16px 24px", borderRadius: "12px", 
          marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" 
        }}>
          <h3 style={{ margin: 0, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
            📢 Oportunidades para a Unidade
          </h3>
          <button style={{ 
            background: "rgba(255,255,255,0.1)", border: "none", color: "#eee", 
            padding: "6px 12px", borderRadius: "8px", fontSize: "12px" 
          }}>
            📂 Ver Arquivo ({(oportunidadesArquivadas || []).length})
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {oportunidades.map((op) => (
            <div key={op.id} style={{
              background: "#121212", border: "1px solid #1a2a2a", borderTop: "3px solid var(--brand-teal)",
              borderRadius: "12px", padding: "20px", boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
            }}>
              <h4 style={{ color: "#ff8a00", margin: "0 0 12px 0", fontSize: "16px" }}>{op.titulo}</h4>
              <p style={{ color: "#bbb", fontSize: "14px", lineHeight: "1.6", marginBottom: 20 }}>{op.descricao}</p>
              
              <div style={{ 
                display: "flex", justifyContent: "space-between", alignItems: "center", 
                borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 16 
              }}>
                <a href={op.link} target="_blank" rel="noreferrer" style={{ color: "#4a90e2", textDecoration: "none", fontSize: "13px" }}>
                  Abrir Link 🔗
                </a>
                {/* Apenas botão Arquivar para o Guia */}
                <button className="az-btn-sm" style={{ 
                  background: "#eee", color: "#333", border: "none", padding: "6px 16px", 
                  borderRadius: "6px", fontSize: "12px", fontWeight: "700" 
                }}>
                  📥 Arquivar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
    )}




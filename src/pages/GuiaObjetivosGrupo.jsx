/* Grelha do Guia:
Guia/Sub-Guia aqui só consegue fazer VALIDADO e REALIZADO (compatível com as rules que escreveste).
Se o objetivo estiver DISPONÍVEL, aparece “ainda não foi proposto” (guia não cria nada).
src/pages/GuiaObjetivosGrupo.jsx
 2026-02-20 - Joao Taveira (jltaveira@gmail.com) */


import { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

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
        const cat = snapCat.docs.map(d => {
          const data = d.data();
          return { 
            id: d.id, 
            _areaKey: areaToKey(data.areaDesenvolvimento || data.area), 
            _trilho: data.trilhoEducativo || data.trilho || "Geral", 
            _codigo: data.codigo || extrairCodigoFromOid(d.id), 
            _titulo: descricaoDoCatalogo(data), 
            ...data 
          };
        });
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
        const listaElementos = [];
        snapUsers.forEach(d => {
          // 🚨 FILTRO AQUI: Excluímos o próprio Guia E os elementos inativos
          if (d.id !== profile.uid && d.data().ativo !== false) {
            listaElementos.push({ uid: d.id, ...d.data() });
          }
        });
        setElementos(listaElementos.sort((a,b) => String(a.nome).localeCompare(String(b.nome))));

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

      } catch (err) {
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
    <div className="az-grid" style={{ gap: 24 }}>
      <div className="az-card">
        <div className="az-card-inner">
          <h2 className="az-h2" style={{ display: "flex", alignItems: "center", gap: 10 }}>⚜️ Conselho de Guias Digital</h2>
          <p className="az-muted az-small" style={{ marginTop: 4 }}>
            Valida os objetivos que os teus elementos propuseram. Ao aprovares, eles seguirão para o Chefe de Unidade.
          </p>
        </div>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="az-panel" style={{ textAlign: "center", padding: "40px" }}>
          <div style={{ fontSize: 40, opacity: 0.5 }}>✅</div>
          <p className="az-muted" style={{ marginTop: 12 }}>Tudo em dia! Não há objetivos propostos na tua unidade a aguardar validação.</p>
        </div>
      ) : (
        Object.values(grouped).map(group => (
          <div key={group.nome} className="az-card">
            <div className="az-card-inner">
              <h3 style={{ margin: "0 0 16px 0", color: "var(--brand-teal)", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--stroke)", paddingBottom: 8 }}>
                👤 {group.nome}
              </h3>
              
              <div className="az-grid" style={{ gap: 12 }}>
                {group.objs.map(obj => (
                  <div key={obj.docId} className="az-panel az-panel-sm" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    
                    {/* Badge da Área (Colorido) */}
                    <span className="az-area-badge" style={{ background: AREA_META[obj._areaKey]?.bg || "#333", color: AREA_META[obj._areaKey]?.text || "#fff" }}>
                      {obj._codigo || "?"}
                    </span>
                    
                    {/* Título e Trilho */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 700, color: "var(--panel-text)" }}>{obj._titulo || "Objetivo sem título"}</div>
                      <div className="az-small muted">
                        Trilho: {obj._trilho || "Geral"} • Área: {AREA_META[obj._areaKey]?.nome || "Outra"}
                      </div>
                    </div>
                    
                    {/* Botão Validar */}
                    <div>
                      <button 
                        className="az-btn az-btn-primary" 
                        style={{ padding: "8px 16px", fontWeight: 700 }}
                        onClick={() => handleValidar(obj.uid, obj.docId, obj._titulo)}
                      >
                        ✅ Validar
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
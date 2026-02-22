/* Grelha do Guia:
Guia/Sub-Guia aqui só consegue fazer VALIDADO e REALIZADO (compatível com as rules que escreveste).
Se o objetivo estiver DISPONÍVEL, aparece “ainda não foi proposto” (guia não cria nada).
src/pages/GuiaObjetivosGrupo.jsx
 2026-02-20 - Joao Taveira (jltaveira@gmail.com) */


/* GUIAOBJETIVOSGRUPO.jsx - Versão Optimizada
   O ecrã onde o Guia valida as propostas da sua Patrulha
   2026-02-22 - Azimute Helper */

import { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

const AREAS_COLORS = {
  FISICO: "az-area--fisico",
  AFETIVO: "az-area--afetivo",
  CARACTER: "az-area--caracter",
  ESPIRITUAL: "az-area--espiritual",
  INTELECTUAL: "az-area--intelectual",
  SOCIAL: "az-area--social"
};

export default function GuiaObjetivosGrupo({ profile }) {
  const [pendentes, setPendentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!profile?.patrulhaId || !profile?.secaoDocId) {
      setLoading(false);
      setErro("Não tens uma subunidade atribuída no teu perfil.");
      return;
    }
    fetchPropostasDaPatrulha();
  }, [profile]);

  async function fetchPropostasDaPatrulha() {
    setLoading(true);
    setErro("");
    try {
      // 1. Obter todos os elementos que pertencem à mesma patrulha
      const qUsers = query(
        collection(db, "users"),
        where("agrupamentoId", "==", profile.agrupamentoId),
        where("secaoDocId", "==", profile.secaoDocId),
        where("patrulhaId", "==", profile.patrulhaId)
      );
      
      const snapUsers = await getDocs(qUsers);
      const elementosPatrulha = [];
      
      snapUsers.forEach(d => {
        // Excluímos o próprio Guia, pois os objetivos dele vão direto para o Chefe
        if (d.id !== profile.uid) {
          elementosPatrulha.push({ uid: d.id, nome: d.data().nome, totem: d.data().totem });
        }
      });

      // 2. Procurar em paralelo os objetivos no estado "ESCOLHA" de cada elemento
      const objetivosPendentes = [];
      
      await Promise.all(
        elementosPatrulha.map(async (elemento) => {
          const qObjs = query(
            collection(db, `users/${elemento.uid}/objetivos`),
            where("estado", "==", "ESCOLHA")
          );
          const snapObjs = await getDocs(qObjs);
          
          snapObjs.forEach(objSnap => {
            const data = objSnap.data();
            objetivosPendentes.push({
              uid: elemento.uid,
              docId: objSnap.id,
              elementoNome: elemento.nome,
              elementoTotem: elemento.totem,
              ...data
            });
          });
        })
      );

      setPendentes(objetivosPendentes);
    } catch (err) {
      console.error("Erro ao carregar propostas da patrulha:", err);
      setErro("Ocorreu um erro ao carregar os dados. Verifica as tuas permissões.");
    } finally {
      setLoading(false);
    }
  }

  // Ação de Validação do Guia
  async function handleValidar(uid, docId, titulo) {
    if (!window.confirm(`Queres validar o objetivo "${titulo}"? \nIsto enviará a proposta para a aprovação final do Chefe de Unidade.`)) {
      return;
    }

    try {
      const ref = doc(db, `users/${uid}/objetivos/${docId}`);
      await updateDoc(ref, {
        estado: "VALIDADO", // Muda o estado para que saia da lista do Guia e vá para o Chefe
        validadoAt: serverTimestamp(),
        validadoPorUid: profile.uid // Guarda quem foi o Guia que validou
      });

      // Remove da lista atual visualmente sem precisar de recarregar a base de dados
      setPendentes(prev => prev.filter(o => !(o.uid === uid && o.docId === docId)));
    } catch (err) {
      alert("Erro ao validar: " + err.message);
    }
  }

  // Agrupar visualmente por Elemento para facilitar a leitura no Conselho de Guias
  const pendentesPorElemento = useMemo(() => {
    const mapa = {};
    pendentes.forEach(obj => {
      if (!mapa[obj.uid]) {
        mapa[obj.uid] = {
          nome: obj.elementoTotem || obj.elementoNome,
          objetivos: []
        };
      }
      mapa[obj.uid].objetivos.push(obj);
    });
    return mapa;
  }, [pendentes]);

  if (loading) return <div className="az-muted">A reunir os dados da tua unidade...</div>;
  if (erro) return <div className="az-alert az-alert--error">{erro}</div>;

  const arrayElementos = Object.values(pendentesPorElemento);

  return (
    <div className="az-grid" style={{ gap: 24 }}>
      <div>
        <h2 className="az-h2">⚜️ Conselho de Guias Digital</h2>
        <p className="az-muted az-small" style={{ marginTop: 4 }}>
          Valida os objetivos que os teus elementos propuseram ou realizaram. Ao aprovares, eles seguirão para o Chefe de Unidade.
        </p>
      </div>

      {arrayElementos.length === 0 ? (
        <div className="az-panel" style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏕️</div>
          <b style={{ fontSize: 16 }}>Tudo em dia!</b>
          <p className="az-panel-muted" style={{ margin: "8px 0 0" }}>
            Não existem objetivos pendentes de validação na tua patrulha/equipa.
          </p>
        </div>
      ) : (
        <div className="az-grid" style={{ gap: 24 }}>
          {arrayElementos.map((elemento, idx) => (
            <div key={idx} className="az-card">
              <div className="az-card-inner">
                <h3 style={{ margin: "0 0 16px 0", borderBottom: "1px solid var(--stroke)", paddingBottom: 8 }}>
                  👤 {elemento.nome}
                </h3>
                
                <div className="az-grid" style={{ gap: 12 }}>
                  {elemento.objetivos.map(obj => (
                    <div key={obj.docId} className="az-panel az-panel-sm" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      
                      <span className={`az-area-badge ${AREAS_COLORS[obj.area] || ""}`}>
                        {obj.area}
                      </span>
                      
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontWeight: 700, color: "var(--panel-text)" }}>{obj.titulo}</div>
                        <div className="az-small muted">Proposto a: {obj.propostoAt?.toDate().toLocaleDateString('pt-PT') || "Recentemente"}</div>
                      </div>

                      <button 
                        className="az-btn az-btn-primary" 
                        onClick={() => handleValidar(obj.uid, obj.docId, obj.titulo)}
                      >
                        ✅ Validar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
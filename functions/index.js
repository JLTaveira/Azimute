/**
 * Firebase Functions
 * ./functions/index.js
 * 2026-02-23 - Joao Taveira (jltaveira@gmail.com)
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

// Inicializa o Admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// Define a região europe-west1 para TODAS as funções de forma global
setGlobalOptions({ region: "europe-west1" });

// ============================================================================
// 1. RESET DA PASSWORD
// ============================================================================
exports.resetUserPassword = onCall(async (request) => {
  const { data, auth } = request;
  if (!auth) throw new HttpsError("unauthenticated", "Sessão expirada.");

  const db = admin.firestore();
  const targetUid = data.uid;

  try {
    const callerSnap = await db.collection("users").doc(auth.uid).get();
    const targetSnap = await db.collection("users").doc(targetUid).get();
    
    if (!targetSnap.exists) throw new HttpsError("not-found", "Utilizador não encontrado.");

    const callerProfile = callerSnap.data();
    const targetProfile = targetSnap.data();
    const callerFuncoes = callerProfile.funcoes || [];

    const isSA = callerFuncoes.includes("SECRETARIO_AGRUPAMENTO");
    
    if (targetProfile.tipo === "DIRIGENTE" && !isSA) {
      throw new HttpsError("permission-denied", "Sem permissão.");
    }

    await admin.auth().updateUser(targetUid, { password: "Azimute2026" });
    await db.collection("users").doc(targetUid).update({
      forcarMudancaPassword: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true };
  } catch (error) {
    throw new HttpsError("internal", error.message);
  }
});

// ============================================================================
// 2. IMPORTAÇÃO DE UTILIZADORES
// ============================================================================
// ============================================================================
// 2. IMPORTAÇÃO DE UTILIZADORES
// ============================================================================
exports.importUsersBatch = onCall(async (request) => {
  const { data, auth } = request;
  if (!auth) throw new HttpsError("unauthenticated", "Sem permissão.");

  const db = admin.firestore();
  const callerSnap = await db.collection("users").doc(auth.uid).get();
  const callerProfile = callerSnap.data();

  if (!callerProfile.funcoes?.includes("SECRETARIO_AGRUPAMENTO")) {
    throw new HttpsError("permission-denied", "Apenas Secretaria.");
  }

  const results = { success: 0, errors: [] };
  // Formata a data para a mensagem de OS
  const dataOS = new Date().toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });

  for (const u of data.users) {
    const email = `${u.nin}@azimute.cne`;
    try {
      const userRecord = await admin.auth().createUser({
        email: email,
        password: "Azimute#2026",
        displayName: u.nome,
      });

      await db.collection("users").doc(userRecord.uid).set({
        nome: u.nome,
        email: email,
        nin: String(u.nin),
        agrupamentoId: callerProfile.agrupamentoId,
        secaoDocId: u.secaoFinal || null,
        tipo: u.tipoFinal || "ELEMENTO",
        funcoes: u.funcoesTratadas || [],
        ativo: true,
        forcarMudancaPassword: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 🚨 GERA A MENSAGEM AUTOMÁTICA DE IMPORTAÇÃO PARA O SIIE
      await db.collection("notificacoes").add({
        agrupamentoId: callerProfile.agrupamentoId,
        uidElemento: userRecord.uid,
        elementoNome: u.nome,
        secaoDocId: u.secaoFinal || "GERAL",
        descricao: `${dataOS} | ${u.nin} | ${u.nome} | Importado e Ativado!`,
        tipo: "ESTADO_CONTA",
        resolvida: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      results.success++;
    } catch (err) {
      results.errors.push({ nin: u.nin, error: err.message });
    }
  }
  return results;
});
// ============================================================================
// 3. ATIVAR / DESATIVAR UTILIZADOR
// ============================================================================
exports.toggleUserStatus = onCall(async (request) => {
  const { data, auth } = request;
  if (!auth) throw new HttpsError("unauthenticated", "Sessão expirada.");

  const db = admin.firestore();
  const { uid, ativo } = data;

  try {
    const callerSnap = await db.collection("users").doc(auth.uid).get();
    const caller = callerSnap.data();
    
    // Verificação de segurança (Secretaria ou Chefia)
    if (!caller.funcoes?.includes("SECRETARIO_AGRUPAMENTO") && !caller.funcoes?.includes("CHEFE_AGRUPAMENTO")) {
      throw new HttpsError("permission-denied", "Apenas a Secretaria tem permissão.");
    }

    const targetRef = db.collection("users").doc(uid);
    const targetSnap = await targetRef.get();
    const targetData = targetSnap.data();

    let updateData = { 
      ativo: ativo,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // LÓGICA DE TRANSFERÊNCIA: Se ativar e o agrupamento for diferente
    if (ativo === true && targetData.agrupamentoId !== caller.agrupamentoId) {
      updateData = {
        ...updateData,
        agrupamentoId: caller.agrupamentoId, // Assume o novo agrupamento
        // Limpeza pedagógica
        etapaProgresso: null,
        funcoes: [],
        patrulhaId: null,
        secaoDocId: null,
        isGuia: false,
        isSubGuia: false,
        tipo: "ELEMENTO" // Reset por defeito para ser reatribuído
      };
    }

    await targetRef.update(updateData);

    // Bloqueia/Desbloqueia Login
    await admin.auth().updateUser(uid, { disabled: !ativo });

    return { success: true };
  } catch (error) {
    throw new HttpsError("internal", error.message);
  }
});
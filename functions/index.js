/**
 * Firebase Functions
 * ./functions/index.js
 * 2026-02-23 - Joao Taveira (jltaveira@gmail.com)
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

exports.resetUserPassword = functions.https.onCall(async (data, context) => {
  // 1. Verificar se quem chama a função está logado
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Precisas de ter sessão iniciada.");
  }

  const targetUid = data.uid;
  if (!targetUid) {
    throw new functions.https.HttpsError("invalid-argument", "Falta o UID do alvo.");
  }

  const callerUid = context.auth.uid;
  const db = admin.firestore();

  // 2. Ir buscar os perfis (Quem pede vs Quem sofre o reset)
  const callerSnap = await db.collection("users").doc(callerUid).get();
  const targetSnap = await db.collection("users").doc(targetUid).get();

  if (!callerSnap.exists || !targetSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Perfil não encontrado.");
  }

  const callerProfile = callerSnap.data();
  const targetProfile = targetSnap.data();

  // 3. Verificar Permissões e Regras de Negócio
  const callerFuncoes = callerProfile.funcoes || [];
  const isSA = callerFuncoes.includes("SECRETARIO_AGRUPAMENTO");
  const isCU = callerFuncoes.includes("CHEFE_UNIDADE");

  if (targetProfile.tipo === "DIRIGENTE") {
    if (!isSA || callerProfile.agrupamentoId !== targetProfile.agrupamentoId) {
      throw new functions.https.HttpsError("permission-denied", "Apenas o Secretário pode fazer reset a Dirigentes.");
    }
  } else if (targetProfile.tipo === "ELEMENTO") {
    if (!isCU || callerProfile.secaoDocId !== targetProfile.secaoDocId) {
      throw new functions.https.HttpsError("permission-denied", "Apenas o Chefe de Unidade pode fazer reset aos seus elementos.");
    }
  }

  // 4. Executar o Reset (Password predefinida e Forçar Mudança)
  const defaultPassword = "Azimute2026"; // A password que vão usar para entrar a 1ª vez após o reset
  
  try {
    await admin.auth().updateUser(targetUid, {
      password: defaultPassword
    });

    await db.collection("users").doc(targetUid).update({
      forcarMudancaPassword: true, // A flag mágica que tranca a app
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { message: "Sucesso" };
  } catch (error) {
    console.error("Erro ao fazer reset:", error);
    throw new functions.https.HttpsError("internal", "Erro interno no Firebase.");
  }
});
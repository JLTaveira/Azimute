/**
 * Firebase Functions
 * ./functions/index.js
 * 2026-02-23 - Joao Taveira (jltaveira@gmail.com)
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler"); // Novo import para agendamentos
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const axios = require("axios");
const xml2js = require("xml2js");
const cheerio = require("cheerio");

// Inicializa o Admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

// Define a região europe-west1 para TODAS as funções de forma global
setGlobalOptions({ region: "europe-west1" });

// ============================================================================
// 1. RESET DA PASSWORD (MANTIDO)
// ============================================================================
exports.resetUserPassword = onCall(async (request) => {
  const { data, auth } = request;
  if (!auth) throw new HttpsError("unauthenticated", "Sessão expirada.");

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
// 2. IMPORTAÇÃO DE UTILIZADORES (MANTIDO)
// ============================================================================
exports.importUsersBatch = onCall(async (request) => {
  const { data, auth } = request;
  if (!auth) throw new HttpsError("unauthenticated", "Sem permissão.");

  const callerSnap = await db.collection("users").doc(auth.uid).get();
  const callerProfile = callerSnap.data();

  if (!callerProfile.funcoes?.includes("SECRETARIO_AGRUPAMENTO")) {
    throw new HttpsError("permission-denied", "Apenas Secretaria.");
  }

  const results = { success: 0, errors: [] };
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
// 3. ATIVAR / DESATIVAR UTILIZADOR (MANTIDO)
// ============================================================================
exports.toggleUserStatus = onCall(async (request) => {
  const { data, auth } = request;
  if (!auth) throw new HttpsError("unauthenticated", "Sessão expirada.");

  const { uid, ativo } = data;

  try {
    const callerSnap = await db.collection("users").doc(auth.uid).get();
    const caller = callerSnap.data();
    
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

    if (ativo === true && targetData.agrupamentoId !== caller.agrupamentoId) {
      updateData = {
        ...updateData,
        agrupamentoId: caller.agrupamentoId,
        etapaProgresso: null,
        funcoes: [],
        patrulhaId: null,
        secaoDocId: null,
        isGuia: false,
        isSubGuia: false,
        tipo: "ELEMENTO"
      };
    }

    await targetRef.update(updateData);
    await admin.auth().updateUser(uid, { disabled: !ativo });

    return { success: true };
  } catch (error) {
    throw new HttpsError("internal", error.message);
  }
});

// ============================================================================
// 4. SINCRONIZAÇÃO PADLET CNE (MANTIDO)
// ============================================================================
exports.syncOportunidadesCNE = onCall(async (request) => {
  const { auth } = request;
  if (!auth) throw new HttpsError("unauthenticated", "Sem permissão.");

  const PADLET_RSS_URL = "https://padlet.com/padlets/msoqzzz192up2go7/exports/feed.xml";

  try {
    const response = await axios.get(PADLET_RSS_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Azimute Bot 1.0)' }
    });
    
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);
    
    const itemsRaw = result.rss?.channel?.item;
    if (!itemsRaw) return { success: true, message: "Não foram encontradas novas publicações." };

    const items = Array.isArray(itemsRaw) ? itemsRaw : [itemsRaw];
    const batch = db.batch();
    let importados = 0;

    for (const item of items) {
      let rawId = item.guid?._ || item.guid || String(item.link || Math.random());
      const cleanId = rawId.replace(/[^a-zA-Z0-9]/g, "_");

      const docRef = db.collection("oportunidades_cne").doc(cleanId);
      
      batch.set(docRef, {
        idPost: cleanId,
        titulo: item.title || "Sem título",
        descricao: item.description || "Sem descrição",
        link: item.link || "",
        coluna: item.category || "Geral",
        pubDate: item.pubDate || "",
        ativo: true,
        lastSync: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      importados++;
    }

    await batch.commit();
    return { success: true, message: `${importados} publicações reais sincronizadas do Padlet!` };

  } catch (error) {
    console.error("Erro na sincronização:", error);
    throw new HttpsError("internal", "Falha na ligação: " + error.message);
  }
});

// ============================================================================
// 5. MÓDULO: RECURSOS OFICIAIS CNE (AUTOMAÇÃO TOTAL)
// ============================================================================

/**
 * 5.1 Sincronização Diária (07:00 AM)
 * Verifica novidades todas as manhãs automaticamente
 */
exports.scheduledRecursosSync = onSchedule("0 7 * * *", async (event) => {
  await executarSincronizacaoRecursos(5); 
  console.log("Sincronização diária concluída.");
});

/**
 * 5.2 Limpeza Dinâmica Rolante (Meia-noite)
 * Mantém apenas o histórico dos últimos 367 dias
 */
exports.limpezaDinamicaRecursos = onSchedule("0 0 * * *", async (event) => {
  const hoje = new Date();
  const dataCorte = new Date(hoje);
  dataCorte.setDate(hoje.getDate() - 367);
  const limiteISO = dataCorte.toISOString().split('T')[0];

  const snapshot = await db.collection('recursos_oficiais_cne')
    .where('dataPublicacao', '<', limiteISO)
    .get();

  const batch = db.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  console.log(`Limpeza diária: ${snapshot.size} registos antigos removidos.`);
});

/**
 * Função de Processamento Principal
 * Agora usa o seletor .df-book-title descoberto no teu script Python
 */
async function executarSincronizacaoRecursos(numPaginas) {
  const AJAX_URL = "https://escutismo.pt/wp-admin/admin-ajax.php";
  // Definido para 2024 para recuperares os 89 documentos originais
  const START_DATE_FILTER = "2024-01-01"; 
  let verificados = 0;

  for (let p = 1; p <= numPaginas; p++) {
    try {
      const params = new URLSearchParams({
        'action': 'recursos_list',
        'tipo_de_recurso': 'oficiais',
        'paged': p.toString(),
        'posts_per_page': '15'
      });

      const response = await axios.post(AJAX_URL, params, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });

      if (!response.data?.success) break;

      const $ = cheerio.load(response.data.data.html);
      const batch = db.batch();

      $('.recurso-item').each((i, el) => {
        const target = $(el).find('div[data-pdf]');
        
        // --- A TUA DESCOBERTA: Extração via .df-book-title ---
        const textoMeta = $(el).find('.df-book-title').text().trim();
        
        if (target.length) {
          const url = target.attr('data-pdf');
          const titulo = (target.attr('data-title') || "Sem Título").trim();
          
          // Captura o padrão DD-MM-YYYY (Ex: 30-05-2025)
          const match = textoMeta.match(/(\d{2})-(\d{2})-(\d{4})/);
          let dataFormatada = "2024-01-01";
          
          if (match) {
            // Converte para YYYY-MM-DD para que o Firebase ordene corretamente
            dataFormatada = `${match[3]}-${match[2]}-${match[1]}`;
          }

          if (dataFormatada < START_DATE_FILTER) return;

          // ID ÚNICO: Link completo em Base64 para evitar atropelamentos
          const docId = Buffer.from(url).toString('base64').replace(/[/+=]/g, '_').substring(0, 150);
          const docRef = db.collection('recursos_oficiais_cne').doc(docId);

          batch.set(docRef, {
            titulo,
            link: url,
            dataPublicacaoTexto: match ? match[0] : "Data n/d",
            dataPublicacao: dataFormatada,
            tipo: 'OFICIAL',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          
          verificados++;
        }
      });

      await batch.commit();
    } catch (error) {
      console.error(`Erro pág ${p}:`, error.message);
    }
  }
  return verificados;
}
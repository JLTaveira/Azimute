/* Reset users e importar do XLSX para Firestore + Auth
 reset_and_import.js
 2026-02-17 - Joao Taveira (jltaveira@gmail.com) */

const admin = require("firebase-admin");
const XLSX = require("xlsx");
const path = require("path");

// =========================
// CONFIG
// =========================
const SERVICE_ACCOUNT = "./serviceAccountKey.json";
const XLSX_FILE = "./ElementosAgrupamento.xlsx";
const DEFAULT_PASSWORD = "Azimute#1104!";
const EMAIL_DOMAIN = "@azimute.cne";

// IDs/nomes fixos de Bandos (Lobitos)
const LOBITOS_BANDOS_FIXOS = ["branco", "castanho", "cinzento", "preto", "ruivo"];

// Identificação da secção Lobitos (pelo secaoDocId)
function isSecaoLobitos(secaoDocId) {
  return String(secaoDocId || "").toLowerCase().includes("alcateia");
}

// =========================
// INIT FIREBASE ADMIN
// =========================
admin.initializeApp({
  credential: admin.credential.cert(require(path.resolve(SERVICE_ACCOUNT))),
});

const db = admin.firestore();
const auth = admin.auth();

// =========================
// HELPERS
// =========================
function toBool(v) {
  return v === true || v === 1 || v === "1" || v === "TRUE" || v === "true";
}

function parseFuncoes(v) {
  if (!v) return [];
  return String(v)
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);
}

function clean(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function normalizeId(v) {
  const s = clean(v);
  if (!s) return null;
  // evita espaços nos IDs
  return s.replace(/\s+/g, "_");
}

async function upsertPatrulha({ agrupamentoId, secaoDocId, patrulhaId, nome }) {
  const ref = db
    .collection("agrupamento")
    .doc(agrupamentoId)
    .collection("secoes")
    .doc(secaoDocId)
    .collection("subunidades") // mantemos o nome da subcoleção
    .doc(patrulhaId);

  await ref.set(
    {
      nome: nome || patrulhaId,
      ativo: true, // sempre true por defeito
      guiaUid: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

// =========================
// RESET USERS (AUTH + FIRESTORE users)
// =========================
async function resetUsers() {
  console.log("🧹 A apagar users Firestore...");
  const snap = await db.collection("users").get();

  let batch = db.batch();
  let ops = 0;

  for (const d of snap.docs) {
    batch.delete(d.ref);
    ops++;
    if (ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();

  console.log(`✔ ${snap.size} docs removidos de Firestore (users)`);

  console.log("🧹 A apagar users Auth...");
  let nextPageToken = undefined;
  let count = 0;

  do {
    const list = await auth.listUsers(1000, nextPageToken);
    const uids = list.users
      .filter((u) => u.email && u.email.endsWith(EMAIL_DOMAIN))
      .map((u) => u.uid);

    if (uids.length > 0) {
      await auth.deleteUsers(uids);
      count += uids.length;
    }
    nextPageToken = list.pageToken;
  } while (nextPageToken);

  console.log(`✔ ${count} users removidos do Auth`);
}

// =========================
// IMPORT (Patrulhas + Users)
// =========================
async function importAll() {
  console.log("📥 A ler XLSX...");

  const wb = XLSX.readFile(XLSX_FILE);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  console.log(`📄 ${rows.length} linhas encontradas`);

  // 1) Descobrir patrulhas necessárias a partir do XLSX (exceto Lobitos)
  // key: `${agrupamentoId}::${secaoDocId}::${patrulhaId}` -> nome
  const neededPatrulhas = new Map();

  // Também vamos recolher todas as secoes Lobitos encontradas para criar os 5 bandos fixos
  // key: `${agrupamentoId}::${secaoDocId}`
  const secoesLobitos = new Set();

  for (const row of rows) {
    const agrupamentoId = clean(row.agrupamentoId);
    const secaoDocId = clean(row.secaoDocId);
    const tipo = clean(row.tipo);
    const patrulhaId = normalizeId(row.patrulhaId);

    if (!agrupamentoId || !secaoDocId) continue;

    if (isSecaoLobitos(secaoDocId)) {
      secoesLobitos.add(`${agrupamentoId}::${secaoDocId}`);
      continue; // ignorar patrulhas vindas do excel para Lobitos
    }

    // Só cria patrulhas para ELEMENTO com patrulhaId definido
    if (tipo === "ELEMENTO" && patrulhaId) {
      const nome = patrulhaId; // sem "subunidadeNome" (como preferiste)
      const key = `${agrupamentoId}::${secaoDocId}::${patrulhaId}`;
      if (!neededPatrulhas.has(key)) neededPatrulhas.set(key, nome);
    }
  }

  // 2) Criar bandos fixos para cada secção Lobitos encontrada
  if (secoesLobitos.size > 0) {
    console.log(`🐺 Lobitos: a criar ${LOBITOS_BANDOS_FIXOS.length} Bandos fixos por secção...`);
    for (const k of secoesLobitos) {
      const [agrupamentoId, secaoDocId] = k.split("::");
      for (const b of LOBITOS_BANDOS_FIXOS) {
        await upsertPatrulha({ agrupamentoId, secaoDocId, patrulhaId: b, nome: b });
      }
    }
    console.log("✔ Bandos fixos (Lobitos) garantidos");
  }

  // 3) Criar patrulhas/equipas/tribos a partir do XLSX (não-lobitos)
  console.log(`🏷️ A criar/atualizar ${neededPatrulhas.size} patrulhas/equipas/tribos (não-Lobitos)...`);
  for (const [key, nome] of neededPatrulhas.entries()) {
    const [agrupamentoId, secaoDocId, patrulhaId] = key.split("::");
    await upsertPatrulha({ agrupamentoId, secaoDocId, patrulhaId, nome });
  }
  console.log("✔ Patrulhas/equipas/tribos garantidas");

  // 4) Criar Auth + users docs
  for (const row of rows) {
    const nin = clean(row.nin);
    if (!nin) {
      console.log("⚠ Linha ignorada (NIN vazio)");
      continue;
    }

    const email = nin + EMAIL_DOMAIN;

    const nome = clean(row.nome);
    const agrupamentoId = clean(row.agrupamentoId);
    const secaoDocId = clean(row.secaoDocId);
    const tipo = clean(row.tipo);

    const patrulhaId = normalizeId(row.patrulhaId);
    const etapaProgresso = clean(row.etapaProgresso);

    const isGuia = toBool(row.isGuia);
    const isSubGuia = toBool(row.isSubGuia);

    const funcoes = parseFuncoes(row.funcoes);

    try {
      // Auth
      let userRecord;
      try {
        userRecord = await auth.getUserByEmail(email);
        console.log(`↺ Auth já existe: ${email}`);
      } catch {
        userRecord = await auth.createUser({
          email,
          password: DEFAULT_PASSWORD,
          displayName: nome || email,
          disabled: false,
        });
        console.log(`✔ Auth criado: ${email}`);
      }

      const uid = userRecord.uid;

      // Firestore user profile
      const data = {
        nin,
        nome: nome || email,
        agrupamentoId,
        secaoDocId,
        tipo, // ELEMENTO | DIRIGENTE
        isGuia: !!isGuia,
        isSubGuia: !!isSubGuia,
        funcoes,
        ...(tipo === "ELEMENTO"
          ? {
              patrulhaId: patrulhaId || null,
              etapaProgresso: etapaProgresso || null,
            }
          : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Remove undefined
      Object.keys(data).forEach((k) => {
        if (data[k] === undefined) delete data[k];
      });

      await db.collection("users").doc(uid).set(data, { merge: true });
      console.log(`✔ Firestore atualizado: ${email}`);

      // (Opcional) Atribuir guiaUid automaticamente para guias
      // NOTA: não faz distinção guia/subguia (só guia)
      if (tipo === "ELEMENTO" && patrulhaId && isGuia) {
        const subRef = db
          .collection("agrupamento")
          .doc(agrupamentoId)
          .collection("secoes")
          .doc(secaoDocId)
          .collection("subunidades")
          .doc(patrulhaId);

        await subRef.set(
          {
            guiaUid: uid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        console.log(`⭐ Guia atribuído: ${email} -> ${secaoDocId}/${patrulhaId}`);
      }
    } catch (err) {
      console.error(`❌ Erro em ${email}:`, err.message);
    }
  }

  console.log("🎉 Import concluído (users + subunidades)");
}

// =========================
// RUN
// =========================
(async () => {
  try {
    await resetUsers();
    await importAll();
    console.log("✅ Processo terminado");
    process.exit(0);
  } catch (err) {
    console.error("❌ Falha geral:", err);
    process.exit(1);
  }
})();

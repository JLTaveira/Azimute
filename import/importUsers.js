/* Import Users
 import/importUsers.js
 2026-02-16 - Joao Taveira (jltaveira@gmail.com) */
 
 const admin = require("firebase-admin");
const XLSX = require("xlsx");
const path = require("path");

// 🔹 CAMINHO PARA O TEU FICHEIRO EXCEL
const FILE = "../ElementosLobitosCaminheiros.xlsx";

// 🔹 PASSWORD INICIAL PARA TODOS
const DEFAULT_PASSWORD = "Azimute#1104!";

// 🔹 AGRUPAMENTO
const AGRUPAMENTO_ID = "1104_Paranhos";

// 🔹 MAPEAMENTO SEÇÃO -> TIPO SUBUNIDADE
const SECTION_TYPE = {
  "1104alcateia": "BANDO",
  "1104cla": "TRIBO",
};

// ---------- INIT FIREBASE ADMIN ----------
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();
const db = admin.firestore();

// ---------- UTIL ----------
function parseRoles(roleString) {
  return roleString.split("|").map((r) => r.trim());
}

async function ensureSubunidade(secaoDocId, patrulhaId, tipo) {
  if (!patrulhaId) return;

  const ref = db
    .collection("agrupamento")
    .doc(AGRUPAMENTO_ID)
    .collection("secoes")
    .doc(secaoDocId)
    .collection("subunidades")
    .doc(patrulhaId);

  const doc = await ref.get();

  if (!doc.exists) {
    await ref.set({
      nome: patrulhaId,
      tipo: tipo,
      ativo: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✔ Subunidade criada: ${secaoDocId}/${patrulhaId}`);
  }
}

// ---------- MAIN ----------
async function run() {
  const workbook = XLSX.readFile(FILE);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  for (const row of rows) {
    const nin = String(row.nin).trim();
    const nome = row["nome completo do elemento"];
    const secaoDocId = row.secaoDocId;
    const roleString = row.roles;
    const patrulhaId = row.patrulhaid || null;

    const email = `${nin}@azimute.cne`;
    const roles = parseRoles(roleString);
    const subTipo = SECTION_TYPE[secaoDocId];

    let userRecord;

    try {
      userRecord = await auth.getUserByEmail(email);
      console.log(`↺ User já existe: ${email}`);
    } catch {
      userRecord = await auth.createUser({
        email,
        password: DEFAULT_PASSWORD,
        displayName: nome,
      });
      console.log(`✔ Auth criado: ${email}`);
    }

    const uid = userRecord.uid;

    // Criar/garantir subunidade
    if (patrulhaId) {
      await ensureSubunidade(secaoDocId, patrulhaId, subTipo);
    }

    // Criar doc user
    await db.collection("users").doc(uid).set({
      nin,
      nome,
      agrupamentoId: AGRUPAMENTO_ID,
      secaoDocId,
      patrulhaId,
      roles,
      ativo: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✔ Firestore user: ${nome}`);

    // Se for GUIA -> atualizar subunidade.guiaUid
    if (roles.includes("GUIA") && patrulhaId) {
      const subRef = db
        .collection("agrupamento")
        .doc(AGRUPAMENTO_ID)
        .collection("secoes")
        .doc(secaoDocId)
        .collection("subunidades")
        .doc(patrulhaId);

      await subRef.set(
        { guiaUid: uid },
        { merge: true }
      );

      console.log(`✔ Guia definido para ${patrulhaId}`);
    }
  }

  console.log("\nIMPORT CONCLUÍDO 🎉");
}

run().catch(console.error);

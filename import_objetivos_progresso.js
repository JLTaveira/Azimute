/* Importação dos objectivos educativos
 import_objetivos_progresso.js
 2026-02-18 - Joao Taveira (jltaveira@gmail.com) */

 // import_objetivos_progresso.js
import fs from "fs";
import path from "path";
import process from "process";
import admin from "firebase-admin";
import xlsx from "xlsx";

/**
 * CONFIG
 * 1) Coloca o service account json ao lado deste script, por exemplo:
 *    ./serviceAccountKey.json
 * 2) Ajusta o caminho do Excel no fim (ou passa por argumento).
 */

function mustLoadServiceAccount() {
  const candidates = [
    path.resolve(process.cwd(), "serviceAccountKey.json"),
    path.resolve(process.cwd(), "service-account.json"),
    path.resolve(process.cwd(), "firebase-admin.json"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error(
    `Não encontrei o ficheiro de credenciais do Firebase Admin.
Coloca "serviceAccountKey.json" na mesma pasta do script (ou ajusta o código).`
  );
}

function normalizeKey(s) {
  return String(s || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeArea(s) {
  const v = normalizeKey(s).replace(/\s+/g, "_");
  // Aceita variações (ex: "FISICO", "FÍSICO", "FISICO ")
  const map = {
    FISICO: "FISICO",
    AFETIVO: "AFETIVO",
    AFECTIVO: "AFETIVO", // caso apareça assim nalgum sítio
    CARATER: "CARACTER",
    CARACTER: "CARACTER",
    ESPIRITUAL: "ESPIRITUAL",
    INTELECTUAL: "INTELECTUAL",
    SOCIAL: "SOCIAL",
  };
  return map[v] || v;
}

/**
 * Parse: "F1 - Texto..." => { codigo: "F1", descricao: "Texto..." }
 * Também tolera "F1- Texto" / "F1 – Texto"
 */
function parseOportunidade(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^([FACESI])\s*(\d+)\s*[-–—]\s*(.+)$/i);
  if (!m) {
    return {
      codigo: null,
      descricao: s,
    };
  }
  return {
    codigo: `${m[1].toUpperCase()}${m[2]}`,
    descricao: String(m[3] || "").trim(),
  };
}

async function writeInBatches(db, ops, batchSize = 450) {
  // 450 para ficar folgado (limite 500)
  let i = 0;
  while (i < ops.length) {
    const batch = db.batch();
    const slice = ops.slice(i, i + batchSize);
    for (const op of slice) {
      batch.set(op.ref, op.data, { merge: true });
    }
    await batch.commit();
    i += batchSize;
    console.log(`✅ Batch commit (${Math.min(i, ops.length)}/${ops.length})`);
  }
}

async function main() {
  const excelPathArg = process.argv[2];
  if (!excelPathArg) {
    console.log(
      `Uso:
  node import_objetivos_progresso.js "C:\\caminho\\BDSistemaProgressoCNE.xlsx"

Ou (se estiver na mesma pasta):
  node import_objetivos_progresso.js "./BDSistemaProgressoCNE.xlsx"
`
    );
    process.exit(1);
  }

  const excelPath = path.resolve(process.cwd(), excelPathArg);
  if (!fs.existsSync(excelPath)) {
    throw new Error(`Excel não encontrado: ${excelPath}`);
  }

  const saPath = mustLoadServiceAccount();
  const serviceAccount = JSON.parse(fs.readFileSync(saPath, "utf8"));

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  const db = admin.firestore();

  // Lê o Excel
  const wb = xlsx.readFile(excelPath);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  const rows = xlsx.utils.sheet_to_json(ws, { defval: "" });

  // Esperado:
  // - secao
  // - areaDesenvolvimento
  // - trilhoEducativo
  // - oportunidadeEducativa
  const requiredCols = ["secao", "areaDesenvolvimento", "trilhoEducativo", "oportunidadeEducativa"];
  for (const col of requiredCols) {
    if (!rows.length || !(col in rows[0])) {
      console.warn("Exemplo de chaves detetadas na primeira linha:", Object.keys(rows[0] || {}));
      throw new Error(`Coluna obrigatória em falta no Excel: "${col}"`);
    }
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const ops = [];

  // Vamos também gerar um pequeno report em memória
  const stats = new Map(); // key = "SEC|AREA" -> count

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];

    const secao = normalizeKey(r.secao);
    const areaDesenvolvimento = normalizeArea(r.areaDesenvolvimento);
    const trilhoEducativo = String(r.trilhoEducativo || "").trim();

    const { codigo, descricao } = parseOportunidade(r.oportunidadeEducativa);

    if (!secao) {
      console.warn(`Linha ${idx + 2}: secao vazia, a saltar.`);
      continue;
    }
    if (!areaDesenvolvimento) {
      console.warn(`Linha ${idx + 2}: areaDesenvolvimento vazia, a saltar.`);
      continue;
    }
    if (!codigo) {
      console.warn(
        `Linha ${idx + 2}: não consegui extrair código (ex: F1, A2) de: "${r.oportunidadeEducativa}". Vou guardar mas sem ID padrão.`
      );
    }

    const oportunidadeId = codigo ? `${secao}_${codigo}` : `${secao}_LINHA_${idx + 2}`;

    // Documento final
    const ref = db.collection("catalogoObjetivos").doc(oportunidadeId);

    const data = {
      secao,
      areaDesenvolvimento,
      trilhoEducativo,
      codigo: codigo || null, // ex: "F1"
      oportunidadeId, // ex: "LOBITOS_F1"
      descricao: descricao || "",

      // meta
      updatedAt: now,
      // createdAt só se for novo (como usamos merge, fazemos truque:)
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Para não “pisar” createdAt em updates, podes optar por:
    // - correr uma vez só, ou
    // - comentar createdAt acima e criar noutro script.
    // (Se preferires, eu ajusto para fazer getDoc e só pôr createdAt em novos.)
    ops.push({ ref, data });

    const skey = `${secao}|${areaDesenvolvimento}`;
    stats.set(skey, (stats.get(skey) || 0) + 1);
  }

  console.log(`Vou escrever ${ops.length} objetivos em catalogoObjetivos...`);
  await writeInBatches(db, ops);

  console.log("\n📊 Resumo (contagem por secção + área):");
  [...stats.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([k, v]) => {
      const [sec, area] = k.split("|");
      console.log(` - ${sec} / ${area}: ${v}`);
    });

  console.log("\n✅ Import concluído.");
}

main().catch((e) => {
  console.error("❌ ERRO:", e);
  process.exit(1);
});

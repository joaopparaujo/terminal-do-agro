// Converte as planilhas exportadas da consulta de séries do CEPEA
// (https://www.cepea.org.br/br/consultas-ao-banco-de-dados-do-site.aspx)
// em JSON usado como base histórica do terminal.
//
// Uso: node scripts/importa-historico-cepea.mjs <pasta-com-os-xls>
// Os .xls precisam ser baixados manualmente num navegador: o site do CEPEA
// tem proteção anti-robô que impede o download automatizado.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const raizProjeto = join(dirname(fileURLToPath(import.meta.url)), "..");
const pastaOrigem = process.argv[2];
if (!pastaOrigem) {
  console.error("Uso: node scripts/importa-historico-cepea.mjs <pasta-com-os-xls>");
  process.exit(1);
}

// O título na primeira célula da planilha identifica o indicador
const INDICADORES = [
  { padrao: /BOI GORDO/i, slug: "boi" },
  { padrao: /MILHO/i, slug: "milho" },
  { padrao: /SOJA.*PARANAGU/i, slug: "soja" },
];

function isoDe(dataBr) {
  const [dia, mes, ano] = dataBr.split("/");
  return `${ano}-${mes}-${dia}`;
}

function numeroBr(texto) {
  return Number(String(texto).replace(/\./g, "").replace(",", "."));
}

const pastaDestino = join(raizProjeto, "src", "data", "historico");
mkdirSync(pastaDestino, { recursive: true });

const arquivos = readdirSync(pastaOrigem).filter((f) => f.endsWith(".xls"));
if (arquivos.length === 0) {
  console.error(`Nenhum .xls encontrado em ${pastaOrigem}`);
  process.exit(1);
}

for (const arquivo of arquivos) {
  const wb = XLSX.read(readFileSync(join(pastaOrigem, arquivo)), {
    type: "buffer",
  });
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    raw: false,
  });

  const titulo = String(linhas[0]?.[0] ?? "");
  const indicador = INDICADORES.find(({ padrao }) => padrao.test(titulo));
  if (!indicador) {
    console.log(`- ${arquivo}: "${titulo}" não é um indicador usado; pulando`);
    continue;
  }

  // Dados começam depois da linha de cabeçalho ["Data", ...]
  const inicio = linhas.findIndex((l) => l?.[0] === "Data") + 1;
  const pregoes = linhas
    .slice(inicio)
    .filter((l) => /^\d{2}\/\d{2}\/\d{4}$/.test(l?.[0] ?? ""))
    .map((l) => ({ data: isoDe(l[0]), valor: numeroBr(l[1]) }))
    .filter((p) => Number.isFinite(p.valor));

  const destino = join(pastaDestino, `${indicador.slug}.json`);
  writeFileSync(
    destino,
    JSON.stringify({ titulo, fonte: "CEPEA/ESALQ", pregoes })
  );
  console.log(
    `+ ${indicador.slug}.json: ${pregoes.length} pregões ` +
      `(${pregoes[0].data} a ${pregoes.at(-1).data}) de "${arquivo}"`
  );
}

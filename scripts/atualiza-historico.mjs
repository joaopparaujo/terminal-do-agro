// Anexa os pregões mais recentes (Notícias Agrícolas, que republica os
// indicadores CEPEA) aos JSONs da base histórica. Rodado diariamente pelo
// GitHub Actions (.github/workflows/atualiza-historico.yml): quando há
// pregão novo, o workflow commita a mudança e o Vercel republica o site.
//
// Uso manual: node scripts/atualiza-historico.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raizProjeto = join(dirname(fileURLToPath(import.meta.url)), "..");
const pastaHistorico = join(raizProjeto, "src", "data", "historico");

const PAGINAS = {
  soja: "https://www.noticiasagricolas.com.br/cotacoes/soja/soja-indicador-cepea-esalq-porto-paranagua",
  milho:
    "https://www.noticiasagricolas.com.br/cotacoes/milho/indicador-cepea-esalq-milho",
  boi: "https://www.noticiasagricolas.com.br/cotacoes/boi-gordo/boi-gordo-indicador-esalq-bmf",
};

function isoDe(dataBr) {
  const [dia, mes, ano] = dataBr.split("/");
  return `${ano}-${mes}-${dia}`;
}

function numeroBr(texto) {
  return Number(texto.replace(/\./g, "").replace(",", "."));
}

async function pregoesRecentes(url) {
  const resposta = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    },
  });
  if (!resposta.ok) throw new Error(`status ${resposta.status} em ${url}`);

  const html = await resposta.text();
  const linhas = [
    ...html.matchAll(
      /<td>(\d{2}\/\d{2}\/\d{4})<\/td>\s*<td>([\d.,]+)<\/td>\s*<td>([+\-]?[\d.,]+)<\/td>/g
    ),
  ];
  return linhas.map(([, data, valor]) => ({
    data: isoDe(data),
    valor: numeroBr(valor),
  }));
}

let falhas = 0;

for (const [slug, url] of Object.entries(PAGINAS)) {
  const arquivo = join(pastaHistorico, `${slug}.json`);
  try {
    const recentes = await pregoesRecentes(url);
    if (recentes.length === 0) throw new Error("nenhum pregão encontrado");

    const base = JSON.parse(readFileSync(arquivo, "utf8"));
    const existentes = new Set(base.pregoes.map((p) => p.data));
    const novos = recentes.filter((p) => !existentes.has(p.data));

    if (novos.length === 0) {
      console.log(`= ${slug}: nada novo (base vai até ${base.pregoes.at(-1).data})`);
      continue;
    }

    base.pregoes = [...base.pregoes, ...novos].sort((a, b) =>
      a.data.localeCompare(b.data)
    );
    writeFileSync(arquivo, JSON.stringify(base));
    console.log(
      `+ ${slug}: ${novos.length} pregão(ões) novo(s), base agora até ${base.pregoes.at(-1).data}`
    );
  } catch (erro) {
    falhas++;
    console.error(`! ${slug}: falha ao atualizar — ${erro.message}`);
  }
}

// Falha o job só se NENHUMA commodity atualizou (fonte fora do ar):
// falha parcial não deve descartar o que funcionou
if (falhas === Object.keys(PAGINAS).length) {
  process.exit(1);
}

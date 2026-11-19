import { readFile } from "node:fs/promises";

const legislacaoUrl = new URL("../data/legislacao.json", import.meta.url);

export async function consultarLegislacao(assunto) {
  const conteudo = await readFile(legislacaoUrl, "utf8");
  const base = JSON.parse(conteudo);
  const registro = base.assuntos[assunto];

  if (!registro) {
    return {
      encontrado: false,
      assunto,
      mensagem: "Assunto não encontrado na base legislativa simplificada.",
    };
  }

  return {
    encontrado: true,
    assunto,
    titulo: registro.titulo,
    explicacao: registro.explicacao,
    fundamentos_legais: registro.fundamentos,
    verificacao: {
      data: base.metadata.data_verificacao,
      limitacoes: base.metadata.limitacoes,
    },
  };
}

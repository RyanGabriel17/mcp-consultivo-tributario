export function montarDiagnosticoInicial(dados) {
  const dadosFaltantes = [];

  if (!dados.cnae) dadosFaltantes.push("CNAE principal");
  if (dados.faturamento_anual == null) dadosFaltantes.push("Faturamento anual");
  if (!dados.municipio) dadosFaltantes.push("Município");

  const dadosDisponiveis = {
    atividade: dados.atividade,
    cnae: dados.cnae || null,
    regime_tributario: dados.regime_tributario,
    faturamento_anual: dados.faturamento_anual ?? null,
    uf: dados.uf,
    municipio: dados.municipio || null,
  };

  const assuntosParaAnalise = [
    "Natureza das operações realizadas pela empresa",
    "Incidência e enquadramento do IBS",
    "Incidência e enquadramento da CBS",
    "Situações que possam exigir análise do Imposto Seletivo",
    "Regime tributário aplicado e suas regras específicas",
    "Possibilidade de créditos tributários, sujeita à análise documental",
    "Operações com fornecedores e clientes",
    "Benefícios fiscais aplicáveis, se houver, com confirmação em fonte oficial",
  ];

  return {
    tipo: "diagnostico_inicial",
    dados_disponiveis: dadosDisponiveis,
    dados_faltantes: dadosFaltantes,
    assuntos_para_analise: assuntosParaAnalise,
    observacoes: [
      "Este diagnóstico não constitui parecer tributário.",
      "Não foram realizadas estimativas de alíquotas, benefícios fiscais ou valores de imposto.",
      "As conclusões tributárias exigem validação da legislação vigente e das fontes oficiais aplicáveis.",
    ],
  };
}

import * as z from "zod/v4";
import { montarDiagnosticoInicial } from "../services/diagnosticoService.js";

export const diagnosticarEmpresaInputSchema = {
  atividade: z
    .string()
    .trim()
    .min(2, "Informe uma atividade empresarial válida.")
    .describe("Descrição da atividade principal da empresa."),
  cnae: z
    .string()
    .trim()
    .optional()
    .describe("CNAE principal da empresa, quando disponível."),
  regime_tributario: z
    .enum([
      "Simples Nacional",
      "Lucro Presumido",
      "Lucro Real",
      "Outro ou não informado",
    ])
    .describe("Regime tributário informado pela empresa."),
  faturamento_anual: z
    .number()
    .finite()
    .nonnegative()
    .optional()
    .describe("Faturamento anual aproximado, em reais, quando disponível."),
  uf: z
    .string()
    .trim()
    .length(2, "Informe a UF com duas letras, por exemplo: SP.")
    .toUpperCase()
    .describe("Unidade da Federação da empresa."),
  municipio: z
    .string()
    .trim()
    .optional()
    .describe("Município da empresa, quando disponível."),
};

export function registrarDiagnosticarEmpresa(server) {
  server.registerTool(
    "diagnosticar_empresa",
    {
      title: "Diagnóstico tributário inicial",
      description:
        "Organiza informações básicas de uma empresa fictícia e indica assuntos tributários que podem exigir análise, sem emitir conclusões legais ou calcular tributos.",
      inputSchema: diagnosticarEmpresaInputSchema,
    },
    async (dados) => {
      const diagnostico = montarDiagnosticoInicial(dados);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(diagnostico, null, 2),
          },
        ],
      };
    },
  );
}

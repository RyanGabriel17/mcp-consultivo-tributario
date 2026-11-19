import * as z from "zod/v4";
import { consultarLegislacao } from "../services/legislacaoService.js";

export const consultarReformaTributariaInputSchema = {
  assunto: z
    .enum(["IBS", "CBS", "Imposto Seletivo", "Regras de transição"])
    .describe("Assunto legislativo a consultar na base oficial resumida."),
};

export function registrarConsultarReformaTributaria(server) {
  server.registerTool(
    "consultar_reforma_tributaria",
    {
      title: "Consulta à Reforma Tributária",
      description:
        "Consulta explicações objetivas e fontes oficiais sobre IBS, CBS, Imposto Seletivo e regras de transição, sem realizar cálculos.",
      inputSchema: consultarReformaTributariaInputSchema,
    },
    async ({ assunto }) => {
      const resultado = await consultarLegislacao(assunto);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(resultado, null, 2),
          },
        ],
      };
    },
  );
}

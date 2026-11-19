import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_MESSAGES = 10;
const MAX_TOOL_TURNS = 2;
const OPENAI_MODEL_PADRAO = "gpt-4.1-mini";

export function validarSolicitacaoChat(body) {
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!message) {
    return { valido: false, erro: "Digite uma mensagem antes de enviar." };
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      valido: false,
      erro: `A mensagem deve ter no máximo ${MAX_MESSAGE_LENGTH} caracteres.`,
    };
  }

  let history = [];

  if (Array.isArray(body?.history)) {
    history = body.history
      .filter((item) =>
        item
        && (item.role === "user" || item.role === "assistant")
        && typeof item.content === "string"
      )
      .slice(-MAX_HISTORY_MESSAGES)
      .map((item) => ({
        role: item.role,
        content: item.content.slice(0, MAX_MESSAGE_LENGTH),
      }));
  }

  return { valido: true, message, history };
}

function converterResultadoMcp(resultado) {
  if (resultado?.structuredContent !== undefined) {
    return JSON.stringify(resultado.structuredContent);
  }

  const texto = resultado?.content
    ?.filter((item) => item?.type === "text")
    .map((item) => item.text)
    .join("\n");

  return texto || JSON.stringify(resultado);
}

function instrucoesSistema() {
  return [
    "Você é um assistente de consultoria tributária empresarial.",
    "Use as ferramentas MCP disponíveis para obter dados e legislação.",
    "Não invente fatos, cálculos tributários ou conclusões jurídicas.",
    "Ao usar diagnosticar_empresa, informe que o diagnóstico é inicial e não substitui análise profissional.",
    "Ao usar consultar_reforma_tributaria, preserve os fundamentos e links oficiais fornecidos pela ferramenta.",
  ].join(" ");
}

async function criarConexaoMcp() {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "127.0.0.1";
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://${host}:${port}/mcp`),
  );
  const client = new Client(
    { name: "chat-consultivo-tributario", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  return { client, transport };
}

function acumularUso(total, usage) {
  if (!usage) return total;
  total.input_tokens += usage.input_tokens || 0;
  total.output_tokens += usage.output_tokens || 0;
  total.total_tokens += usage.total_tokens || 0;
  total.reasoning_tokens += usage.output_tokens_details?.reasoning_tokens || 0;
  total.cached_input_tokens += usage.input_tokens_details?.cached_tokens || 0;
  return total;
}

export async function processarMensagemChat({ message, history }) {
  const apiKeyConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());

  if (!apiKeyConfigured) {
    return {
      status: "ia_nao_configurada",
      message,
      history,
      response:
        "A integração com Inteligência Artificial ainda não está configurada. Configure a chave da OpenAI no arquivo .env.",
      ferramenta_mcp: null,
    };
  }

  let mcpConnection;

  try {
    mcpConnection = await criarConexaoMcp();
    const respostaFerramentas = await mcpConnection.client.listTools();
    const ferramentasPermitidas = new Set([
      "diagnosticar_empresa",
      "consultar_reforma_tributaria",
    ]);

    const ferramentas = respostaFerramentas.tools
      .filter((tool) => ferramentasPermitidas.has(tool.name))
      .map((tool) => ({
        type: "function",
        name: tool.name,
        description: tool.description || `Executa a ferramenta MCP ${tool.name}.`,
        parameters: tool.inputSchema,
        strict: false,
      }));

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY.trim() });
    const model = process.env.OPENAI_MODEL?.trim() || OPENAI_MODEL_PADRAO;

    let input = [...history, { role: "user", content: message }];
    const ferramentasUsadas = [];
    const consumo = {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      reasoning_tokens: 0,
      cached_input_tokens: 0,
    };

    for (let turno = 0; turno <= MAX_TOOL_TURNS; turno += 1) {
      const response = await openai.responses.create({
        model,
        instructions: instrucoesSistema(),
        input,
        tools: ferramentas,
        tool_choice: "auto",
        parallel_tool_calls: false,
        store: false,
        max_output_tokens: 700,
      });

      acumularUso(consumo, response.usage);

      const chamadas = response.output.filter((item) => item.type === "function_call");

      if (chamadas.length === 0) {
        return {
          status: "ia_ativa",
          message,
          history,
          response: response.output_text?.trim()
            || "Não consegui gerar uma resposta textual nesta etapa.",
          ferramenta_mcp: ferramentasUsadas.length
            ? ferramentasUsadas.join(", ")
            : null,
          consumo,
        };
      }

      input.push(...response.output);

      for (const chamada of chamadas) {
        if (!ferramentasPermitidas.has(chamada.name)) {
          throw new Error(`Chamada de ferramenta não permitida: ${chamada.name}`);
        }

        let argumentos;
        try {
          argumentos = JSON.parse(chamada.arguments);
        } catch {
          throw new Error(`A OpenAI enviou argumentos inválidos para ${chamada.name}.`);
        }

        const resultado = await mcpConnection.client.callTool({
          name: chamada.name,
          arguments: argumentos,
        });

        if (resultado.isError) {
          input.push({
            type: "function_call_output",
            call_id: chamada.call_id,
            output: `Erro ao executar ${chamada.name}: ${converterResultadoMcp(resultado)}`,
          });
        } else {
          ferramentasUsadas.push(chamada.name);
          input.push({
            type: "function_call_output",
            call_id: chamada.call_id,
            output: converterResultadoMcp(resultado),
          });
        }
      }

      if (turno === MAX_TOOL_TURNS) {
        const respostaFinal = await openai.responses.create({
          model,
          instructions: instrucoesSistema(),
          input,
          tools: ferramentas,
          tool_choice: "none",
          store: false,
          max_output_tokens: 700,
        });

        acumularUso(consumo, respostaFinal.usage);

        return {
          status: "ia_ativa",
          message,
          history,
          response: respostaFinal.output_text?.trim()
            || "Não consegui concluir a resposta.",
          ferramenta_mcp: ferramentasUsadas.length
            ? ferramentasUsadas.join(", ")
            : null,
          consumo,
        };
      }
    }
  } finally {
    if (mcpConnection) {
      await mcpConnection.client.close().catch(() => {});
    }
  }
}

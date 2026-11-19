import "dotenv/config";
import express from "express";
import * as z from "zod/v4";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { registrarDiagnosticarEmpresa } from "./tools/diagnosticarEmpresa.js";
import { registrarConsultarReformaTributaria } from "./tools/consultarReformaTributaria.js";
import { processarMensagemChat, validarSolicitacaoChat } from "./services/chatService.js";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";

const diretorioAtual = path.dirname(fileURLToPath(import.meta.url));
const pastaPublica = path.resolve(diretorioAtual, "../public");

function createServer() {
  const server = new McpServer(
    {
      name: "mcp-consultivo-tributario",
      version: "1.0.0",
    },
    {
      capabilities: { logging: {} },
    },
  );

  server.registerTool(
    "health_check",
    {
      title: "Verificação de integridade",
      description:
        "Confirma que o servidor MCP tributário está inicializado e operacional.",
      inputSchema: {
        mensagem: z
          .string()
          .optional()
          .describe("Mensagem opcional usada no teste de comunicação."),
      },
    },
    async ({ mensagem }) => {
      const conteudo = {
        status: "ok",
        servidor: "mcp-consultivo-tributario",
        versao: "1.0.0",
        mensagem: mensagem || "Servidor MCP operacional.",
        timestamp: new Date().toISOString(),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(conteudo, null, 2) }],
      };
    },
  );

  registrarDiagnosticarEmpresa(server);
  registrarConsultarReformaTributaria(server);

  return server;
}

const app = createMcpExpressApp({ host: HOST });

app.use(express.json({ limit: "64kb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    servidor: "mcp-consultivo-tributario",
    versao: "1.0.0",
  });
});

app.post("/mcp", async (req, res) => {
  const server = createServer();

  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    res.on("close", () => {
      void transport.close();
      void server.close();
    });
  } catch (error) {
    console.error("Erro ao processar requisição MCP:", error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Erro interno do servidor MCP.",
        },
        id: null,
      });
    }
  }
});

app.get("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Método não permitido neste transporte MCP stateless.",
    },
    id: null,
  });
});

app.delete("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Método não permitido neste transporte MCP stateless.",
    },
    id: null,
  });
});

app.post("/api/mcp-tool", async (req, res) => {
  const ferramentasPermitidas = new Set([
    "diagnosticar_empresa",
    "consultar_reforma_tributaria",
  ]);

  const { name, arguments: argumentos } = req.body || {};

  if (!ferramentasPermitidas.has(name)) {
    return res.status(400).json({
      error: "Ferramenta não permitida pela interface.",
    });
  }

  let id = 1;
  const requestMcp = {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: {
      name,
      arguments: argumentos || {},
    },
  };

  try {
    const resposta = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(requestMcp),
    });

    const texto = await resposta.text();
    const linhaDados = texto
      .split("\n")
      .find((linha) => linha.startsWith("data: "));

    if (!linhaDados) {
      return res.status(502).json({
        error: "O servidor MCP não retornou uma resposta JSON-RPC válida.",
      });
    }

    const respostaJsonRpc = JSON.parse(linhaDados.slice("data: ".length));

    if (respostaJsonRpc.error) {
      return res.status(400).json({
        error: respostaJsonRpc.error.message,
        code: respostaJsonRpc.error.code,
      });
    }

    const resultado = respostaJsonRpc.result;

    if (resultado?.isError) {
      const mensagem = resultado.content?.[0]?.text;
      return res.status(400).json({
        error: mensagem || "Entrada rejeitada pelo servidor MCP.",
      });
    }

    const textoResultado = resultado?.content?.[0]?.text;

    if (!textoResultado) {
      return res.status(502).json({
        error: "O servidor MCP não retornou conteúdo textual.",
      });
    }

    try {
      return res.json(JSON.parse(textoResultado));
    } catch {
      return res.json({ text: textoResultado });
    }
  } catch (error) {
    console.error("Erro ao encaminhar chamada MCP:", error);
    return res.status(502).json({
      error: "Não foi possível comunicar com o servidor MCP.",
    });
  }
});

app.post("/api/chat", async (req, res) => {
  const validacao = validarSolicitacaoChat(req.body);

  if (!validacao.valido) {
    return res.status(400).json({
      status: "erro_validacao",
      error: validacao.erro,
    });
  }

  try {
    const resposta = await processarMensagemChat({
      message: validacao.message,
      history: validacao.history,
    });

    return res.json(resposta);
  } catch (error) {
    console.error("Erro ao processar a solicitação do chat:", error.message);
    return res.status(500).json({
      status: "erro_interno",
      error: "Não foi possível processar a mensagem neste momento.",
    });
  }
});

app.use(express.static(pastaPublica));

const serverHttp = app.listen(PORT, HOST, () => {
  console.log(`MCP iniciado em http://${HOST}:${PORT}/mcp`);
  console.log(`Health check em http://${HOST}:${PORT}/health`);
});

serverHttp.on("error", (error) => {
  console.error("Falha ao iniciar o servidor MCP:", error);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] ) {
  process.once(signal, () => {
    serverHttp.close(() => {
      console.log("Servidor MCP encerrado.");
      process.exit(0);
    });
  });
}


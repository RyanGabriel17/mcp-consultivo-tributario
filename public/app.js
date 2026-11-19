const statusServidor = document.querySelector("#statusServidor");
const formDiagnostico = document.querySelector("#formDiagnostico");
const formLegislacao = document.querySelector("#formLegislacao");
const resultadoDiagnostico = document.querySelector("#resultadoDiagnostico");
const resultadoLegislacao = document.querySelector("#resultadoLegislacao");
const formChat = document.querySelector("#formChat");
const chatInput = document.querySelector("#chatInput");
const chatMensagens = document.querySelector("#chatMensagens");
const chatEnviar = document.querySelector("#chatEnviar");
const chatErro = document.querySelector("#chatErro");
const limparChat = document.querySelector("#limparChat");
const historicoChat = [];
let chatEmAndamento = false;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function criarLista(itens) {
  if (!Array.from(itens || []).length) return "<p>Não informado.</p>";
  return `<ul>${Array.from(itens).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

async function atualizarStatus() {
  statusServidor.className = "status status-verificando";
  statusServidor.innerHTML = '<span class="status-dot"></span><span>Verificando servidor...</span>';

  try {
    const resposta = await fetch("/health");
    if (!resposta.ok) throw new Error("Servidor indisponível");
    const dados = await resposta.json();
    statusServidor.className = "status status-online";
    statusServidor.innerHTML = '<span class="status-dot"></span><span>Servidor online</span>';
  } catch {
    statusServidor.className = "status status-offline";
    statusServidor.innerHTML = '<span class="status-dot"></span><span>Servidor offline</span>';
  }
}

async function chamarFerramenta(name, argumentos) {
  const resposta = await fetch("/api/mcp-tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, arguments: argumentos }),
  });

  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(dados.error || "Não foi possível executar a ferramenta.");
  return dados;
}

function adicionarMensagemChat(role, texto, ferramenta = null) {
  const mensagem = document.createElement("div");
  mensagem.className = `chat-message ${role === "user" ? "user" : "assistant"}`;

  const rotulo = document.createElement("span");
  rotulo.className = "chat-label";
  rotulo.textContent = role === "user" ? "Você" : "Assistente";

  const conteudo = document.createElement("p");
  conteudo.textContent = texto;

  mensagem.append(rotulo, conteudo);

  if (ferramenta) {
    const ferramentaLabel = document.createElement("span");
    ferramentaLabel.className = "chat-tool";
    ferramentaLabel.textContent = `Ferramenta MCP: ${ferramenta}`;
    mensagem.append(ferramentaLabel);
  }

  chatMensagens.append(mensagem);
  chatMensagens.scrollTop = chatMensagens.scrollHeight;
}

function restaurarHistoricoInicial() {
  chatMensagens.querySelectorAll(".chat-message").forEach((mensagem) => mensagem.remove());
  adicionarMensagemChat(
    "assistant",
    "Envie uma pergunta. Enquanto a integração não estiver configurada, informarei que a IA ainda está pendente.",
  );
}

async function enviarMensagemChat(texto) {
  chatErro.textContent = "";
  chatEmAndamento = true;
  chatEnviar.disabled = true;
  chatInput.disabled = true;
  chatEnviar.textContent = "Enviando...";

  adicionarMensagemChat("assistant", "Processando sua mensagem...");
  const mensagemCarregando = chatMensagens.lastElementChild;

  try {
    const resposta = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: texto, history: historicoChat }),
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      throw new Error(dados.error || "Não foi possível processar a mensagem.");
    }

    mensagemCarregando.remove();
    adicionarMensagemChat("assistant", dados.response, dados.ferramenta_mcp);

    historicoChat.push({ role: "user", content: texto });
    historicoChat.push({ role: "assistant", content: dados.response });
    if (historicoChat.length > 20) historicoChat.splice(0, historicoChat.length - 20);
  } catch (erro) {
    mensagemCarregando.remove();
    chatErro.textContent = erro.message;
  } finally {
    chatEmAndamento = false;
    chatEnviar.disabled = false;
    chatInput.disabled = false;
    chatEnviar.textContent = "Enviar";
    chatInput.focus();
  }
}

formDiagnostico.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const formData = new FormData(formDiagnostico);
  const argumentos = {
    atividade: formData.get("atividade"),
    cnae: formData.get("cnae") || undefined,
    regime_tributario: formData.get("regime_tributario"),
    faturamento_anual: formData.get("faturamento_anual") === "" ? undefined : Number(formData.get("faturamento_anual")),
    uf: formData.get("uf"),
    municipio: formData.get("municipio") || undefined,
  };

  const botao = formDiagnostico.querySelector("button");
  botao.disabled = true;
  resultadoDiagnostico.innerHTML = '<p class="loading">Consultando o MCP...</p>';

  try {
    const dados = await chamarFerramenta("diagnosticar_empresa", argumentos);
    const disponiveis = dados.dados_disponiveis || {};

    resultadoDiagnostico.innerHTML = `
      <div class="result-card">
        <div class="result-section">
          <h3>Dados disponíveis</h3>
          <p><strong>Atividade:</strong> ${escapeHtml(disponiveis.atividade || "Não informado")}</p>
          <p><strong>CNAE:</strong> ${escapeHtml(disponiveis.cnae || "Não informado")}</p>
          <p><strong>Regime:</strong> ${escapeHtml(disponiveis.regime_tributario || "Não informado")}</p>
          <p><strong>Faturamento:</strong> ${disponiveis.faturamento_anual == null ? "Não informado" : `R$ ${Number(disponiveis.faturamento_anual).toLocaleString("pt-BR")}`}</p>
          <p><strong>UF:</strong> ${escapeHtml(disponiveis.uf || "Não informado")}</p>
          <p><strong>Município:</strong> ${escapeHtml(disponiveis.municipio || "Não informado")}</p>
        </div>
        <div class="result-section">
          <h3>Informações faltantes</h3>
          ${criarLista(dados.dados_faltantes)}
        </div>
        <div class="result-section">
          <h3>Assuntos para análise</h3>
          ${criarLista(dados.assuntos_para_analise)}
        </div>
        <div class="result-section">
          <h3>Observações</h3>
          ${criarLista(dados.observacoes)}
        </div>
      </div>`;
  } catch (erro) {
    resultadoDiagnostico.innerHTML = `<div class="error-box">${escapeHtml(erro.message)}</div>`;
  } finally {
    botao.disabled = false;
  }
});

formLegislacao.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const assunto = new FormData(formLegislacao).get("assunto");
  const botao = formLegislacao.querySelector("button");

  botao.disabled = true;
  resultadoLegislacao.innerHTML = '<p class="loading">Consultando o MCP...</p>';

  try {
    const dados = await chamarFerramenta("consultar_reforma_tributaria", { assunto });

    if (!dados.encontrado) {
      resultadoLegislacao.innerHTML = `<div class="error-box">${escapeHtml(dados.mensagem)}</div>`;
      return;
    }

    const fontes = (dados.fundamentos_legais || []).map((item) => `
      <div class="result-section">
        <h3>${escapeHtml(item.norma)}</h3>
        <p>${escapeHtml(item.dispositivo)}</p>
        <p>${escapeHtml(item.situacao)}</p>
        <a class="source" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">Abrir fonte oficial</a>
      </div>`).join("");

    resultadoLegislacao.innerHTML = `
      <div class="result-card">
        <div class="result-section">
          <h3>${escapeHtml(dados.titulo)}</h3>
          <p>${escapeHtml(dados.explicacao)}</p>
        </div>
        ${fontes}
        <div class="result-section">
          <h3>Verificação e limitações</h3>
          <p><strong>Data:</strong> ${escapeHtml(dados.verificacao?.data || "Não informada")}</p>
          <p>${escapeHtml(dados.verificacao?.limitacoes || "Não informado")}</p>
        </div>
      </div>`;
  } catch (erro) {
    resultadoLegislacao.innerHTML = `<div class="error-box">${escapeHtml(erro.message)}</div>`;
  } finally {
    botao.disabled = false;
  }
});

formChat.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  if (chatEmAndamento) return;

  const texto = chatInput.value.trim();

  if (!texto) {
    chatErro.textContent = "Digite uma mensagem antes de enviar.";
    chatInput.focus();
    return;
  }

  chatInput.value = "";
  adicionarMensagemChat("user", texto);
  await enviarMensagemChat(texto);
});

chatInput.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter" && !evento.shiftKey) {
    evento.preventDefault();
    formChat.requestSubmit();
  }
});

limparChat.addEventListener("click", () => {
  historicoChat.splice(0, historicoChat.length);
  chatErro.textContent = "";
  restaurarHistoricoInicial();
  chatInput.focus();
});

atualizarStatus();
restaurarHistoricoInicial();

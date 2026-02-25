// ╔══════════════════════════════════════╗
// ║  CAIXA — Controle de abertura/fech  ║
// ╚══════════════════════════════════════╝

const CaixaManager = {
  init() {
    this._bindEvents();
    this.verificarBloqueio();
    console.log("💰 CaixaManager inicializado");
  },

  // === CRUD ===
  listar() {
    return JSON.parse(localStorage.getItem(APP_CONFIG.ls.caixas) || "[]");
  },
  salvarTodos(arr) {
    localStorage.setItem(APP_CONFIG.ls.caixas, JSON.stringify(arr));
  },
  getAtual() {
    return JSON.parse(localStorage.getItem(APP_CONFIG.ls.caixaAtual) || "null");
  },
  setAtual(c) {
    localStorage.setItem(APP_CONFIG.ls.caixaAtual, JSON.stringify(c));
  },

  // === Verificar bloqueio ===
  verificarBloqueio() {
    const aberto = this.getAtual();
    const locked = !aberto || aberto.status !== "aberto";
    const overlay = document.getElementById("lockOverlay");
    if (overlay) overlay.style.display = locked ? "flex" : "none";
  },

  // === Atualizar caixa com venda ===
  registrarVenda(venda) {
    if (!venda || typeof venda.total !== "number") return;

    const caixa = this.getAtual();
    if (!caixa || !caixa.id) return;

    const caixas = this.listar();
    const idx = caixas.findIndex(c => c.id === caixa.id);
    if (idx === -1) return;

    if (typeof caixas[idx].totalVendas !== "number") caixas[idx].totalVendas = 0;
    caixas[idx].totalVendas += venda.total;

    caixas[idx].vendas = caixas[idx].vendas || [];
    caixas[idx].vendas.push(venda);

    this.salvarTodos(caixas);

    caixa.totalVendas = caixas[idx].totalVendas;
    this.setAtual(caixa);

    console.log(`📊 Caixa #${caixa.id}: +${venda.total.toFixed(2)} R$`);
  },

  // === Abrir popup lateral ===
  abrirPopup() {
    const popup = document.getElementById("popupCaixa");
    const frame = document.getElementById("frameCaixa");
    if (frame) frame.src = "caixa.html";
    if (popup) popup.classList.add("show");
  },

  fecharPopup() {
    const popup = document.getElementById("popupCaixa");
    const frame = document.getElementById("frameCaixa");
    if (popup) popup.classList.remove("show");
    setTimeout(() => { if (frame) frame.src = ""; }, 400);
  },

  // === PRIVADOS ===
  _bindEvents() {
    // Botão Caixa no footer
    document.getElementById("btnCaixa")?.addEventListener("click", () => this.abrirPopup());

    // Fechar popup
    document.getElementById("closeCaixa")?.addEventListener("click", () => this.fecharPopup());

    // Overlay "Abrir Caixa"
    document.getElementById("overlayAbrir")?.addEventListener("click", () => this.abrirPopup());

    // Escutar mensagens do iframe (quando caixa for aberto/fechado)
    window.addEventListener("message", e => {
      if (e.data === "caixa-atualizado" || e.data === "caixa-aberto") {
        this.verificarBloqueio();
        this.fecharPopup();
      }
    });

    // Verificar ao voltar foco
    window.addEventListener("focus", () => this.verificarBloqueio());
  }
};

// === Usuários ===
const UsuarioManager = {
  listar() {
    return JSON.parse(localStorage.getItem(APP_CONFIG.ls.usuarios) || "[]");
  },
  salvar(arr) {
    localStorage.setItem(APP_CONFIG.ls.usuarios, JSON.stringify(arr));
  },
  garantirAdmin() {
    let users = this.listar();
    if (users.length === 0) {
      users = [{ nome: "Admin", tipo: "fabrica", criado: new Date().toISOString() }];
      this.salvar(users);
    }
    return users;
  }
};

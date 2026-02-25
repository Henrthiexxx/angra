// ╔══════════════════════════════════════╗
// ║  CLIENTE — Busca, seleção, cadastro ║
// ╚══════════════════════════════════════╝

const ClienteManager = {
  clientes: [],
  selecionado: null,

  // === Elementos ===
  els: {},

  init() {
    this.els = {
      searchWrapper: document.getElementById("clienteSearchWrapper"),
      searchInput: document.getElementById("clienteSearchInput"),
      suggestions: document.getElementById("clienteSuggestions"),
      selected: document.getElementById("clienteSelected"),
      selectedName: document.getElementById("clienteSelectedNomeText"),
      selectedBadge: document.getElementById("clienteSelectedBadge"),
      selectedDetails: document.getElementById("clienteSelectedDetails"),
      btnLimpar: document.getElementById("btnLimparCliente"),
      btnNovo: document.getElementById("btnNovoClienteRapido"),
      modal: document.getElementById("modalCadastroRapido"),
      form: document.getElementById("formCadastroRapido")
    };

    this.carregar();
    this._bindEvents();
    console.log("👤 ClienteManager inicializado");
  },

  // === Carregar clientes ===
  carregar() {
    if (window.syncManager) {
      try { this.clientes = window.syncManager.getAll("clientes") || []; }
      catch { this.clientes = []; }
    } else {
      this.clientes = JSON.parse(localStorage.getItem(APP_CONFIG.ls.clientes) || "[]");
    }

    // Restaurar seleção
    const id = localStorage.getItem(APP_CONFIG.ls.clienteSel);
    if (id) {
      this.selecionado = this.clientes.find(c => c.id === id) || null;
      if (this.selecionado) this._mostrarSelecionado();
    }
  },

  // === Selecionar ===
  selecionar(clienteId) {
    this.selecionado = this.clientes.find(c => c.id === clienteId);
    if (!this.selecionado) return;

    localStorage.setItem(APP_CONFIG.ls.clienteSel, clienteId);
    this._mostrarSelecionado();
    this.els.suggestions?.classList.remove("show");
    if (this.els.searchInput) this.els.searchInput.value = "";

    window.dispatchEvent(new CustomEvent("clienteSelecionado", { detail: this.selecionado }));
    Modal.toast(`✅ Cliente: ${this.selecionado.nome || this.selecionado.razaoSocial}`);
  },

  // === Limpar seleção ===
  limpar() {
    this.selecionado = null;
    localStorage.removeItem(APP_CONFIG.ls.clienteSel);

    if (this.els.searchWrapper) this.els.searchWrapper.style.display = "";
    if (this.els.selected) this.els.selected.style.display = "none";
    if (this.els.btnLimpar) this.els.btnLimpar.style.display = "none";

    window.dispatchEvent(new CustomEvent("clienteRemovido"));
  },

  // === Obter selecionado ===
  getSelecionado() {
    return this.selecionado;
  },

  // === Atualizar cliente após venda ===
  async atualizarAposVenda(venda) {
    if (!this.selecionado || !this.selecionado.id) return;

    const idx = this.clientes.findIndex(c => c.id === this.selecionado.id);
    if (idx === -1) return;

    const c = this.clientes[idx];

    // Histórico
    c.historicoCompras = c.historicoCompras || [];
    c.historicoCompras.push({
      id: venda.id,
      data: new Date().toISOString(),
      valor: venda.total,
      itens: venda.itens?.length || 0,
      formaPagamento: venda.formaPagamento
    });

    // Stats
    c.totalCompras = (c.totalCompras || 0) + 1;
    c.valorTotalGasto = (c.valorTotalGasto || 0) + venda.total;
    c.ticketMedio = c.valorTotalGasto / c.totalCompras;
    c.ultimaCompra = new Date().toISOString();
    c.dataAtualizacao = new Date().toISOString();

    // Favoritos
    if (venda.itens) {
      c.produtosFavoritos = c.produtosFavoritos || {};
      venda.itens.forEach(i => {
        c.produtosFavoritos[i.nome] = (c.produtosFavoritos[i.nome] || 0) + (i.qtd || 1);
      });
    }

    // Débito (prazo/carnê)
    if (venda.formaPagamento?.toLowerCase().includes("prazo") ||
        venda.formaPagamento?.toLowerCase().includes("carnê")) {
      c.debito = (c.debito || 0) + venda.total;
    }

    // Classificação
    if (c.totalCompras >= 20 && c.valorTotalGasto >= 5000) c.classificacao = "vip";
    else if (c.totalCompras >= 10 || c.valorTotalGasto >= 2000) c.classificacao = "premium";
    else if (c.totalCompras >= 3) c.classificacao = "regular";
    else c.classificacao = "novo";

    this.clientes[idx] = c;
    localStorage.setItem(APP_CONFIG.ls.clientes, JSON.stringify(this.clientes));

    if (window.syncManager) {
      try { await window.syncManager.save("clientes", c); } catch (e) { console.warn(e); }
    }
  },

  // === Cadastro rápido ===
  async salvarRapido() {
    const tipo = document.getElementById("tipoRapido")?.value || "fisica";
    const nome = tipo === "fisica" ? document.getElementById("nomeRapido")?.value?.trim() : "";
    const razao = tipo === "juridica" ? document.getElementById("razaoRapido")?.value?.trim() : "";
    const telefone = document.getElementById("telefoneRapido")?.value?.trim();

    if ((tipo === "fisica" && !nome) || (tipo === "juridica" && !razao)) {
      return Modal.toast("Nome é obrigatório!", "error");
    }
    if (!telefone) return Modal.toast("Telefone é obrigatório!", "error");

    const novo = {
      id: `CLI-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tipo, nome, razaoSocial: razao, telefone,
      cpf: document.getElementById("cpfRapido")?.value || "",
      cnpj: document.getElementById("cnpjRapido")?.value || "",
      email: document.getElementById("emailRapido")?.value || "",
      limiteCredito: parseFloat(document.getElementById("limiteCreditoRapido")?.value) || 500,
      debito: 0, status: "ativo", classificacao: "novo",
      totalCompras: 0, valorTotalGasto: 0, ticketMedio: 0,
      ultimaCompra: null, frequenciaMensal: 0,
      historicoCompras: [], produtosFavoritos: {},
      dataCadastro: new Date().toISOString(),
      dataAtualizacao: new Date().toISOString()
    };

    this.clientes.push(novo);
    localStorage.setItem(APP_CONFIG.ls.clientes, JSON.stringify(this.clientes));

    if (window.syncManager) {
      try { await window.syncManager.save("clientes", novo); } catch (e) { console.warn(e); }
    }

    this.fecharCadastro();
    this.selecionar(novo.id);
    Modal.toast("✅ Cliente cadastrado e selecionado!");
  },

  fecharCadastro() {
    this.els.modal?.classList.remove("show");
    this.els.form?.reset();
  },

  // === PRIVADOS ===

  _mostrarSelecionado() {
    if (!this.selecionado) return;
    const c = this.selecionado;
    const nome = c.nome || c.razaoSocial || "—";
    const badge = { vip: "VIP", premium: "Premium", novo: "Novo" }[c.classificacao] || "Regular";

    if (this.els.selectedName) this.els.selectedName.textContent = nome;
    if (this.els.selectedBadge) {
      this.els.selectedBadge.textContent = badge;
      this.els.selectedBadge.className = `cliente-badge ${c.classificacao || "regular"}`;
    }
    if (this.els.selectedDetails) {
      this.els.selectedDetails.textContent = `${c.telefone || ""} • ${c.totalCompras || 0} compras`;
    }

    if (this.els.searchWrapper) this.els.searchWrapper.style.display = "none";
    if (this.els.selected) this.els.selected.style.display = "flex";
    if (this.els.btnLimpar) this.els.btnLimpar.style.display = "block";
  },

  _buscar(termo) {
    if (!termo || termo.length < 2) {
      this.els.suggestions?.classList.remove("show");
      return;
    }

    const q = termo.toLowerCase();
    const filtrados = this.clientes.filter(c => {
      return (c.nome || c.razaoSocial || "").toLowerCase().includes(q) ||
             (c.telefone || "").replace(/\D/g, "").includes(q) ||
             (c.cpf || c.cnpj || "").replace(/\D/g, "").includes(q) ||
             (c.email || "").toLowerCase().includes(q);
    }).slice(0, 5);

    const box = this.els.suggestions;
    if (!box) return;

    if (filtrados.length === 0) {
      box.innerHTML = '<div class="cliente-suggestion-item" style="text-align:center;color:#64748b;">Nenhum cliente encontrado</div>';
    } else {
      box.innerHTML = filtrados.map(c => {
        const nome = c.nome || c.razaoSocial;
        const badge = { vip: "VIP", premium: "Premium", novo: "Novo" }[c.classificacao] || "Regular";
        return `
          <div class="cliente-suggestion-item" data-id="${c.id}">
            <div class="cliente-suggestion-name">${nome}
              <span class="cliente-badge ${c.classificacao || "regular"}">${badge}</span>
            </div>
            <div class="cliente-suggestion-details">${c.telefone || "—"} • ${c.totalCompras || 0} compras</div>
          </div>`;
      }).join("");
    }
    box.classList.add("show");

    // Click handlers
    box.querySelectorAll("[data-id]").forEach(el => {
      el.onclick = () => this.selecionar(el.dataset.id);
    });
  },

  _bindEvents() {
    // Busca
    this.els.searchInput?.addEventListener("input", e => this._buscar(e.target.value.trim()));

    // Fechar suggestions ao clicar fora
    document.addEventListener("click", e => {
      if (!e.target.closest(".cliente-search-wrapper")) {
        this.els.suggestions?.classList.remove("show");
      }
    });

    // Limpar
    this.els.btnLimpar?.addEventListener("click", () => this.limpar());

    // Novo
    this.els.btnNovo?.addEventListener("click", () => this.els.modal?.classList.add("show"));

    // Fechar modal ao clicar fora
    this.els.modal?.addEventListener("click", e => {
      if (e.target === this.els.modal) this.fecharCadastro();
    });

    // Toggle tipo
    document.getElementById("tipoRapido")?.addEventListener("change", e => {
      const fisica = e.target.value === "fisica";
      const toggle = (id, show) => {
        const el = document.getElementById(id);
        if (el) el.style.display = show ? "" : "none";
      };
      toggle("field-nome-rapido", fisica);
      toggle("field-cpf-rapido", fisica);
      toggle("field-razao-rapido", !fisica);
      toggle("field-cnpj-rapido", !fisica);
    });

    // Máscaras
    this._mascara("telefoneRapido", this._fmtTel);
    this._mascara("cpfRapido", this._fmtCPF);
    this._mascara("cnpjRapido", this._fmtCNPJ);
  },

  _mascara(id, fn) {
    document.getElementById(id)?.addEventListener("input", e => { e.target.value = fn(e.target.value); });
  },
  _fmtTel(v) {
    v = v.replace(/\D/g, "");
    return v.length <= 10
      ? v.replace(/^(\d{2})(\d{4})(\d)/, "($1) $2-$3")
      : v.replace(/^(\d{2})(\d{5})(\d)/, "($1) $2-$3");
  },
  _fmtCPF(v) {
    v = v.replace(/\D/g, "");
    return v.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  },
  _fmtCNPJ(v) {
    v = v.replace(/\D/g, "");
    return v.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
            .replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
  }
};

// Funções globais para compatibilidade
window.getClienteSelecionado = () => ClienteManager.getSelecionado();
window.fecharCadastroRapido = () => ClienteManager.fecharCadastro();
window.salvarClienteRapido = () => ClienteManager.salvarRapido();
window.toggleTipoRapido = () => {
  document.getElementById("tipoRapido")?.dispatchEvent(new Event("change"));
};

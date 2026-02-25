// ╔══════════════════════════════════════╗
// ║  PDV.JS — Motor do ponto de venda   ║
// ╚══════════════════════════════════════╝

const $ = s => document.querySelector(s);
const fmt = n => (n || 0).toFixed(2).replace(".", ",");

// ===== HELPERS =====
const norm = s => (s || "").toString().trim().toLowerCase();

function isVoucherSale(venda) {
  const fp = norm(venda?.formaPagamento);
  const any = (venda?.pagamentos || []).some(p => norm(p?.forma).includes("voucher"));
  return fp.includes("voucher") || any;
}

function addDebitoCliente(clienteId, valor) {
  const LS_CLIENTES = (window.APP_CONFIG?.ls?.clientes) || "fazzo_clientes";
  const arr = JSON.parse(localStorage.getItem(LS_CLIENTES) || "[]");
  const idx = arr.findIndex(c => c.id === clienteId);
  if (idx < 0) return false;
  const atual = parseFloat(arr[idx].debito) || 0;
  const v = parseFloat(valor) || 0;
  arr[idx].debito = +(atual + v).toFixed(2);
  arr[idx].dataAtualizacao = new Date().toISOString();
  localStorage.setItem(LS_CLIENTES, JSON.stringify(arr));
  try { window.dispatchEvent(new CustomEvent("clientesAtualizados", { detail: { id: clienteId } })); } catch {}
  return true;
}

// ===== ESTADO =====
const state = {
  produtos: JSON.parse(localStorage.getItem(APP_CONFIG.ls.produtos) || "[]"),
  carrinho: JSON.parse(localStorage.getItem(APP_CONFIG.ls.carrinho) || "[]"),
  typingTimer: null
};

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  const tick = () => { $("#dataVenda").textContent = new Date().toLocaleString("pt-BR"); };
  tick();
  setInterval(tick, 1000);

  const fp1 = $("#fp1"), fp2 = $("#fp2");
  APP_CONFIG.pdv.formasPagamento.forEach(f => {
    fp1.appendChild(new Option(f, f));
    fp2.appendChild(new Option(f, f));
  });

  ["#v1", "#v2", "#desconto"].forEach(sel => $(sel)?.addEventListener("input", renderCarrinho));

  $("#busca")?.addEventListener("input", onBusca);
  $("#addBtn").onclick = () => addItem();

  $("#novaVenda")?.addEventListener("click", novaVenda);
  $("#finalizar")?.addEventListener("click", finalizarVenda);

  $("#btnProduto")?.addEventListener("click", () => {
    PopupLateral.abrir("popupProduto", "frameProduto", "produto/produto.html");
  });

  $("#closeProduto")?.addEventListener("click", () => {
    PopupLateral.fechar("popupProduto", "frameProduto");
  });

  CaixaManager.init();
  ClienteManager.init();
  UsuarioManager.garantirAdmin();
  Nav.init();
  PixManager.init();

  if (typeof SyncManager !== "undefined" && db) {
    SyncManager.init(db);
    BackupManager.init();
    if (typeof SyncManager.pullFromServer === "function") {
      SyncManager.pullFromServer().then(() => {
        state.produtos = JSON.parse(localStorage.getItem(APP_CONFIG.ls.produtos) || "[]");
        console.log(`📦 Produtos carregados: ${state.produtos.length}`);
        renderCarrinho();
      }).catch(err => console.warn("⚠️ pullFromServer:", err));
    }
    SyncManager.start(APP_CONFIG.sync.colecoes, APP_CONFIG.sync.intervalo);
  }

  renderCarrinho();

  window.addEventListener("produtosAtualizados", () => {
    state.produtos = JSON.parse(localStorage.getItem(APP_CONFIG.ls.produtos) || "[]");
    console.log(`📦 Produtos recarregados: ${state.produtos.length}`);
  });

  console.log("✅ PDV Lite inicializado");
});

// ===== BUSCA =====
function onBusca(e) {
  const val = e.target.value.trim();
  clearTimeout(state.typingTimer);

  if (/^\d{3,}$/.test(val)) {
    $("#sugList").classList.add("hidden");
    const p = findProduto(val);
    showMatchInfo(p);
    state.typingTimer = setTimeout(() => {
      autoAdd();
      $("#busca").focus();
    }, 400);
    return;
  }

  renderSugestoes(val);
  showMatchInfo(findProduto(val));
}

function findProduto(query) {
  if (!query) return null;
  const q = query.toLowerCase();
  return state.produtos.find(p =>
    p.ativo !== false && (
      (p.codigoBarras || "").toLowerCase() === q ||
      (p.nome || "").toLowerCase().includes(q)
    )
  ) || null;
}

function showMatchInfo(p) {
  $("#matchInfo").textContent = p
    ? `Produto: ${p.nome} | PV: R$ ${(+p.precoVenda || 0).toFixed(2)}`
    : "Produto: —";
  if (p) $("#valorUnit").placeholder = (+p.precoVenda || 0).toFixed(2);
}

function renderSugestoes(q) {
  const box = $("#sugList");
  if (!q || /^\d+$/.test(q)) {
    box.innerHTML = "";
    box.classList.add("hidden");
    return;
  }

  const query = q.toLowerCase();
  const list = state.produtos
    .filter(p => p.ativo !== false && (p.nome || "").toLowerCase().includes(query))
    .slice(0, 8);

  if (list.length === 0) {
    box.innerHTML = "";
    box.classList.add("hidden");
    return;
  }

  box.innerHTML = list.map(p => `
    <li data-code="${p.codigoBarras || ""}">
      <b>${p.nome}</b> — R$ ${(+p.precoVenda || 0).toFixed(2)}
    </li>
  `).join("");
  box.classList.remove("hidden");

  box.querySelectorAll("li").forEach(li => {
    li.onclick = () => {
      $("#busca").value = li.dataset.code || li.textContent;
      addItem();
      $("#busca").focus();
      box.classList.add("hidden");
    };
  });
}

// ===== CARRINHO =====
function autoAdd() { addItem(); }

function addItem() {
  const q = Math.max(1, parseInt($("#qtd").value || "1"));
  const txt = $("#busca").value.trim();
  const prod = findProduto(txt);
  const unitTyped = parseFloat($("#valorUnit").value);

  if (!prod && isNaN(unitTyped)) {
    return Modal.show("Atenção", "Produto não encontrado e sem valor unitário informado.");
  }

  const unit = isNaN(unitTyped) ? Number(prod.precoVenda || 0) : unitTyped;
  const descLivre = $("#descricaoLivre").value.trim();

  state.carrinho.push({
    nome: prod ? prod.nome : (txt || "Item avulso"),
    codigoBarras: prod ? prod.codigoBarras : "",
    descricao: descLivre || (prod?.descricao || ""),
    unitario: +unit.toFixed(2),
    qtd: q,
    subtotal: +(unit * q).toFixed(2)
  });

  persistCart();
  limparCamposEntrada();
  renderCarrinho();
  $("#busca").focus();
}

function limparCamposEntrada() {
  $("#busca").value = "";
  $("#valorUnit").value = "";
  $("#matchInfo").textContent = "Produto: —";
  $("#qtd").value = 1;
  $("#descricaoLivre").value = "";
  $("#sugList").classList.add("hidden");
}

function parseDesconto(input, totalBruto) {
  const s = (input || "").toString().trim();
  if (!s) return 0;
  if (s.endsWith("%")) {
    const perc = parseFloat(s.replace("%", "").replace(",", "."));
    return isNaN(perc) ? 0 : Math.max(0, +(totalBruto * (perc / 100)).toFixed(2));
  }
  const val = parseFloat(s.replace(",", "."));
  return isNaN(val) ? 0 : Math.min(totalBruto, +val.toFixed(2));
}

function renderCarrinho() {
  const tbody = $("#cartBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  let totalBruto = 0, itens = 0;

  state.carrinho.forEach((it, i) => {
    totalBruto += it.subtotal;
    itens += it.qtd;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.qtd}</td>
      <td><div><b>${it.nome}</b></div><small>${it.descricao || ""}</small></td>
      <td>${it.codigoBarras || "—"}</td>
      <td>${it.unitario.toFixed(2)}</td>
      <td>${it.subtotal.toFixed(2)}</td>
      <td class="act">
        <button onclick="incItem(${i},1)">＋</button>
        <button onclick="incItem(${i},-1)">－</button>
        <button onclick="remItem(${i})">🗑️</button>
      </td>`;
    tbody.appendChild(tr);
  });

  const descValor = parseDesconto($("#desconto")?.value, totalBruto);
  const total = +(totalBruto - descValor).toFixed(2);

  $("#qtdItens").textContent = itens;
  $("#totalBruto").textContent = fmt(totalBruto);
  $("#total").textContent = fmt(total);

  const v1El = $("#v1");
  if (v1El && !v1El.dataset.manual) {
    v1El.value = total.toFixed(2);
  }

  const v1 = parseFloat($("#v1")?.value || 0);
  const v2 = parseFloat($("#v2")?.value || 0);
  const pago = v1 + v2;

  $("#totalPago").textContent = fmt(pago);
  $("#troco").textContent = fmt(Math.max(0, pago - total));
}

function persistCart() {
  localStorage.setItem(APP_CONFIG.ls.carrinho, JSON.stringify(state.carrinho));
}

window.incItem = (i, d) => {
  const it = state.carrinho[i];
  if (!it) return;
  it.qtd = Math.max(1, it.qtd + d);
  it.subtotal = +(it.qtd * it.unitario).toFixed(2);
  persistCart();
  renderCarrinho();
};

window.remItem = (i) => {
  state.carrinho.splice(i, 1);
  persistCart();
  renderCarrinho();
};

$("#v1")?.addEventListener("input", function () { this.dataset.manual = "1"; });

// ===== SALVAR VENDA (chamado após confirmação) =====
async function salvarVenda(venda) {
  // Salvar local
  const vendas = JSON.parse(localStorage.getItem(APP_CONFIG.ls.vendas) || "[]");
  vendas.push(venda);
  localStorage.setItem(APP_CONFIG.ls.vendas, JSON.stringify(vendas));

  // Sync Firebase
  if (window.syncManager?.db) {
    try { await window.syncManager.save("vendas", venda); }
    catch (err) { console.error("❌ Sync venda:", err); }
  }

  // Atualizar cliente
  const clienteSel = ClienteManager.getSelecionado();
  if (clienteSel) {
    try { await ClienteManager.atualizarAposVenda(venda); }
    catch (err) { console.warn("⚠️ Atualizar cliente:", err); }
  }

  // Débito voucher
  const clienteId = venda.clienteId;
  if (clienteId && isVoucherSale(venda)) {
    addDebitoCliente(clienteId, venda.total);
  }

  // Caixa
  CaixaManager.registrarVenda(venda);

  // Reset interface
  state.carrinho = [];
  persistCart();
  $("#v1").value = "";
  $("#v1").dataset.manual = "";
  $("#v2").value = "";
  $("#desconto").value = "";
  renderCarrinho();
  ClienteManager.limpar();

  Modal.toast("✅ Venda #" + venda.numero + " finalizada!");
}

// ===== REVERTER ESTOQUE (cancelamento PIX) =====
function reverterEstoque(itens) {
  itens.forEach(it => {
    if (!it.codigoBarras) return;
    const idx = state.produtos.findIndex(p => (p.codigoBarras || "") === it.codigoBarras);
    if (idx > -1) {
      state.produtos[idx].estoque = parseInt(state.produtos[idx].estoque || 0) + it.qtd;
    }
  });
  localStorage.setItem(APP_CONFIG.ls.produtos, JSON.stringify(state.produtos));
}

// ===== FINALIZAR VENDA =====
async function finalizarVenda() {
  if (state.carrinho.length === 0) {
    return Modal.show("Carrinho vazio", "Adicione itens antes de finalizar.");
  }

  const bruto = state.carrinho.reduce((s, i) => s + i.subtotal, 0);
  const desc = parseDesconto($("#desconto").value, bruto);
  const total = +(bruto - desc).toFixed(2);

  const v1 = parseFloat($("#v1").value || 0);
  const v2 = parseFloat($("#v2").value || 0);
  const pago = +(v1 + v2).toFixed(2);

  const pagos = [];
  let formaPrincipal = "Dinheiro";
  if (v1 > 0) {
    formaPrincipal = $("#fp1").value || "Dinheiro";
    pagos.push({ forma: formaPrincipal, valor: +v1.toFixed(2) });
  }
  if (v2 > 0) {
    pagos.push({ forma: $("#fp2").value || "Dinheiro", valor: +v2.toFixed(2) });
  }

  if (pago + 1e-6 < total) {
    return Modal.show("Pagamento insuficiente", "O valor pago é menor que o total.");
  }

  const clienteSel = ClienteManager.getSelecionado();
  const clienteId =
    clienteSel?.id || clienteSel?.clienteId ||
    clienteSel?.uid || clienteSel?.key || null;

  // Atualizar estoque antecipadamente
  state.carrinho.forEach(it => {
    if (!it.codigoBarras) return;
    const idx = state.produtos.findIndex(p => (p.codigoBarras || "") === it.codigoBarras);
    if (idx > -1) {
      state.produtos[idx].estoque = Math.max(0, parseInt(state.produtos[idx].estoque || 0) - it.qtd);
    }
  });
  localStorage.setItem(APP_CONFIG.ls.produtos, JSON.stringify(state.produtos));

  // Montar objeto venda
  const caixa = CaixaManager.getAtual();
  const seq = parseInt(localStorage.getItem(APP_CONFIG.ls.sequencial) || "0") + 1;
  localStorage.setItem(APP_CONFIG.ls.sequencial, String(seq));

  const venda = {
    id: `VENDA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    numero: seq,
    data: new Date().toISOString(),
    caixaId: caixa?.id || null,
    usuario: caixa?.usuario || "Desconhecido",
    itens: state.carrinho.map(i => ({
      nome: i.nome,
      codigoBarras: i.codigoBarras || null,
      descricao: i.descricao || "",
      qtd: i.qtd,
      preco: i.unitario,
      subtotal: i.subtotal
    })),
    total, totalBruto: +bruto.toFixed(2), desconto: +desc.toFixed(2),
    pago, troco: +(Math.max(0, pago - total)).toFixed(2),
    formaPagamento: formaPrincipal, pagamentos: pagos,
    clienteId,
    clienteNome: (clienteSel?.nome || clienteSel?.razaoSocial) || null,
    clienteTelefone: clienteSel?.telefone || null,
    clienteDoc: (clienteSel?.cpf || clienteSel?.cnpj) || null,
    dataAtualizacao: new Date().toISOString()
  };

  // PIX: aguarda confirmação antes de salvar
  const temPix = pagos.some(p => p.forma.toLowerCase().includes("pix"));
  if (temPix) {
    const valorPix = pagos.find(p => p.forma.toLowerCase().includes("pix"))?.valor || total;

    await PixManager.mostrar(
      valorPix,
      // onConfirm: pagamento recebido
      () => salvarVenda(venda),
      // onCancel: reverter estoque e sequencial
      () => {
        reverterEstoque(venda.itens);
        localStorage.setItem(APP_CONFIG.ls.sequencial, String(seq - 1));
        Modal.toast("Venda cancelada.", "info");
      }
    );
  } else {
    // Não é PIX: salvar direto
    await salvarVenda(venda);
  }
}

// ===== NOVA VENDA =====
function novaVenda() {
  if (state.carrinho.length === 0) return;
  Modal.show("Nova venda", "Deseja limpar o carrinho atual?", [
    { label: "Cancelar", cls: "ghost", onClick: () => Modal.close() },
    {
      label: "Confirmar", cls: "primary", onClick: () => {
        state.carrinho = [];
        persistCart();
        renderCarrinho();
        Modal.close();
        ClienteManager.limpar();
        $("#v1").value = "";
        $("#v1").dataset.manual = "";
        $("#v2").value = "";
        $("#desconto").value = "";
        $("#busca").focus();
      }
    }
  ]);
}

function atalhosBackup() {
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "B" || e.key === "b")) {
      e.preventDefault();
      window.location.href = "backup.html"; // mesma aba
    }
  });
}

// chame uma vez na inicialização
atalhosBackup();
// ===== EXPORT GLOBAL =====
window.atualizarInterface = renderCarrinho;

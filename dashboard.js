// ╔══════════════════════════════════════╗
// ║  DASHBOARD.JS — Analytics do PDV    ║
// ╚══════════════════════════════════════╝

const LS = APP_CONFIG.ls;
const fmt = n => "R$ " + (n || 0).toFixed(2).replace(".", ",");

function getVendas() { return JSON.parse(localStorage.getItem(LS.vendas) || "[]").filter(v => !v.cancelada); }
function getProdutos() { return JSON.parse(localStorage.getItem(LS.produtos) || "[]"); }
function getClientes() { return JSON.parse(localStorage.getItem(LS.clientes) || "[]"); }
function getUsuarios() { return JSON.parse(localStorage.getItem(LS.usuarios) || "[]"); }
function saveUsuarios(u) { localStorage.setItem(LS.usuarios, JSON.stringify(u)); }

// ===== TABS =====
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  // Renderizar imediatamente com dados locais
  renderAll();

  // Depois sincronizar e re-renderizar
  if (typeof SyncManager !== "undefined" && typeof db !== "undefined") {
    SyncManager.init(db);
    SyncManager.pullFromServer().then(() => renderAll()).catch(() => {});
  }
});

function renderAll() {
  try { renderKPIs(); } catch(e) { console.error("KPIs:", e); }
  try { renderChartFat7d(); } catch(e) { console.error("Chart7d:", e); }
  try { renderChartFP(); } catch(e) { console.error("ChartFP:", e); }
  try { renderRankingProdutos(); } catch(e) { console.error("RankProd:", e); }
  try { renderRankingClientes(); } catch(e) { console.error("RankCli:", e); }
  try { renderEstoqueBaixo(); } catch(e) { console.error("EstBaixo:", e); }
  try { renderProjecaoEstoque(); } catch(e) { console.error("Projecao:", e); }
  try { renderUsuarios(); } catch(e) { console.error("Users:", e); }
}

// ===== HELPERS =====
function isHoje(d) {
  const h = new Date(), v = new Date(d);
  return v.getFullYear() === h.getFullYear() && v.getMonth() === h.getMonth() && v.getDate() === h.getDate();
}
function isMes(d) {
  const h = new Date(), v = new Date(d);
  return v.getFullYear() === h.getFullYear() && v.getMonth() === h.getMonth();
}

// ===== KPIs =====
function renderKPIs() {
  const vendas = getVendas();
  const hoje = vendas.filter(v => isHoje(v.data));
  const mes = vendas.filter(v => isMes(v.data));
  const clientes = getClientes();
  const produtos = getProdutos();

  const fatHoje = hoje.reduce((s, v) => s + (v.total || 0), 0);
  const fatMes = mes.reduce((s, v) => s + (v.total || 0), 0);
  const ticketMedio = hoje.length > 0 ? fatHoje / hoje.length : 0;

  // Lucro estimado (venda - custo)
  let custoMes = 0;
  mes.forEach(v => {
    (v.itens || []).forEach(it => {
      const prod = produtos.find(p => p.nome === it.nome || (p.codigoBarras && p.codigoBarras === it.codigoBarras));
      custoMes += (prod ? +prod.precoCusto || 0 : 0) * (it.qtd || 1);
    });
  });
  const lucroMes = fatMes - custoMes;
  const margemMes = fatMes > 0 ? ((lucroMes / fatMes) * 100) : 0;

  document.getElementById("kVendasHoje").textContent = hoje.length;
  document.getElementById("kFatHoje").textContent = fmt(fatHoje);
  document.getElementById("kTicket").textContent = fmt(ticketMedio);
  document.getElementById("kClientes").textContent = clientes.length;
  document.getElementById("kVendasMes").textContent = mes.length;
  document.getElementById("kFatMes").textContent = fmt(fatMes);
  document.getElementById("kLucroMes").textContent = fmt(lucroMes);
  document.getElementById("kMargemMes").textContent = margemMes.toFixed(1) + "%";
}

// ===== CHART: Faturamento 7 dias =====
let chartFat7d = null;
function renderChartFat7d() {
  const vendas = getVendas();
  const labels = [], data = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" });
    labels.push(label);

    const fat = vendas
      .filter(v => (v.data || "").slice(0, 10) === key)
      .reduce((s, v) => s + (v.total || 0), 0);
    data.push(fat);
  }

  const ctx = document.getElementById("chartFat7d");
  if (chartFat7d) chartFat7d.destroy();
  chartFat7d = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Faturamento (R$)", data, backgroundColor: "#4f7cff", borderRadius: 6 }]
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

// ===== CHART: Formas de Pagamento =====
let chartFP = null;
function renderChartFP() {
  const vendas = getVendas().filter(v => isMes(v.data));
  const map = {};
  vendas.forEach(v => {
    (v.pagamentos || []).forEach(p => {
      map[p.forma] = (map[p.forma] || 0) + (p.valor || 0);
    });
    if ((!v.pagamentos || v.pagamentos.length === 0) && v.formaPagamento) {
      map[v.formaPagamento] = (map[v.formaPagamento] || 0) + (v.total || 0);
    }
  });

  const labels = Object.keys(map);
  const data = Object.values(map);
  const colors = ["#4f7cff", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6"];

  const ctx = document.getElementById("chartFP");
  if (chartFP) chartFP.destroy();
  chartFP = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, labels.length) }] },
    options: { responsive: true, plugins: { legend: { position: "bottom" } } }
  });
}

// ===== RANKING PRODUTOS =====
function renderRankingProdutos() {
  const vendas = getVendas().filter(v => isMes(v.data));
  const map = {};
  vendas.forEach(v => {
    (v.itens || []).forEach(it => {
      if (!map[it.nome]) map[it.nome] = { qtd: 0, fat: 0 };
      map[it.nome].qtd += it.qtd || 1;
      map[it.nome].fat += it.subtotal || (it.preco * (it.qtd || 1));
    });
  });

  const sorted = Object.entries(map).sort((a, b) => b[1].fat - a[1].fat).slice(0, 10);
  const tbody = document.getElementById("topProdutos");

  if (sorted.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="empty">Sem vendas este mês</td></tr>'; return; }

  tbody.innerHTML = sorted.map(([nome, d], i) =>
    `<tr><td>${i + 1}</td><td>${nome}</td><td>${d.qtd}</td><td>${fmt(d.fat)}</td></tr>`
  ).join("");
}

// ===== RANKING CLIENTES =====
function renderRankingClientes() {
  const vendas = getVendas().filter(v => isMes(v.data) && v.clienteNome);
  const map = {};
  vendas.forEach(v => {
    const nome = v.clienteNome;
    if (!map[nome]) map[nome] = { compras: 0, total: 0 };
    map[nome].compras++;
    map[nome].total += v.total || 0;
  });

  const sorted = Object.entries(map).sort((a, b) => b[1].total - a[1].total).slice(0, 10);
  const tbody = document.getElementById("topClientes");

  if (sorted.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="empty">Sem clientes este mês</td></tr>'; return; }

  tbody.innerHTML = sorted.map(([nome, d], i) =>
    `<tr><td>${i + 1}</td><td>${nome}</td><td>${d.compras}</td><td>${fmt(d.total)}</td></tr>`
  ).join("");
}

// ===== ESTOQUE BAIXO =====
function renderEstoqueBaixo() {
  const produtos = getProdutos().filter(p => p.ativo !== false);
  const baixo = produtos.filter(p => {
    const est = +p.estoque || 0;
    const min = +p.min || 0;
    return min > 0 && est <= min;
  }).sort((a, b) => (+a.estoque || 0) - (+b.estoque || 0));

  const tbody = document.getElementById("estoqueBaixo");
  if (baixo.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="empty">Estoque OK 👍</td></tr>'; return; }

  tbody.innerHTML = baixo.map(p => {
    const est = +p.estoque || 0;
    const min = +p.min || 0;
    const status = est === 0 ? "critical" : est <= min * 0.5 ? "critical" : "low";
    const label = est === 0 ? "ZERADO" : "BAIXO";
    return `<tr><td>${p.nome}</td><td>${est}</td><td>${min}</td><td><span class="badge ${status}">${label}</span></td></tr>`;
  }).join("");
}

// ===== PROJEÇÃO ESTOQUE =====
function renderProjecaoEstoque() {
  const produtos = getProdutos().filter(p => p.ativo !== false && (+p.estoque || 0) > 0);
  const vendas = getVendas();

  // Calcular média diária dos últimos 30 dias
  const d30 = new Date(); d30.setDate(d30.getDate() - 30);
  const vendasRecentes = vendas.filter(v => new Date(v.data) >= d30);

  const vendaPorProduto = {};
  vendasRecentes.forEach(v => {
    (v.itens || []).forEach(it => {
      vendaPorProduto[it.nome] = (vendaPorProduto[it.nome] || 0) + (it.qtd || 1);
    });
  });

  const projecao = produtos.map(p => {
    const vendaDia = (vendaPorProduto[p.nome] || 0) / 30;
    const diasRestantes = vendaDia > 0 ? Math.floor((+p.estoque || 0) / vendaDia) : 999;
    return { nome: p.nome, estoque: +p.estoque || 0, vendaDia: vendaDia.toFixed(1), diasRestantes };
  }).filter(p => p.vendaDia > 0).sort((a, b) => a.diasRestantes - b.diasRestantes).slice(0, 15);

  const tbody = document.getElementById("projecaoEstoque");
  if (projecao.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="empty">Sem dados de venda para projeção</td></tr>'; return; }

  tbody.innerHTML = projecao.map(p => {
    const status = p.diasRestantes <= 7 ? "critical" : p.diasRestantes <= 15 ? "low" : "ok";
    return `<tr><td>${p.nome}</td><td>${p.estoque}</td><td>${p.vendaDia}/dia</td>
    <td><span class="badge ${status}">${p.diasRestantes} dias</span></td></tr>`;
  }).join("");
}

// ===== USUÁRIOS =====
function renderUsuarios() {
  const users = getUsuarios();
  const tbody = document.getElementById("userList");

  if (users.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="empty">Nenhum usuário</td></tr>'; return; }

  tbody.innerHTML = users.map((u, i) => `
    <tr>
      <td>${u.nome || "—"}</td>
      <td>${u.tipo || "operador"}</td>
      <td>${u.criado ? new Date(u.criado).toLocaleDateString("pt-BR") : "—"}</td>
      <td>${i > 0 ? `<button class="btn btn-danger" onclick="remUsuario(${i})">🗑️</button>` : "Admin"}</td>
    </tr>
  `).join("");
}

window.addUsuario = () => {
  const nome = prompt("Nome do usuário:");
  if (!nome || !nome.trim()) return;
  const tipo = prompt("Tipo (fabrica/vendedor/gerente):", "vendedor") || "vendedor";
  const users = getUsuarios();
  users.push({ nome: nome.trim(), tipo, criado: new Date().toISOString() });
  saveUsuarios(users);
  renderUsuarios();
};

window.remUsuario = (i) => {
  const users = getUsuarios();
  if (i === 0) return alert("Admin não pode ser removido!");
  if (!confirm(`Remover "${users[i].nome}"?`)) return;
  users.splice(i, 1);
  saveUsuarios(users);
  renderUsuarios();
};
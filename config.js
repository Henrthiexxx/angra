// ╔══════════════════════════════════════════════╗
// ║  FAZZO PDV LITE — CONFIGURAÇÃO CENTRAL      ║
// ║  Para replicar: troque APENAS este arquivo   ║
// ╚══════════════════════════════════════════════╝

const APP_CONFIG = {
  // === IDENTIDADE ===
  nome: "Fazzo PDV",
  versao: "2.1.0",

  // === FIREBASE (novo projeto) ===
  firebase: {
    apiKey: "AIzaSyACm5hq_NpM5610-hhmnMroHbFg7GvSavI",
    authDomain: "fazzopdv-762bf.firebaseapp.com",
    projectId: "fazzopdv-762bf",
    storageBucket: "fazzopdv-762bf.firebasestorage.app",
    messagingSenderId: "533549975052",
    appId: "1:533549975052:web:9ca67506fb0d7d3eed5029",
    measurementId: "G-LT98MQ9W7D"
  },

  // === COLEÇÕES FIRESTORE ===
  colecoes: {
    vendas:    "vendas",
    produtos:  "produtos",
    clientes:  "clientes",
    caixas:    "caixas",
    usuarios:  "usuarios"
  },

  // === LOCALSTORAGE KEYS ===
  ls: {
    produtos:        "produtos",
    carrinho:        "carrinho",
    vendas:          "vendas",
    sequencial:      "vendas_seq",
    caixas:          "caixas",
    caixaAtual:      "caixa_atual",
    usuarios:        "usuarios",
    config:          "configPDV",
    clientes:        "fazzo_clientes",
    clienteSel:      "fazzo_cliente_selecionado",
    movimentacoes:   "movimentacoes",
    authUser:        "fazzo_auth_user"
  },

  // === SYNC ===
  sync: {
    intervalo: 86.400,
    colecoes: ["vendas", "clientes", "produtos"]
  },

  // === PDV ===
  pdv: {
    formasPagamento: ["Dinheiro", "Crédito", "Débito", "Pix", "Voucher"],
    moeda: "BRL",
    locale: "pt-BR"
  },

  // === PERMISSÕES POR PAPEL ===
  // admin        → acesso total
  // estabelecimento → acesso ao PDV + gestão (sem gestão de usuários)
  // funcionario  → somente PDV (vendas, caixa, produtos leitura)
  roles: {
    admin:           ["*"],
    estabelecimento: ["pdv", "caixa", "produto", "estoque", "cliente", "dashboard", "gestao"],
    funcionario:     ["pdv", "caixa", "produto", "estoque"]
  }
};

Object.freeze(APP_CONFIG);
Object.freeze(APP_CONFIG.firebase);
Object.freeze(APP_CONFIG.ls);
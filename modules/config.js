// ╔══════════════════════════════════════════════╗
// ║  FAZZO PDV LITE — CONFIGURAÇÃO CENTRAL      ║
// ║  Para replicar: troque APENAS este arquivo   ║
// ╚══════════════════════════════════════════════╝

const APP_CONFIG = {
  // === IDENTIDADE ===
  nome: "Fazzo PDV",
  versao: "2.0.0",

  // === FIREBASE ===
  firebase: {
    apiKey: "AIzaSyDUK1fhIKDKKGtxbJ4eyVyfmwOmDiUWtNk",
    authDomain: "fazzopdv.firebaseapp.com",
    databaseURL: "https://fazzopdv-default-rtdb.firebaseio.com",
    projectId: "fazzopdv",
    storageBucket: "fazzopdv.firebasestorage.app",
    messagingSenderId: "622552990650",
    appId: "1:622552990650:web:4d83241bf97804a6825383"
  },

  // === COLEÇÕES FIRESTORE ===
  colecoes: {
    vendas: "vendas",
    produtos: "produtos",
    clientes: "clientes",
    caixas: "caixas",
    usuarios: "usuarios"
  },

  // === LOCALSTORAGE KEYS ===
  ls: {
    produtos: "produtos",
    carrinho: "carrinho",
    vendas: "vendas",
    sequencial: "vendas_seq",
    caixas: "caixas",
    caixaAtual: "caixa_atual",
    usuarios: "usuarios",
    config: "configPDV",
    clientes: "fazzo_clientes",
    clienteSel: "fazzo_cliente_selecionado",
    movimentacoes: "movimentacoes"
  },

  // === SYNC ===
  sync: {
    intervalo: 60000,       // auto-sync a cada 60s
    colecoes: ["vendas", "clientes", "produtos"]
  },

  // === PDV ===
  pdv: {
    formasPagamento: ["Dinheiro", "Crédito", "Débito", "Pix", "Voucher"],
    moeda: "BRL",
    locale: "pt-BR"
  }
};

// Congela para evitar mutação acidental
Object.freeze(APP_CONFIG);
Object.freeze(APP_CONFIG.firebase);
Object.freeze(APP_CONFIG.ls);

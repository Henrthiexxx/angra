// ╔══════════════════════════════════════════════════╗
// ║  SYNC MANAGER — Compatível com server.js        ║
// ║  Produtos/config: data/keys (doc único)          ║
// ║  Vendas/clientes: coleções individuais            ║
// ╚══════════════════════════════════════════════════╝

const SyncManager = {
  db: null,
  _intervals: [],
  _started: false,

  // Chaves que vivem em data/keys (padrão server.js)
  _keysDoc: ["produtos", "configPDV", "usuarios"],

  init(firestoreDb) {
    this.db = firestoreDb;
    console.log("🔄 SyncManager inicializado");
  },

  start(collections = [], interval = 60000) {
    if (!this.db) { console.warn("⚠️ SyncManager: sem Firestore"); return; }

    // Sync inicial
    this.pullFromServer();
    collections.forEach(col => {
      if (!this._isKeysDoc(col)) this.syncCollection(col);
    });

    // Periódico
    const id = setInterval(() => {
      this.pullFromServer();
      collections.forEach(col => {
        if (!this._isKeysDoc(col)) this.syncCollection(col);
      });
    }, interval);

    this._intervals.push(id);
    this._started = true;
    console.log(`⏱️ Auto-sync: ${collections.join(", ")} a cada ${interval / 1000}s`);
  },

  stop() {
    this._intervals.forEach(id => clearInterval(id));
    this._intervals = [];
    this._started = false;
  },

  // ========================================
  // DATA/KEYS — Padrão server.js
  // ========================================

  async pullFromServer() {
    if (!this.db) return;
    try {
      const doc = await this.db.collection("data").doc("keys").get();
      if (!doc.exists) return;
      const data = doc.data();

      if (data.produtos) {
        const remote = Array.isArray(data.produtos) ? data.produtos : [];
        if (remote.length > 0) {
          localStorage.setItem(APP_CONFIG.ls.produtos, JSON.stringify(remote));
          console.log(`📦 Produtos: ${remote.length} carregados do servidor`);
          // Dispara evento para UIs atualizarem
          window.dispatchEvent(new CustomEvent("produtosAtualizados"));
        }
      }

      if (data.configPDV) {
        localStorage.setItem(APP_CONFIG.ls.config, JSON.stringify(data.configPDV));
      }

      if (data.usuarios && Array.isArray(data.usuarios) && data.usuarios.length > 0) {
        localStorage.setItem(APP_CONFIG.ls.usuarios, JSON.stringify(data.usuarios));
      }
    } catch (err) {
      console.warn("⚠️ pullFromServer:", err);
    }
  },

  async pushKey(keyName, value) {
    if (!this.db) return;
    try {
      await this.db.collection("data").doc("keys").set({ [keyName]: value }, { merge: true });
      console.log(`☁️ '${keyName}' → data/keys`);
    } catch (err) {
      console.error(`❌ pushKey '${keyName}':`, err);
    }
  },

  async pushProdutos() {
    const produtos = JSON.parse(localStorage.getItem(APP_CONFIG.ls.produtos) || "[]");
    const ativos = produtos.filter(p => p.ativo !== false);
    await this.pushKey("produtos", ativos);
  },

  // ========================================
  // COLEÇÕES INDIVIDUAIS
  // ========================================

  getAll(collection) {
    const key = this._lsKey(collection);
    try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
  },

  async save(collection, item) {
    if (!item || !item.id) return;
    const key = this._lsKey(collection);
    const arr = this.getAll(collection);
    const idx = arr.findIndex(x => x.id === item.id);
    if (idx > -1) arr[idx] = { ...arr[idx], ...item }; else arr.push(item);
    localStorage.setItem(key, JSON.stringify(arr));

    if (this.db && !this._isKeysDoc(collection)) {
      try {
        await this.db.collection(collection).doc(item.id).set(item, { merge: true });
      } catch (err) { console.error(`❌ ${collection}/${item.id}:`, err); }
    }
  },

  async syncCollection(collection) {
    if (!this.db || this._isKeysDoc(collection)) return;
    try {
      const key = this._lsKey(collection);
      const local = this.getAll(collection);
      const snapshot = await this.db.collection(collection).get();

      const remoteMap = {};
      snapshot.forEach(doc => { remoteMap[doc.id] = { id: doc.id, ...doc.data() }; });

      const localMap = {};
      local.forEach(item => { if (item.id) localMap[item.id] = item; });

      Object.values(remoteMap).forEach(r => {
        const l = localMap[r.id];
        if (!l || new Date(r.dataAtualizacao || 0) > new Date(l.dataAtualizacao || 0)) {
          localMap[r.id] = r;
        }
      });

      for (const item of Object.values(localMap)) {
        if (!remoteMap[item.id] && item.id) {
          try { await this.db.collection(collection).doc(item.id).set(item, { merge: true }); } catch {}
        }
      }

      localStorage.setItem(key, JSON.stringify(Object.values(localMap)));
      console.log(`🔄 ${collection}: ${Object.keys(localMap).length} itens`);
    } catch (err) { console.warn(`⚠️ Sync ${collection}:`, err); }
  },

  async remove(collection, id) {
    const key = this._lsKey(collection);
    localStorage.setItem(key, JSON.stringify(this.getAll(collection).filter(x => x.id !== id)));
    if (this.db && !this._isKeysDoc(collection)) {
      try { await this.db.collection(collection).doc(id).delete(); } catch {}
    }
  },

  _isKeysDoc(col) { return this._keysDoc.includes(col); },
  _lsKey(c) { return APP_CONFIG.ls[c] || c; }
};

window.syncManager = SyncManager;
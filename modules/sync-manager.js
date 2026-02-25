// ╔══════════════════════════════════════╗
// ║  SYNC MANAGER — Firebase ↔ Local    ║
// ╚══════════════════════════════════════╝

const SyncManager = {
  db: null,
  _collections: {},
  _intervals: [],
  _started: false,

  /**
   * Inicializa com referência ao Firestore
   */
  init(firestoreDb) {
    this.db = firestoreDb;
    console.log("🔄 SyncManager inicializado");
  },

  /**
   * Inicia sync para coleções especificadas
   * @param {string[]} collections - ex: ["vendas", "clientes", "produtos"]
   * @param {number} interval - ms entre syncs (default: 60000)
   */
  start(collections = [], interval = 60000) {
    if (!this.db) {
      console.warn("⚠️ SyncManager: Firestore não inicializado");
      return;
    }

    collections.forEach(col => {
      this._collections[col] = true;
      this.syncCollection(col);
    });

    // Auto-sync periódico
    const id = setInterval(() => {
      collections.forEach(col => this.syncCollection(col));
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

  /**
   * Retorna todos os itens de uma coleção do localStorage
   */
  getAll(collection) {
    const key = this._lsKey(collection);
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  },

  /**
   * Salva um item (local + Firebase)
   */
  async save(collection, item) {
    if (!item || !item.id) {
      console.error("❌ SyncManager.save: item precisa ter .id");
      return;
    }

    // Salvar local
    const key = this._lsKey(collection);
    const arr = this.getAll(collection);
    const idx = arr.findIndex(x => x.id === item.id);

    if (idx > -1) {
      arr[idx] = { ...arr[idx], ...item };
    } else {
      arr.push(item);
    }

    localStorage.setItem(key, JSON.stringify(arr));

    // Salvar Firebase
    if (this.db) {
      try {
        await this.db.collection(collection).doc(item.id).set(item, { merge: true });
        console.log(`☁️ ${collection}/${item.id} sincronizado`);
      } catch (err) {
        console.error(`❌ Erro sync ${collection}/${item.id}:`, err);
      }
    }
  },

  /**
   * Sincroniza coleção Firebase → localStorage
   */
  async syncCollection(collection) {
    if (!this.db) return;

    try {
      const key = this._lsKey(collection);
      const local = this.getAll(collection);
      const snapshot = await this.db.collection(collection).get();

      if (snapshot.empty) return;

      const remoteMap = {};
      snapshot.forEach(doc => {
        remoteMap[doc.id] = { id: doc.id, ...doc.data() };
      });

      // Merge: remote vence se dataAtualizacao mais recente
      const localMap = {};
      local.forEach(item => {
        if (item.id) localMap[item.id] = item;
      });

      // Adicionar/atualizar do remote
      Object.values(remoteMap).forEach(remote => {
        const loc = localMap[remote.id];
        if (!loc) {
          localMap[remote.id] = remote;
        } else {
          const remoteDate = new Date(remote.dataAtualizacao || 0).getTime();
          const localDate = new Date(loc.dataAtualizacao || 0).getTime();
          if (remoteDate > localDate) {
            localMap[remote.id] = remote;
          }
        }
      });

      // Upload locais que não existem no remote
      for (const item of Object.values(localMap)) {
        if (!remoteMap[item.id] && item.id) {
          try {
            await this.db.collection(collection).doc(item.id).set(item, { merge: true });
          } catch (err) {
            console.warn(`⚠️ Upload falhou ${collection}/${item.id}:`, err);
          }
        }
      }

      localStorage.setItem(key, JSON.stringify(Object.values(localMap)));
      console.log(`🔄 Sync ${collection}: ${Object.keys(localMap).length} itens`);
    } catch (err) {
      console.warn(`⚠️ Sync ${collection} falhou:`, err);
    }
  },

  /**
   * Remove item (local + Firebase)
   */
  async remove(collection, id) {
    const key = this._lsKey(collection);
    const arr = this.getAll(collection).filter(x => x.id !== id);
    localStorage.setItem(key, JSON.stringify(arr));

    if (this.db) {
      try {
        await this.db.collection(collection).doc(id).delete();
      } catch (err) {
        console.warn(`⚠️ Remoção Firebase falhou ${collection}/${id}:`, err);
      }
    }
  },

  _lsKey(collection) {
    const map = {
      vendas: APP_CONFIG.ls.vendas,
      clientes: APP_CONFIG.ls.clientes,
      produtos: APP_CONFIG.ls.produtos,
      caixas: APP_CONFIG.ls.caixas,
      usuarios: APP_CONFIG.ls.usuarios
    };
    return map[collection] || collection;
  }
};

// Expor global
window.syncManager = SyncManager;

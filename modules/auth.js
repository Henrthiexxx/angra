// ╔══════════════════════════════════════╗
// ║  AUTH — Google Auth + Papéis        ║
// ╚══════════════════════════════════════╝

const AuthManager = {
  _user: null,
  _role: null,
  _db: null,

  PUBLIC_PAGES: ["login.html", "aguardando.html", "bloqueado.html"],

  PAGE_ROLES: {
    "pdv.html":            "pdv",
    "caixa.html":          "caixa",
    "produto.html":        "produto",
    "estoque.html":        "estoque",
    "cliente.html":        "cliente",
    "dashboard.html":      "dashboard",
    "gestao.html":         "gestao",
    "servicos.html":       "pdv",
    "fatura.html":         "pdv",
    "gestao-usuarios.html":"gestao",
    "admin-cobranca.html": "gestao",
    "servicos-adm.html":   "gestao"
  },

  // ===== INIT =====
  init(db) {
    this._db = db;
    return new Promise((resolve) => {
      firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
          this._user = user;
          await this._garantirDocUsuario(user);
          const docData = await this._fetchDocData(user.uid);
          this._role = docData?.papel || "funcionario";

          const pagina = window.location.pathname.split("/").pop() || "";

          // 1. Aguardando aprovação manual
          if (docData?.status === "pendente") {
            if (!this.PUBLIC_PAGES.includes(pagina))
              window.location.href = "aguardando.html";
            resolve(null);
            return;
          }

          // 2. Bloqueado por inadimplência
          if (docData?.bloqueado === true) {
            if (!this.PUBLIC_PAGES.includes(pagina))
              window.location.href = "bloqueado.html";
            resolve(null);
            return;
          }

          this._salvarLocal(user);
          console.log(`🔐 Auth: ${user.displayName} [${this._role}]`);
          this._renderUserBar();
          this._checkPageAccess();
          resolve({ user, role: this._role });
        } else {
          this._user = null;
          this._role = null;
          this._redirecionarLogin();
          resolve(null);
        }
      });
    });
  },

  // ===== LOGIN GOOGLE =====
  async loginGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      const result = await firebase.auth().signInWithPopup(provider);
      await this._garantirDocUsuario(result.user);
      return result.user;
    } catch (err) {
      console.error("❌ Login Google:", err);
      throw err;
    }
  },

  // ===== LOGOUT =====
  async logout() {
    await firebase.auth().signOut();
    localStorage.removeItem(APP_CONFIG.ls.authUser);
    window.location.href = "login.html";
  },

  // ===== BUSCAR DADOS DO USUÁRIO =====
  async _fetchDocData(uid) {
    try {
      const doc = await this._db.collection("usuarios").doc(uid).get();
      return doc.exists ? doc.data() : null;
    } catch (e) {
      console.warn("⚠️ Erro ao buscar usuário:", e);
      return null;
    }
  },

  async _fetchRole(uid) {
    const data = await this._fetchDocData(uid);
    return data?.papel || "funcionario";
  },

  // ===== CRIAR DOC USUÁRIO (primeiro acesso) =====
  async _garantirDocUsuario(user) {
    const ref = this._db.collection("usuarios").doc(user.uid);
    const doc = await ref.get();

    if (!doc.exists) {
      // Verificar pré-autorização por e-mail (admin cadastrou antes)
      let papelInicial = "funcionario";
      let statusInicial = "pendente"; // padrão: aguarda aprovação

      try {
        const snap = await this._db.collection("usuarios")
          .where("email", "==", user.email)
          .where("pendente", "==", true)
          .get();
        if (!snap.empty) {
          papelInicial = snap.docs[0].data().papel || "funcionario";
          statusInicial = "aprovado"; // pré-autorizado = aprovado automático
          await snap.docs[0].ref.delete();
        }
      } catch (e) { console.warn("⚠️ Pre-auth lookup:", e); }

      await ref.set({
        uid:          user.uid,
        nome:         user.displayName || "",
        email:        user.email || "",
        foto:         user.photoURL || "",
        papel:        papelInicial,
        status:       statusInicial,
        ativo:        true,
        bloqueado:    false,
        criadoEm:     new Date().toISOString(),
        ultimoAcesso: new Date().toISOString()
      });
    } else {
      await ref.update({ ultimoAcesso: new Date().toISOString() });
    }
  },

  // ===== CACHE LOCAL =====
  _salvarLocal(user) {
    localStorage.setItem(APP_CONFIG.ls.authUser, JSON.stringify({
      uid: user.uid, nome: user.displayName,
      email: user.email, foto: user.photoURL, papel: this._role
    }));
  },

  // ===== VERIFICAR ACESSO À PÁGINA =====
  _checkPageAccess() {
    const pagina = window.location.pathname.split("/").pop() || "pdv.html";
    if (this.PUBLIC_PAGES.includes(pagina)) return;
    const permNecessaria = this.PAGE_ROLES[pagina];
    if (!permNecessaria) return;
    if (!this.temPermissao(permNecessaria)) {
      alert(`Sem permissão para acessar esta página.\nSeu papel: ${this._role}`);
      window.location.href = "pdv.html";
    }
  },

  _redirecionarLogin() {
    const pagina = window.location.pathname.split("/").pop() || "";
    if (!this.PUBLIC_PAGES.includes(pagina)) {
      window.location.href = "login.html";
    }
  },

  temPermissao(permissao) {
    if (!this._role) return false;
    const perms = APP_CONFIG.roles[this._role] || [];
    return perms.includes("*") || perms.includes(permissao);
  },

  getUser()    { return this._user; },
  getRole()    { return this._role; },
  isAdmin()    { return this._role === "admin"; },
  isLoggedIn() { return !!this._user; },

  // ===== BARRA DE USUÁRIO NO HEADER =====
  _renderUserBar() {
    const bar = document.querySelector(".bar");
    if (!bar || !this._user) return;
    document.getElementById("authBar")?.remove();
    const div = document.createElement("div");
    div.id = "authBar";
    div.style.cssText = "display:flex;align-items:center;gap:8px;font-size:13px;color:#fff;";
    div.innerHTML = `
      ${this._user.photoURL
        ? `<img src="${this._user.photoURL}" style="width:28px;height:28px;border-radius:50%;border:2px solid rgba(255,255,255,.4)">`
        : "👤"}
      <span style="opacity:.85">${this._user.displayName?.split(" ")[0]}</span>
      <span style="background:rgba(255,255,255,.2);padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;text-transform:uppercase">${this._role}</span>
      <button onclick="AuthManager.logout()"
        style="background:rgba(255,255,255,.15);border:none;color:#fff;padding:4px 10px;border-radius:8px;cursor:pointer;font-size:12px">
        Sair
      </button>
    `;
    bar.appendChild(div);
  }
};

window.AuthManager = AuthManager;

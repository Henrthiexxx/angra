// ╔══════════════════════════════════════╗
// ║  MODAL — Sistema unificado          ║
// ╚══════════════════════════════════════╝

const Modal = {
  _el: null,
  _title: null,
  _body: null,
  _actions: null,

  init() {
    this._el = document.getElementById("modal");
    this._title = document.getElementById("mTitle");
    this._body = document.getElementById("mBody");
    this._actions = document.getElementById("mActions");

    // Fechar ao clicar fora
    this._el?.addEventListener("click", e => {
      if (e.target === this._el) this.close();
    });

    // Fechar com Escape
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && this._el && !this._el.classList.contains("hidden")) {
        this.close();
      }
    });

    // Botão fechar no header
    document.getElementById("closeModal")?.addEventListener("click", () => this.close());
  },

  /**
   * Abre modal
   * @param {string} title
   * @param {string} bodyHTML
   * @param {Array} actions - [{label, cls, onClick}]
   */
  show(title = "Mensagem", bodyHTML = "", actions = []) {
    if (!this._el) this.init();

    this._title.textContent = title;
    this._body.innerHTML = bodyHTML;
    this._actions.innerHTML = "";

    if (actions.length === 0) {
      actions = [{ label: "OK", cls: "primary", onClick: () => this.close() }];
    }

    actions.forEach(a => {
      const btn = document.createElement("button");
      btn.textContent = a.label;
      btn.className = a.cls || "ghost";
      btn.onclick = () => {
        if (a.onClick) a.onClick();
      };
      this._actions.appendChild(btn);
    });

    this._el.classList.remove("hidden");
  },

  close() {
    this._el?.classList.add("hidden");
  },

  /**
   * Modal de confirmação
   * @returns {Promise<boolean>}
   */
  confirm(title, msg) {
    return new Promise(resolve => {
      this.show(title, msg, [
        { label: "Cancelar", cls: "ghost", onClick: () => { this.close(); resolve(false); } },
        { label: "Confirmar", cls: "primary", onClick: () => { this.close(); resolve(true); } }
      ]);
    });
  },

  /**
   * Toast notification
   */
  toast(msg, type = "success") {
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    el.style.cssText = `
      position:fixed; bottom:80px; right:24px; z-index:9999;
      background:${type === "error" ? "#ef4444" : type === "warn" ? "#f59e0b" : "#22c55e"};
      color:#fff; padding:14px 24px; border-radius:10px; font-weight:600;
      box-shadow:0 4px 12px rgba(0,0,0,.25); opacity:0; transform:translateY(10px);
      transition:all .3s ease;
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = "1"; el.style.transform = "translateY(0)"; });
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateY(20px)";
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }
};

// Auto-init quando DOM ready
document.addEventListener("DOMContentLoaded", () => Modal.init());

// ╔══════════════════════════════════════╗
// ║  PIX — Config, QR Code, Pagamento   ║
// ╚══════════════════════════════════════╝

const PixManager = {
  LS_KEY: "pix_config",
  _qrLib: null,

  // ===== CONFIG =====
  getConfig() {
    try { return JSON.parse(localStorage.getItem(this.LS_KEY)) || {}; } catch { return {}; }
  },

  saveConfig(cfg) {
    cfg.dataAtualizacao = new Date().toISOString();
    localStorage.setItem(this.LS_KEY, JSON.stringify(cfg));
    if (window.syncManager?.db) {
      window.syncManager.db.collection("data").doc("keys")
        .set({ pix_config: cfg }, { merge: true }).catch(() => {});
    }
  },

  async loadFromServer() {
    if (!window.syncManager?.db) return;
    try {
      const doc = await window.syncManager.db.collection("data").doc("keys").get();
      if (doc.exists && doc.data().pix_config) {
        const remote = doc.data().pix_config;
        const local = this.getConfig();
        if (!local.dataAtualizacao || new Date(remote.dataAtualizacao) > new Date(local.dataAtualizacao)) {
          localStorage.setItem(this.LS_KEY, JSON.stringify(remote));
        }
      }
    } catch (e) { console.warn("⚠️ PIX loadFromServer:", e); }
  },

  // ===== PAYLOAD PIX (EMV BR Code) =====
  _tlv(id, val) {
    const len = val.length.toString().padStart(2, "0");
    return id + len + val;
  },

  _crc16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
        crc &= 0xFFFF;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  },

  gerarPayload(valor) {
    const cfg = this.getConfig();
    if (!cfg.chave) return null;

    const nome = (cfg.nome || "LOJA").substring(0, 25).toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const cidade = (cfg.cidade || "SAO PAULO").substring(0, 15).toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const gui = this._tlv("00", "br.gov.bcb.pix");
    const chave = this._tlv("01", cfg.chave);
    const mai = this._tlv("26", gui + chave);
    const txid = this._tlv("05", "***");
    const ad = this._tlv("62", txid);

    let payload =
      this._tlv("00", "01") + mai +
      this._tlv("52", "0000") +
      this._tlv("53", "986");

    if (valor && valor > 0) payload += this._tlv("54", valor.toFixed(2));

    payload +=
      this._tlv("58", "BR") +
      this._tlv("59", nome) +
      this._tlv("60", cidade) + ad;

    payload += "6304";
    payload += this._crc16(payload);
    return payload;
  },

  // ===== QR CODE =====
  async _loadQRLib() {
    if (this._qrLib) return this._qrLib;
    if (typeof qrcode !== "undefined") { this._qrLib = qrcode; return this._qrLib; }
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js";
      s.onload = () => { this._qrLib = qrcode; resolve(qrcode); };
      s.onerror = () => reject(new Error("Falha ao carregar lib QR"));
      document.head.appendChild(s);
    });
  },

  async gerarQRBase64(payload) {
    const lib = await this._loadQRLib();
    const qr = lib(0, "M");
    qr.addData(payload);
    qr.make();
    return qr.createDataURL(8, 4);
  },

  // ===== MODAL PIX (com Confirmar / Cancelar) =====
  async mostrar(valorVenda, onConfirm, onCancel) {
    const cfg = this.getConfig();

    if (!cfg.chave) {
      Modal.show("PIX não configurado",
        "<p>Configure o PIX em <b>Gestão → Config PIX</b> antes de usar esta forma de pagamento.</p>",
        [
          { label: "Cancelar venda", cls: "ghost", onClick: () => { Modal.close(); onCancel?.(); } }
        ]
      );
      return;
    }

    const payload = this.gerarPayload(valorVenda);
    if (!payload) { onCancel?.(); return; }

    let qrBase64;
    try {
      qrBase64 = await this.gerarQRBase64(payload);
    } catch (e) {
      console.error("❌ QR:", e);
      Modal.toast("Erro ao gerar QR Code", "error");
      onCancel?.();
      return;
    }

    // Cache QR no Firebase
    if (window.syncManager?.db) {
      window.syncManager.db.collection("data").doc("keys").set({
        pix_last_qr: { base64: qrBase64, payload, valor: valorVenda, data: new Date().toISOString() }
      }, { merge: true }).catch(() => {});
    }

    const fmtVal = v => "R$ " + (v || 0).toFixed(2).replace(".", ",");

    const html = `
      <div style="text-align:center">
        <img src="${qrBase64}" alt="QR PIX" style="width:260px;height:260px;border-radius:12px;border:3px solid #e2e8f0;margin:8px auto">
        <p style="font-size:22px;font-weight:800;color:#10b981;margin:12px 0">${fmtVal(valorVenda)}</p>
        <p style="font-size:13px;color:#64748b;margin-bottom:8px">Escaneie o QR Code ou copie o código:</p>
        <div style="position:relative">
          <input id="pixCopiaCola" readonly value="${payload}"
            style="width:100%;padding:10px 50px 10px 12px;border:2px solid #e2e8f0;border-radius:8px;font-size:11px;background:#f8fafc;cursor:pointer"
            onclick="this.select()">
          <button onclick="PixManager.copiar()"
            style="position:absolute;right:4px;top:4px;padding:6px 12px;background:#4f7cff;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">
            📋 Copiar
          </button>
        </div>
        <p style="font-size:11px;color:#94a3b8;margin-top:8px">Chave: ${cfg.chave}</p>
        <p style="font-size:12px;color:#f59e0b;margin-top:6px;font-weight:600">Confirme após o cliente efetuar o pagamento.</p>
      </div>`;

    Modal.show("📱 Pagamento via PIX", html, [
      {
        label: "❌ Cancelar venda", cls: "ghost", onClick: () => {
          Modal.close();
          onCancel?.();
        }
      },
      {
        label: "✅ Confirmar pagamento", cls: "primary", onClick: () => {
          Modal.close();
          onConfirm?.();
        }
      }
    ]);
  },

  copiar() {
    const el = document.getElementById("pixCopiaCola");
    if (!el) return;
    el.select();
    navigator.clipboard.writeText(el.value).then(() => {
      Modal.toast("📋 Código PIX copiado!");
    }).catch(() => {
      document.execCommand("copy");
      Modal.toast("📋 Código copiado!");
    });
  },

  // ===== CONFIG (usado por pix-config.html via postMessage ou diretamente) =====
  _mostrarConfig() {
    const cfg = this.getConfig();
    const html = `
      <div style="display:flex;flex-direction:column;gap:14px">
        <div>
          <label style="font-weight:600;font-size:13px;color:#475569;display:block;margin-bottom:4px">Tipo da Chave</label>
          <select id="pixTipoChave" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;font-size:14px">
            <option value="cpf" ${cfg.tipoChave==="cpf"?"selected":""}>CPF</option>
            <option value="cnpj" ${cfg.tipoChave==="cnpj"?"selected":""}>CNPJ</option>
            <option value="email" ${cfg.tipoChave==="email"?"selected":""}>E-mail</option>
            <option value="telefone" ${cfg.tipoChave==="telefone"?"selected":""}>Telefone</option>
            <option value="aleatoria" ${cfg.tipoChave==="aleatoria"?"selected":""}>Chave Aleatória</option>
          </select>
        </div>
        <div>
          <label style="font-weight:600;font-size:13px;color:#475569;display:block;margin-bottom:4px">Chave PIX <span style="color:#ef4444">*</span></label>
          <input id="pixChave" value="${cfg.chave||""}" placeholder="Digite a chave PIX"
            style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;font-size:14px">
        </div>
        <div>
          <label style="font-weight:600;font-size:13px;color:#475569;display:block;margin-bottom:4px">Nome do Recebedor</label>
          <input id="pixNome" value="${cfg.nome||""}" placeholder="Nome que aparece no QR" maxlength="25"
            style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;font-size:14px">
        </div>
        <div>
          <label style="font-weight:600;font-size:13px;color:#475569;display:block;margin-bottom:4px">Cidade</label>
          <input id="pixCidade" value="${cfg.cidade||""}" placeholder="Cidade do recebedor" maxlength="15"
            style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;font-size:14px">
        </div>
      </div>`;

    Modal.show("⚙️ Configuração PIX", html, [
      { label: "Cancelar", cls: "ghost", onClick: () => Modal.close() },
      {
        label: "💾 Salvar", cls: "primary", onClick: () => {
          const chave = document.getElementById("pixChave")?.value?.trim();
          if (!chave) { Modal.toast("Chave PIX é obrigatória!", "error"); return; }
          this.saveConfig({
            tipoChave: document.getElementById("pixTipoChave")?.value || "cpf",
            chave,
            nome: document.getElementById("pixNome")?.value?.trim() || "LOJA",
            cidade: document.getElementById("pixCidade")?.value?.trim() || "SAO PAULO"
          });
          Modal.close();
          Modal.toast("✅ PIX configurado!");
        }
      }
    ]);
  },

  // ===== INIT =====
  init() {
    this.loadFromServer();
    console.log("📱 PixManager inicializado");
  }
};

window.PixManager = PixManager;

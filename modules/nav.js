// ╔══════════════════════════════════════╗
// ║  NAV — Navegação + Popups laterais  ║
// ╚══════════════════════════════════════╝

const Nav = {
  init() {
    // Bottom nav (se existir)
    document.getElementById("btnBack")?.addEventListener("click", () => history.back());
    document.getElementById("btnNext")?.addEventListener("click", () => history.forward());
    document.getElementById("btnHome")?.addEventListener("click", () => location.href = "pdv.html");
  }
};

/**
 * Popup lateral reutilizável
 * Uso: PopupLateral.abrir("popupCaixa", "frameCaixa", "caixa.html")
 */
const PopupLateral = {
  abrir(popupId, frameId, url) {
    const popup = document.getElementById(popupId);
    const frame = document.getElementById(frameId);
    if (frame) frame.src = url;
    if (popup) popup.classList.add("show");
  },

  fechar(popupId, frameId) {
    const popup = document.getElementById(popupId);
    const frame = document.getElementById(frameId);
    if (popup) popup.classList.remove("show");
    setTimeout(() => { if (frame) frame.src = ""; }, 400);
  }
};

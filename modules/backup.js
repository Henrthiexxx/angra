// ╔════════════════════════════════════════════╗
// ║  BACKUP.JS — Snapshot local + Drive diário ║
// ╚════════════════════════════════════════════╝
// Fluxo:
//   1. Snapshot localStorage a cada 1h (chave fazzo_snapshot_YYYY-MM-DDTHH)
//   2. Mantém últimas 24h de snapshots locais
//   3. À meia-noite: upload JSON → Google Drive (atualiza ou cria arquivo)
//   4. Se token expirou à meia-noite: marca pendente → tenta no próximo login

const BackupManager = (() => {

  // ────── CONSTANTES ──────
  const DRIVE_SCOPE     = 'https://www.googleapis.com/auth/drive.file';
  const SS_TOKEN_KEY    = 'fazzo_gdrive_token';   // sessionStorage (expira ao fechar aba)
  const LS_LAST_BACKUP  = 'fazzo_last_backup';
  const LS_PENDENTE     = 'fazzo_backup_pendente';
  const SNAPSHOT_PREFIX = 'fazzo_snapshot_';
  const MAX_SNAPSHOTS   = 24;

  let _tokenData = null;

  // ────── TOKEN ──────
  function setToken(accessToken) {
    // Token Google expira em ~60min; usamos 55min como margem
    _tokenData = { token: accessToken, expiry: Date.now() + 55 * 60 * 1000 };
    try { sessionStorage.setItem(SS_TOKEN_KEY, JSON.stringify(_tokenData)); } catch {}
  }

  function getToken() {
    if (_tokenData && Date.now() < _tokenData.expiry) return _tokenData.token;
    try {
      const raw = sessionStorage.getItem(SS_TOKEN_KEY);
      if (raw) {
        _tokenData = JSON.parse(raw);
        if (Date.now() < _tokenData.expiry) return _tokenData.token;
      }
    } catch {}
    return null;
  }

  // ────── COLETA ──────
  // Captura todas as chaves fazzo_* do localStorage (exceto os próprios snapshots/backups)
function coletarDados() {
  const dados = {};
  const ignorar = [SNAPSHOT_PREFIX, 'fazzo_backup_', 'fazzo_gdrive_', LS_PENDENTE, LS_LAST_BACKUP, SS_TOKEN_KEY];

  const configKeys = Object.values((window.APP_CONFIG?.ls) || {});
  const chavesFazzo = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('fazzo_')) chavesFazzo.push(k);
  }

  [...new Set([...configKeys, ...chavesFazzo])].forEach(k => {
    if (!k) return;
    if (ignorar.some(p => k.startsWith(p))) return;
    const val = localStorage.getItem(k);
    if (val === null) return;
    try { dados[k] = JSON.parse(val); }
    catch { dados[k] = val; }
  });

  return dados;
}

  // ────── SNAPSHOT LOCAL (a cada 1h) ──────
  function salvarSnapshot() {
    const agora = new Date();
    // Chave ex: fazzo_snapshot_2025-02-24T23
    const chave = `${SNAPSHOT_PREFIX}${agora.toISOString().slice(0, 13)}`;
    const payload = JSON.stringify({ ts: agora.toISOString(), dados: coletarDados() });
    try {
      localStorage.setItem(chave, payload);
    } catch (e) {
      // localStorage cheio: remove o snapshot mais antigo e tenta de novo
      const snaps = _listarSnapshots();
      if (snaps.length) localStorage.removeItem(snaps[0]);
      try { localStorage.setItem(chave, payload); } catch {}
    }
    _limparSnapshots();
    console.log('%c📸 Snapshot local salvo:', 'color:#6366f1', chave);
  }

  function _listarSnapshots() {
    return Object.keys(localStorage)
      .filter(k => k.startsWith(SNAPSHOT_PREFIX))
      .sort();
  }

  function _limparSnapshots() {
    const snaps = _listarSnapshots();
    if (snaps.length > MAX_SNAPSHOTS) {
      snaps.slice(0, snaps.length - MAX_SNAPSHOTS).forEach(k => localStorage.removeItem(k));
    }
  }

  // ────── UPLOAD DRIVE ──────
  async function _uploadDrive(token, fileName, conteudo) {
    // Verifica se já existe um arquivo com esse nome
    const q = encodeURIComponent(`name='${fileName}' and trashed=false`);
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!searchRes.ok) throw new Error(`Drive search: ${searchRes.status}`);
    const { files = [] } = await searchRes.json();
    const existingId = files[0]?.id;

    const metadata = { name: fileName, mimeType: 'application/json' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([conteudo], { type: 'application/json' }));

    const url = existingId
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

    const res = await fetch(url, {
      method: existingId ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Drive upload: ${res.status} — ${err}`);
    }
    return res.json();
  }

  // ────── BACKUP DRIVE (chamado à meia-noite) ──────
  async function fazerBackupDrive(silencioso = false) {
    const token = getToken();
    if (!token) {
      console.warn('⚠️ Backup Drive: token expirado/ausente. Pendente para o próximo login.');
      localStorage.setItem(LS_PENDENTE, '1');
      return false;
    }

    const data  = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const fileName = `fazzo_backup_${data}.json`;
    const conteudo = JSON.stringify(
      { versao: '1.0', data, exportadoEm: new Date().toISOString(), dados: coletarDados() },
      null, 2
    );

    try {
      await _uploadDrive(token, fileName, conteudo);
      localStorage.setItem(LS_LAST_BACKUP, new Date().toISOString());
      localStorage.removeItem(LS_PENDENTE);
      console.log('%c☁️ Backup enviado ao Drive:', 'color:#22c55e', fileName);
      if (!silencioso && typeof Modal !== 'undefined') {
        Modal.toast('☁️ Backup diário enviado ao Drive!');
      }
      return true;
    } catch (err) {
      console.error('❌ Backup Drive falhou:', err);
      localStorage.setItem(LS_PENDENTE, '1');
      return false;
    }
  }

  // ────── AGENDADOR ──────
  function _agendarMeiaNoite() {
    const agora    = new Date();
    const meiaNoite = new Date(agora);
    meiaNoite.setHours(24, 0, 10, 0); // 00:00:10 do próximo dia
    const msAteLA = meiaNoite - agora;

    setTimeout(() => {
      fazerBackupDrive();
      setInterval(() => fazerBackupDrive(), 24 * 60 * 60 * 1000);
    }, msAteLA);

    console.log(
      `%c⏰ Backup Drive agendado em ${Math.round(msAteLA / 60000)} min`,
      'color:#f59e0b'
    );
  }

  // ────── INIT ──────
  function init() {
    // Primeiro snapshot imediato
    salvarSnapshot();

    // Snapshot a cada 1h
    setInterval(salvarSnapshot, 60 * 60 * 1000);

    // Agenda backup à meia-noite
    _agendarMeiaNoite();

    // Se havia backup pendente (token expirou ontem), tenta agora (5s após login)
    if (localStorage.getItem(LS_PENDENTE)) {
      setTimeout(() => fazerBackupDrive(true), 5000);
    }
  }

  // ────── RESTORE (utilitário, chamar pelo console se precisar) ──────
  // BackupManager.restaurarSnapshot('fazzo_snapshot_2025-02-24T23')
  function restaurarSnapshot(chave) {
    const raw = localStorage.getItem(chave);
    if (!raw) return console.error('Snapshot não encontrado:', chave);
    const { dados } = JSON.parse(raw);
    if (!confirm(`⚠️ Restaurar snapshot ${chave}? Isso sobrescreve os dados atuais.`)) return;
    Object.entries(dados).forEach(([k, v]) => {
      localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    });
    console.log('✅ Snapshot restaurado:', chave);
    location.reload();
  }

  function listarSnapshots() {
    return _listarSnapshots().map(k => {
      try {
        const { ts } = JSON.parse(localStorage.getItem(k));
        return { chave: k, salvoEm: ts };
      } catch { return { chave: k }; }
    });
  }

  return {
    DRIVE_SCOPE,       // use no GoogleAuthProvider
    setToken,          // chame após signInWithPopup com result.credential.accessToken
    getToken,
    init,              // chame no DOMContentLoaded
    salvarSnapshot,
    fazerBackupDrive,
    listarSnapshots,
    restaurarSnapshot
  };

})();

window.BackupManager = BackupManager;
// ============================================================
// AUTH.JS — Autenticação Microsoft (MSAL.js)
// Depende de: config.js, data.js, graph.js, render.js
// Carregar após todos os outros módulos exceto ui.js
// ============================================================
'use strict';

/* ============================================================
   MSAL — AUTENTICAÇÃO MICROSOFT
   ============================================================ */
const msalInstance = new msal.PublicClientApplication({
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: REDIRECT_URI
  },
  cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false }
});
const loginRequest = { scopes: ['User.Read', 'Files.ReadWrite'] };

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
async function init() {
  try {
    await msalInstance.handleRedirectPromise();
  } catch (e) { /* ignore */ }

  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
    await onAuthenticated();
  } else {
    document.getElementById('screen-login').classList.remove('hidden');
  }
}

async function doLogin() {
  try {
    document.getElementById('login-error').textContent = '';
    await msalInstance.loginRedirect(loginRequest);
  } catch (e) {
    document.getElementById('login-error').textContent = 'Erro ao fazer login: ' + e.message;
  }
}

async function doLogout() {
  if (!confirm('Deseja sair da conta Microsoft?')) return;
  localStorage.removeItem('rfm_file_id');
  await closeWorkbookSession();
  await msalInstance.logoutRedirect();
}

async function getToken() {
  const account = msalInstance.getActiveAccount();
  if (!account) throw new Error('Usuário não autenticado');
  try {
    const r = await msalInstance.acquireTokenSilent({ ...loginRequest, account });
    return r.accessToken;
  } catch {
    const r = await msalInstance.acquireTokenRedirect(loginRequest);
    return r.accessToken;
  }
}

async function onAuthenticated() {
  showLoading(true, 'Conectando ao OneDrive...');
  try {
    S.token = await getToken();
    document.getElementById('screen-login').classList.add('hidden');
    document.getElementById('screen-app').classList.remove('hidden');
    initHeader();
    initMesSelect();
    await loadAllData();
    initConfiguracoes();
  } catch (e) {
    showLoading(false);
    document.getElementById('login-error').textContent = 'Erro de conexão: ' + e.message;
    document.getElementById('screen-login').classList.remove('hidden');
  }
}

/* ============================================================
   CARGA DE DADOS
   ============================================================ */
async function loadAllData() {
  showLoading(true, 'Localizando arquivo...');
  try {
    await findFile();
    await createWorkbookSession();
    showLoading(true, 'Criando estrutura...');
    await ensureSheet(SHEET_METAS, ['Categoria','Teto Mensal','Alerta em %']);
    await ensureSheet(SHEET_CFG, ['Chave','Valor']);
    await ensureSheet('Patrimônio', ['Data','Tipo','Descrição','Valor','Fonte','Ano']);

    showLoading(true, 'Lendo transações...');
    const rawDados = await getSheetValues(SHEET_DADOS);
    S.transactions = parseDados(rawDados);

    showLoading(true, 'Lendo metas...');
    const rawMetas = await getSheetValues(SHEET_METAS);
    S.metas = parseMetas(rawMetas);

    const rawCfg = await getSheetValues(SHEET_CFG);
    S.config = parseCfg(rawCfg);

    const rawPatrimonio = await getSheetValues('Patrimônio');
    S.patrimonio = parsePatrimonio(rawPatrimonio || []);

    showLoading(false);
    renderAll();
    syncGastosCartao();
  } catch (e) {
    showLoading(false);
    alert('Erro ao carregar dados: ' + e.message);
  }
}

/* ============================================================
   INICIAR
   ============================================================ */
init();

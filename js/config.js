// ============================================================
// CONFIG.JS — Constantes, estado global e regras
// Carregar PRIMEIRO antes de todos os outros módulos
// ============================================================
'use strict';

/* ============================================================
   CONFIGURAÇÃO
   ============================================================ */
const CLIENT_ID    = 'a68a8517-a38f-42a2-b487-02945681c354';
const TENANT_ID    = '5c9eb6f9-84b8-49fc-a9f4-3f00f62dfe78';
const REDIRECT_URI = 'https://luizrafaelvm.github.io/financas/';
const FILE_PATH    = '/Financeiro/financas-rafael.xlsx';
const SHEET_DADOS  = 'Dados';
const SHEET_METAS  = 'Metas';
const SHEET_CFG    = 'Configurações';

/* ============================================================
   CORES POR CATEGORIA
   ============================================================ */
const CORES = {
  'Moradia':'#0A84FF','Filhas':'#30D158','Saúde':'#FF453A',
  'Alimentação':'#FF9F0A','Transporte':'#64D2FF','Lazer':'#BF5AF2',
  'Vestuário':'#FF6B6B','Assinaturas':'#FFD60A','Financiamentos':'#FF6830',
  'Receitas':'#30D158','Compras Online':'#FF7043','Outros':'#8E8E93'
};

const ESSENCIAIS = ['Moradia','Filhas','Saúde','Financiamentos'];
const SUPERFLUOUS = ['Lazer','Vestuário','Assinaturas'];

/* ============================================================
   CATEGORIZAÇÃO AUTOMÁTICA
   ============================================================ */
const REGRAS = [
  {kw:['PAGUE MENOS','DROGASIL','ULTRAFARMA','DROGA RAIA','FARMACIA','DROGARIA','PACHECO','RAIA'],cat:'Saúde',sub:'Medicamentos'},
  {kw:['CONSULTA','CLINICA','DR ','DRA ','MEDICO','HOSPITAL','LABORATORIO','EXAME','RDSAUDE'],cat:'Saúde',sub:'Consultas'},
  {kw:['UNIMED','AMIL','SULAMERICA','HAPVIDA'],cat:'Saúde',sub:'Plano de Saúde'},
  {kw:['PENSAO','PENSÃO','ALIMENTOS'],cat:'Filhas',sub:'Pensão'},
  {kw:['ESCOLA','COLEGIO','COLÉGIO','MATERIAL ESCOLAR'],cat:'Filhas',sub:'Educação'},
  {kw:['FINANCIAMENTO','PRESTACAO IMOVEL','CAIXA ECONOMICA HABIT'],cat:'Moradia',sub:'Financiamento'},
  {kw:['CONDOMINIO','CONDOMÍNIO'],cat:'Moradia',sub:'Condomínio'},
  {kw:['IPTU','PREFEITURA'],cat:'Moradia',sub:'IPTU'},
  {kw:['IFOOD','RAPPI','UBER EATS','JAMES DELIVERY'],cat:'Alimentação',sub:'Delivery'},
  {kw:['CARREFOUR','EXTRA','PAO DE ACUCAR','HORTIFRUTI','ATACADAO','ASSAI','SUPERMERCADO','ZAFFARI','OBA HORTI','MERCADOCAR'],cat:'Alimentação',sub:'Supermercado'},
  {kw:['RESTAURANTE','LANCHONETE','PIZZARIA','SUSHI','HAMBURGER','CHURRASCARIA','BURGER KING','PADARIA','EMPANADA','BODEGA','FAFRE','PUPORK'],cat:'Alimentação',sub:'Restaurante'},
  {kw:['UBER','99APP','99POP','CABIFY','MOVIDA'],cat:'Transporte',sub:'Aplicativo'},
  {kw:['POSTO','COMBUSTIVEL','GASOLINA','SHELL','IPIRANGA'],cat:'Transporte',sub:'Combustível'},
  {kw:['ESTACIONAMENTO','PARKING','PARK','REK PARKING'],cat:'Transporte',sub:'Estacionamento'},
  {kw:['NETFLIX','SPOTIFY','GLOBOPLAY','DISNEY','HBO','AMAZON PRIME','APPLE TV','YOUTUBE PREMIUM'],cat:'Lazer',sub:'Streaming'},
  {kw:['CINEMA','TEATRO','SHOW','INGRESSO','TICKETMASTER','EVENTIM','INTI*TEATRO'],cat:'Lazer',sub:'Eventos'},
  {kw:['BAR ','BALADA','NIGHT','BLACK DOGS','BLUE HOUSE'],cat:'Lazer',sub:'Bares'},
  {kw:['DECATHLON','MIMIC'],cat:'Lazer',sub:'Esporte'},
  {kw:['MICROSOFT','ADOBE','DROPBOX','GOOGLE ONE','ICLOUD','LINKEDIN','OPENAI','ANTHROPIC'],cat:'Assinaturas',sub:'Software'},
  {kw:['ASAAS'],cat:'Assinaturas',sub:'Serviço Digital'},
  {kw:['ZARA','H&M','RENNER','C&A','RIACHUELO','HERING','FARM','AREZZO','BEFIX','DAISO'],cat:'Vestuário',sub:'Roupas'},
  {kw:['PRO-LABORE','PROLABORE','HONORARIOS','HONORÁRIOS','TED RECEBIDA','PIX RECEBIDO'],cat:'Receitas',sub:'Pró-labore'},
  {kw:['MERCADOLIVRE','MERCADOL','AMAZONMKTPLC','AMAZON','TOPCANDYD'],cat:'Compras Online',sub:'Marketplace'},
  {kw:['PRUDENT','APOL'],cat:'Financiamentos',sub:'Seguro'},
  {kw:['CELSO FLIPER','LIONASSISTENCIA'],cat:'Moradia',sub:'Manutenção'},
  {kw:['GRUPO ESPIRITA','LIVRARIA'],cat:'Lazer',sub:'Cultura'},
  {kw:['TINTA'],cat:'Moradia',sub:'Reforma'},
];

/* ============================================================
   PROMPT DE ANÁLISE DE NOTA FISCAL
   ============================================================ */
const PROMPT_NF = `Extraia todos os dados desta nota fiscal e retorne exatamente este JSON:
{
  "estabelecimento": "nome do estabelecimento",
  "data": "DD/MM/YYYY",
  "valor_total": 0.00,
  "itens": [
    {
      "descricao": "nome do item ou serviço",
      "quantidade": 1,
      "valor_unitario": 0.00,
      "valor_total_item": 0.00
    }
  ],
  "forma_pagamento": "cartão/dinheiro/pix/não identificado",
  "categoria_sugerida": "use apenas: Saúde, Alimentação, Moradia, Transporte, Lazer, Vestuário, Assinaturas, Outros",
  "subcategoria_sugerida": "subcategoria específica",
  "observacao": "informação adicional relevante"
}
Regra: valor_unitario × quantidade = valor_total_item para cada item.
Regra: soma de todos valor_total_item = valor_total da nota.`;

/* ============================================================
   UTILITÁRIO NECESSÁRIO PARA INICIALIZAR S
   (getMesAtual também está em data.js — aqui é apenas para o init)
   ============================================================ */
function getMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

/* ============================================================
   ESTADO GLOBAL
   ============================================================ */
const S = {
  token:               null,
  fileId:              localStorage.getItem('rfm_file_id') || null,
  transactions:        [],
  metas:               {},
  config:              {},
  mesAtual:            getMesAtual(),
  importBuffer:        [],
  chatHistory:         [],
  charts:              {},
  gastosCartaoFileId:  localStorage.getItem('rfm_gastoscartao_id') || null,
  gastosCartaoAnoBase: parseInt(localStorage.getItem('rfm_gastoscartao_anobase')) || (new Date().getFullYear() - 3)
};

/* ============================================================
   GLOBALS ADICIONAIS
   ============================================================ */
window.nfBuffer = [];
window.mapeamentoPendente = null;

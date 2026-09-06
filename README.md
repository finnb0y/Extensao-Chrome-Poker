# Extensao-Chrome-Poker

Extensão Chrome (Manifest V3) para extrair registros da tabela `#table_cash_registros`, incluindo o campo **Obs** (olhinho), somente para o site de poker configurado.

## Configuração do domínio (obrigatório)

Antes de carregar a extensão, ajuste o domínio em:

- `/home/runner/work/Extensao-Chrome-Poker/Extensao-Chrome-Poker/manifest.json`
  - `host_permissions`
  - `content_scripts[*].matches`
  - `web_accessible_resources[*].matches`

Substitua `https://poker.example.com/*` pelo domínio real do seu site.

## Como carregar no Chrome

1. Abra `chrome://extensions`
2. Ative **Modo do desenvolvedor**
3. Clique em **Carregar sem compactação**
4. Selecione a pasta:
   - `/home/runner/work/Extensao-Chrome-Poker/Extensao-Chrome-Poker`

## Como usar

1. Entre no site de poker (já autenticado).
2. Abra a página que contém a tabela de registros.
3. Clique no ícone da extensão.
4. Clique em **Ativar neste site**.
5. Clique em **Coletar agora**.
6. Use:
   - **Copiar CSV**
   - **Copiar JSON**

## O que a extensão coleta

Por linha da tabela:

- HrE
- Mesa
- GameID
- Nome
- C
- D
- S
- Saldo/CashGame
- Saldos/Outros
- Saldo/Final
- Obs

## Estratégia para capturar Obs

1. Tenta ler diretamente do DOM (atributos como `title`, `data-*`, conteúdo oculto).
2. Se não existir no DOM, captura respostas JSON de requisições `fetch`/`XMLHttpRequest` da página e procura campos equivalentes a observação/telefone/contato para preencher o cache.

## Segurança e escopo

- Sem bypass de autenticação.
- Sem armazenamento persistente dos dados coletados (além do estado de ativação por origem no `chrome.storage.local`).
- Permissões mínimas para o domínio configurado.
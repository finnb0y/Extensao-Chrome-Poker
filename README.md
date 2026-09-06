# Extensao-Chrome-Poker

Extensão Chrome (Manifest V3) para extrair registros das tabelas de poker (cash e torneio), incluindo o campo **Obs** (olhinho), no site configurado.

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
2. Abra uma página com tabela de registros.
3. Clique no ícone da extensão.
4. A extensão já tenta coletar automaticamente.
5. Use os filtros:
   - **Registros Abertos**
   - **Registros Fechados**
6. Se necessário, clique em **Coletar neste site** para forçar nova coleta.

Se os dois filtros estiverem marcados, o popup mostra as duas tabelas separadas por divisão visual.

## O que a extensão coleta

- Tabelas suportadas de cash e torneio
- Campo **Obs** (inclusive conteúdo oculto)
- Tipo da linha em `TipoRegistro` (`Cash` ou `Torneio`)
- Status da linha em `StatusRegistro` (`Aberto` ou `Fechado`)

## Estratégia para capturar Obs

1. Tenta ler diretamente do DOM (atributos como `title`, `data-*`, conteúdo oculto).
2. Se não existir no DOM, captura respostas JSON de requisições `fetch`/`XMLHttpRequest` da página e procura campos equivalentes a observação/telefone/contato para preencher o cache.

## Segurança e escopo

- Sem bypass de autenticação.
- Sem armazenamento persistente dos dados coletados.
- Permissões mínimas para o domínio configurado.

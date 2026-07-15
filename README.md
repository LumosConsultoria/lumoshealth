# Lumos Health

MVP de Prontuário Eletrônico do Paciente para atenção primária. A experiência foi desenhada para consultas curtas e de alto volume: histórico persistente no topo, timeline única e registro clínico por voz com revisão rápida.

## O que já está no MVP

- Workspace clínico responsivo com timeline multiprofissional.
- Captura de microfone, legenda ao vivo demonstrativa e revisão estruturada.
- Proxy WebSocket para Deepgram Nova-3 (`pt-BR`) no backend Node.
- Estruturação clínica pela OpenAI Responses API, com Structured Outputs e schemas por categoria profissional.
- Receita, exames e atalhos de teclado em poucos passos.
- PWA offline-first com fila local temporária para registros pendentes.
- Modelo multi-tenant para D1 (demo publicada) e PostgreSQL com RLS (produção).
- Autenticação CPF + senha, permissões por categoria e trilha de auditoria no backend.
- Docker Compose com PostgreSQL, Redis e API.

## Desenvolvimento web

Requer Node.js 22 ou superior.

```bash
npm install
npm run dev
```

A interface abre em `http://localhost:3000`.

## Backend clínico

Copie `server/.env.example` para `server/.env`, adicione as chaves da Deepgram e OpenAI e inicie:

```bash
docker compose up --build
```

A API abre em `http://localhost:4000`. As chaves de fornecedores permanecem somente no backend.

## Atalhos

- `Ctrl + Space`: iniciar/finalizar escuta.
- `Alt + R`: emitir receita.
- `Alt + E`: solicitar exame.

> Os dados exibidos na demonstração são inteiramente fictícios.

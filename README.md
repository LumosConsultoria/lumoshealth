# Lumos Health

MVP de Prontuário Eletrônico do Paciente para atenção primária. A experiência foi desenhada para consultas curtas e de alto volume: histórico persistente no topo, timeline única e escuta ambiente com revisão clínica obrigatória.

## O que já está no MVP

- Workspace clínico responsivo com timeline multiprofissional.
- Escuta natural da conversa entre profissional e paciente, sem exigir ditado.
- Transcrição ao vivo por interlocutor com Deepgram Nova-3 (`pt-BR`) e diarização.
- Estruturação clínica incremental pela OpenAI Responses API, com Structured Outputs e schemas por categoria profissional.
- Campos sugeridos visíveis durante a consulta e aprovação profissional antes de qualquer registro.
- Conduta sugerida pela IA, com exames e receitas em filas separadas de aprovação; somente itens aprovados entram no atendimento final.
- Timeline clicável com detalhes do registro clínico, exames solicitados e receitas emitidas.
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

Nunca envie nem versione chaves de API. No PowerShell, crie os arquivos locais ignorados pelo Git:

```powershell
Copy-Item .env.example .env.local
Copy-Item server/.env.example server/.env
```

Preencha:

- `.env.local`: `OPENAI_API_KEY` e `DEEPGRAM_API_KEY`. `NEXT_PUBLIC_VOICE_WS_URL` é opcional para usar o proxy Node local.
- `server/.env`: `DEEPGRAM_API_KEY`, `OPENAI_API_KEY` e as configurações do backend.

O navegador nunca recebe as chaves permanentes. O site emite um token Deepgram temporário de 30 segundos para abrir a transcrição, e a estruturação OpenAI acontece no servidor. Em seguida, inicie:

```bash
docker compose up --build
```

A API abre em `http://localhost:4000`. As chaves de fornecedores permanecem somente no backend.

Em produção, cadastre `OPENAI_API_KEY` e `DEEPGRAM_API_KEY` como segredos do projeto. O áudio é encaminhado durante a sessão e não é persistido pelo código do MVP; o prontuário só recebe o texto revisado e confirmado pelo profissional.

## Atalhos

- `Ctrl + Space`: iniciar/finalizar escuta.
- `Alt + R`: emitir receita.
- `Alt + E`: solicitar exame.

> Os dados exibidos na demonstração são inteiramente fictícios.

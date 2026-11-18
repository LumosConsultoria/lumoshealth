# Lumos Health

> **STATUS — 18/11/2026: DEMONSTRAÇÃO, NÃO SISTEMA CLÍNICO.** A interface exibe dados fictícios; o login visual não autentica profissionais. As rotas Next.js de IA, transcrição e registros estão bloqueadas por padrão e sempre bloqueadas em produção. Não há assinatura, prescrição ou pedido de exame clinicamente válido. Não insira dados reais de pacientes.

MVP de Prontuário Eletrônico do Paciente para atenção primária. A experiência foi desenhada para consultas curtas e de alto volume: histórico persistente no topo, timeline única e escuta ambiente com revisão clínica obrigatória.

## O que já está no MVP

- Workspace clínico responsivo com timeline multiprofissional.
- Escuta natural da conversa entre profissional e paciente, sem exigir ditado.
- Transcrição ao vivo por interlocutor com Deepgram Nova-3 (`pt-BR`) e diarização.
- Estruturação clínica incremental pela OpenAI Responses API, com Structured Outputs e schemas por categoria profissional.
- Campos sugeridos e aprovação **visual simulada**; ainda não há comprovação de aprovação clínica autenticada no servidor.
- Conduta sugerida pela IA, com exames e receitas em filas separadas de aprovação; somente itens aprovados entram no atendimento final.
- Timeline clicável com detalhes do registro clínico, exames solicitados e receitas emitidas.
- Fluxos visuais simulados de receita e exames (sem emissão de documentos clínicos válidos) e atalhos de teclado.
- PWA demonstrativa. O fluxo visual não armazena transcrições no localStorage do navegador; sincronização offline clínica não está habilitada.
- Protótipo de modelos multi-tenant e políticas RLS em PostgreSQL; isolamento entre organizações ainda sem validação de segurança para produção.
- Implementação experimental de autenticação JWT no backend, desativada por padrão; a tela demonstração não implementa autenticação clínica.
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

## Limites de segurança para a demonstração

- Por padrão, `/api/records`, `/api/structure` e `/api/deepgram/token` retornam HTTP 403, inclusive em implantações públicas.
- Para uma **demonstração LOCAL com dados inteiramente fictícios**, use `NODE_ENV=development` e defina `LUMOS_ENABLE_LOCAL_DEMO_API=true` em `.env.local`. O serviço deve permanecer acessível apenas no próprio computador. Esta chave **não é autenticação** e não autoriza dados reais.
- Mesmo nessa demonstração, `/api/records` persiste somente **rascunho não assinado**, sem transformar sugestões de IA em prescrições ou solicitações de exames.
- O backend Express exige `LUMOS_ENABLE_BACKEND_API=true` **e** `JWT_SECRET` forte para liberar login e `/clinical/structure`; esta API também não está certificada para produção.
- O proxy WebSocket `/voice/stream` foi bloqueado até existir autenticação/controle de origem testados. Use a transcrição direta temporária apenas no ambiente local explicitamente habilitado.
- O Docker Compose publica PostgreSQL, Redis e API somente em `127.0.0.1`.
- Nenhuma trilha de aprovação clínica, LGPD, RLS ou política de retenção deve ser considerada validada por estes bloqueios. É necessária análise independente antes de qualquer uso real.

## Verificações automatizadas

```bash
node --test tests/demo-security.test.mjs tests/clinical-safety-contract.test.mjs
node --check server/src/index.mjs
npm ci
npx tsc --noEmit
npm run lint
npm test
```

As verificações não substituem testes integrados de autenticação, isolamento entre tenants, autorização, segurança de dados e revisão clínica.

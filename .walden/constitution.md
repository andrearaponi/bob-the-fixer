# Project Constitution

This file captures stable project-wide context that applies across all features. It is optional and does not participate in the approval workflow.

## Project Summary

Bob the Fixer è un server MCP (Model Context Protocol) che esegue SonarQube in locale (containerizzato) e ne espone i risultati come **contesto pronto-per-il-fix** per assistenti AI (Claude Code, Copilot CLI, Gemini CLI, Codex CLI). Non è un wrapper 1:1 dell'API SonarQube: aggrega più endpoint per tool (fino a ~9 in `sonar_get_issue_details`) per dare all'LLM contesto denso e orientato alla remediation. Distribuito via `curl | bash`, transport primario **stdio**. Obiettivo di prodotto in corso: aggiungere analisi SCA (Software Composition Analysis) tramite Trivy.

## Tech Stack

- **Linguaggio**: TypeScript in `strict` mode (target ES2022, ESM).
- **Runtime**: Node.js 18/20 (matrice CI).
- **Monorepo**: npm workspaces; l'unico package pubblico è `packages/core` (`@bob-the-fixer/core`).
- **MCP**: `@modelcontextprotocol/sdk` (transport stdio + StreamableHTTP).
- **HTTP client**: `axios`. **Validazione**: `zod`. **DI**: `tsyringe` + `reflect-metadata` (dichiarata ma **non cablata a runtime** — vedi Hard Rules).
- **Test**: `vitest` (config in `packages/core/vitest.config.mts`), coverage v8.
- **Infra**: SonarQube via `podman-compose`/`docker compose` (`infrastructure/podman-compose.yml`), immagine pinnata per digest.

## Conventions

- **Layout**: `packages/core/src/{mcp,core,sonar,universal,infrastructure,repositories,scanners,shared}`. `core/*` decomposto per dominio (`admin`, `analysis`, `project`, `reporting`, `scanning`).
- **Handler MCP**: uno per tool in `src/mcp/handlers/*.handler.ts`, dispatchati da `src/mcp/ToolRouter.ts`; definizioni in `src/mcp/tool-definitions.ts`.
- **Errori**: gerarchia custom in `src/shared/errors/custom-errors.ts` (`BaseError` + sottoclassi, `wrapError`, `isRetryableError`). Verso l'LLM si ritorna `getUserMessage()` con `isError:true`, mai stack trace grezzi.
- **Test co-locati**: `*.test.ts` accanto al sorgente; test di integrazione filesystem in `packages/core/tests/`.
- **Branch**: feature branch da `main` (es. `feature/...`, `fix/...`); PR verso `main`.
- **Segreti**: mai token in log o output MCP; usare `maskToken()` da `infrastructure/security/input-sanitization.ts`.

## Sanity Checks

```bash
# Dalla root del repo
npm install                              # richiede tsyringe/reflect-metadata installati
cd packages/core && npm run build        # tsc, deve passare pulito (strict)
npx vitest run                            # suite completa (l'E2E sonar-contract è gated da SONAR_E2E=1)
# Verifica mirata di un'area:
npx vitest run src/sonar/client.test.ts src/core/scanning/ScanOrchestrator.test.ts
```

## Key Files

- `packages/core/src/universal/universal-mcp-server.ts` — server MCP reale (setup handler, routing, rate-limit).
- `packages/core/src/mcp/ToolRouter.ts` + `tool-definitions.ts` — superficie dei 21 tool.
- `packages/core/src/sonar/client.ts` — **God object (~3.288 righe)**: API Sonar, scan, polling CE, cache. Cuore reale del sistema.
- `packages/core/src/core/scanning/ScanOrchestrator.ts` — flusso completo di scansione.
- `packages/core/src/scanners/{IScanner,IIssue,IScanResult}.ts` — astrazione multi-scanner (modello dati già SCA-aware).
- `packages/core/src/infrastructure/di/{container,tokens}.ts` — DI TSyringe (scaffolding non attivo).
- `packages/core/src/sonar/scanner/SonarQubeScanner.ts` — unica implementazione di `IScanner` (con `scan()` che lancia "not implemented").

## Hard Rules

- **Nessun segreto in chiaro nei log o nell'output MCP.** I token Sonar vanno sempre mascherati con `maskToken()`; mai interpolare un token in una stringa loggata o in un messaggio d'errore restituito all'LLM.
- **Nessuna esecuzione via shell con input non fidato.** I comandi scanner devono usare `execFile`/`spawn` con array di argomenti, mai `exec(stringa)` con valori derivati dal repo scansionato (es. nomi file). Regola introdotta dopo la command injection nel percorso .NET.
- **`strict` TypeScript non negoziabile.** Ridurre progressivamente `any`/`as any`; non introdurne di nuovi alle giunzioni.
- **Stato della DI**: il container TSyringe è dichiarato ma **mai risolto a runtime**; il router usa funzioni `@deprecated`. Ogni nuovo lavoro architetturale deve prima decidere se completare o rimuovere la DI, non aggiungere altro scaffolding inattivo.
- **Compatibilità del transport stdio**: è il transport di produzione. L'HTTP è sperimentale/incompleto e non deve essere assunto funzionante.

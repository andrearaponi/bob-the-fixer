# Walden Lessons

Review this file before non-trivial work when the current request matches past mistakes, rejections, or validation failures.

## Lessons

<!-- Append entries with: walden lesson log --feature <name> --phase <phase> --trigger "..." --lesson "..." --guardrail "..." -->
### 2026-07-05T08:17:04Z | scanner-abstraction-di | execute
- Trigger: Implementazione 2.x: il design approvato dice 'ScanOrchestrator possiede il registry e chiama scanner.scan()', ma realizzarlo alla lettera implica o spostare ~761 righe di logica Sonar dentro SonarQubeScanner (alto rischio) o una dipendenza circolare scanner<->orchestrator.
- Lesson: Per una migrazione strangler-fig conviene avvolgere il motore legacy dietro la nuova interfaccia (adapter: SonarQubeScanner incapsula ScanOrchestrator; handler/composition-root possiedono il registry), non spostarne subito le viscere. Stesse ACs, rischio molto minore, e i test dell'orchestratore restano verdi.
- Guardrail: In fase di design, quando un componente 'generico' deve chiamare una nuova astrazione implementata avvolgendo un motore legacy, verificare la direzione della dipendenza (rischio ciclo) PRIMA di fissare la sequenza dei task; preferire adapter+facade come primo incremento.


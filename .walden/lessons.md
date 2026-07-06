# Walden Lessons

Review this file before non-trivial work when the current request matches past mistakes, rejections, or validation failures.

## Lessons

<!-- Append entries with: walden lesson log --feature <name> --phase <phase> --trigger "..." --lesson "..." --guardrail "..." -->
### 2026-07-05T08:17:04Z | scanner-abstraction-di | execute
- Trigger: Implementazione 2.x: il design approvato dice 'ScanOrchestrator possiede il registry e chiama scanner.scan()', ma realizzarlo alla lettera implica o spostare ~761 righe di logica Sonar dentro SonarQubeScanner (alto rischio) o una dipendenza circolare scanner<->orchestrator.
- Lesson: Per una migrazione strangler-fig conviene avvolgere il motore legacy dietro la nuova interfaccia (adapter: SonarQubeScanner incapsula ScanOrchestrator; handler/composition-root possiedono il registry), non spostarne subito le viscere. Stesse ACs, rischio molto minore, e i test dell'orchestratore restano verdi.
- Guardrail: In fase di design, quando un componente 'generico' deve chiamare una nuova astrazione implementata avvolgendo un motore legacy, verificare la direzione della dipendenza (rischio ciclo) PRIMA di fissare la sequenza dei task; preferire adapter+facade come primo incremento.

### 2026-07-05T09:14:07Z | trivy-scanner | requirements
- Trigger: Validazione EARS fallita: R6.AC1 combinava due comportamenti (ritornare un errore actionable + checkHealth riporta unavailable) in un solo SHALL.
- Lesson: Gli AC che mescolano 'ritorna errore' e 'lo stato/health riflette la condizione' sono due comportamenti osservabili distinti e vanno separati anche se riguardano la stessa causa (Trivy non installato).
- Guardrail: In fase di drafting, per ogni condizione di indisponibilità scrivere DUE AC: uno per la risposta all'azione (IF/THEN errore) e uno per lo stato interrogabile (WHEN checkHealth ... unavailable).

### 2026-07-05T10:14:13Z | repo-hygiene-cleanup | design
- Trigger: Validazione design fallita: mancavano le sezioni obbligatorie ## Architecture e ## Simplicity And Elegance Review, omesse perche' lo spec e' piccolo/cosmetico.
- Lesson: Anche gli spec triviali devono includere l'intero set di sezioni richieste dal template Walden; 'e' piccolo' non esime dalla struttura che il validator impone.
- Guardrail: Prima di aprire la review del design, includere sempre TUTTE le sezioni del template (Overview, Architecture, Options Considered, Simplicity And Elegance Review, Components, ... Verification Plan, Requirement Coverage), anche se brevi.

### 2026-07-06T14:40:04Z | trivy-dependency-path | execute
- Trigger: dogfooding on real Trivy output revealed the workspace 'direct' semantics that hand-built fixtures missed
- Lesson: graph-algorithm fixtures must mirror the real tool's structure (a root/manifest that depends on all directs); synthetic graphs omitting the manifest misrepresent 'direct' vs the project package
- Guardrail: for tool-output parsers, capture a real sample and derive a fixture from it — do not validate only against minimal hand-built graphs

### 2026-07-06T18:16:22Z | harden-ci | design
- Trigger: design.md validation failed: missing required section (recurrence of an earlier lesson)
- Lesson: design.md must include ## Simplicity And Elegance Review (and the other required sections); review approve does not re-validate, so an invalid doc can be approved
- Guardrail: run walden validate and confirm ok:true BEFORE walden review approve, never approve on a False validation


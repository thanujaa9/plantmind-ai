# PlantMind AI

Evidence-grounded industrial knowledge intelligence for the ET AI Hackathon 2026, problem statement 8.

PlantMind turns fragmented plant manuals, inspection reports, maintenance logs, and incident reviews into fast, traceable operational answers. Every supported claim links back to an exact source passage; unsupported questions are refused instead of guessed.

## Why it matters

Engineers often search across disconnected plant records before making time-sensitive maintenance decisions. PlantMind connects those records around equipment identities, compares current readings with documented limits, surfaces compound risk patterns, and preserves an audit trail.

## Core features

- Multiple PDF, CSV, and TXT uploads
- Page/row-aware extraction, chunking, indexing, and persistent storage
- Deterministic hybrid retrieval with industrial synonym normalization
- Cross-document reasoning across manuals, inspections, maintenance, and incidents
- Inline citations, expandable exact passages, and clickable source files
- Retrieval-strength score based on passage similarity—not LLM self-confidence
- Calm insufficient-evidence refusal for unsupported questions
- Asset Intelligence, Asset 360, Risk Center, maintenance timeline, and audit fingerprints
- Per-document deletion with index cleanup
- Optional Redis caching/queue and optional grounded LLM rewriting

## Run locally

```bash
npm install
npm run dev
```

- Web: http://localhost:3000
- API: http://localhost:4000

Open http://localhost:3000 and upload documents from `demo-documents/`. The workspace intentionally starts empty and does not seed answers or assets.

No API key is required: the evidence engine has a deterministic local mode designed for a reliable demo.

## Demo flow

1. Upload the four synthetic records in `demo-documents/`.
2. Ask: `Why is Pump P-101 overheating, and should it be taken offline immediately?`
3. Expand citations to inspect exact supporting passages.
4. Ask: `What is the manufacturing date of Pump P-101's motor?`
5. Show the evidence-safe refusal.

The bundled records are realistic synthetic data created for demonstration; they are not confidential factory documents.

## Real document pipeline

- Upload PDF, CSV, or TXT records from the dashboard.
- PDF text is extracted page-by-page; CSV rows are converted into labelled records.
- Files are retained locally under `apps/data/uploads/` (ignored by Git).
- Document metadata and searchable chunks are persisted in `apps/data/plantmind.db` using SQLite.
- Uploaded chunks join the retrieval corpus immediately.
- Citations from uploaded documents include a link to the original stored file.

The local lexical retriever is deliberately deterministic for demo reliability. A hosted embedding provider and Redis worker can replace the retrieval and processing adapters without changing the UI contract.

PlantMind currently combines lexical matching with a deterministic local vector representation and industrial synonym normalization. Queries such as "heat issue" map to temperature evidence, while "deferred servicing" maps to postponed maintenance. Answer caching uses Upstash Redis REST when its environment variables are supplied and falls back to an in-memory TTL cache locally.

Uploads are asynchronous. A document moves through `queued`, `processing`, and `indexed` (or `failed`) states. With Upstash credentials the worker uses a Redis list (`plantmind:document-jobs`); without credentials it uses the same worker contract with an in-process queue. The browser polls document status and reports real page and chunk counts when indexing finishes.

Grounded answer generation is optional. Configure `LLM_API_URL`, `LLM_API_KEY`, and `LLM_MODEL` for an OpenAI-compatible chat-completions endpoint. PlantMind first creates a deterministic evidence-derived draft, then allows the model to rewrite only that draft using cited passages. Missing credentials, timeouts, empty output, and provider errors all fall back to the deterministic answer.

Every answer is auditable. PlantMind records a SHA-256 fingerprint of the normalized question (not the raw question), answer/refusal status, deterministic or LLM generation mode, evidence strength, cited document/page pairs, response time, and timestamp. Recent events are available from `GET /api/audit`.

## Architecture

`Upload → Extract → Chunk → Store/index → Hybrid retrieve → Evidence reasoner → Answer/refuse → Citations + audit`

- Frontend: Next.js, React, TypeScript
- API: Node.js, Express, TypeScript
- Storage: SQLite plus local file storage
- Processing: in-process queue, optionally Redis-backed
- Retrieval: deterministic lexical + local vector similarity
- Testing: Vitest benchmark and regression suite

## Quality checks

```bash
npm test
npm run build
npm run evaluate
```

Current automated suite: 19 passing tests.

## Prototype scope

The current prototype processes text-based PDFs, CSV, and TXT files locally. OCR for scans/diagrams, live IoT gateways, CMMS/QMS connectors, authentication, and multi-plant access are production roadmap items—not claimed as implemented features.

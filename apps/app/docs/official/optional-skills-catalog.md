---
name: optional-skills-catalog
category: reference
description: Optional skills catalog — the 152 official skills maintained by Nous Research but not installed by default; name, path, description, and env vars for each.
---

<!-- Mirrors vendor/hermes-agent optional-skills at the pinned submodule
     version; the pointer implies the version. Source of truth:
     vendor/hermes-agent/optional-skills/ (DESCRIPTION.md explains the set). -->

# Optional skills catalog

Every skill below ships with hermes-agent under
`optional-skills/<category>/<name>` but is **not** copied into
`${HERMES_HOME:-~/.hermes}/skills/` during setup — it is opt-in. Installing
via `hermes skills install <identifier>` copies the skill into
`~/.hermes/skills/` and activates it; identifiers are
`official/<category>/<name>` (the same identifiers the skill index serves).
Env vars, when needed, are read from `${HERMES_HOME}/.env`. All listed
skills support Linux — Hermeum agents run in Linux containers.

## Autonomous AI agents

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| agent-merge-conflict-arbiter | `optional-skills/autonomous-ai-agents/agent-merge-conflict-arbiter` | Neutral arbiter for merge conflicts between two agents. | — |
| antigravity-cli | `optional-skills/autonomous-ai-agents/antigravity-cli` | Operate the Antigravity CLI (agy): plugins, auth, sandbox. | — |
| blackbox | `optional-skills/autonomous-ai-agents/blackbox` | Delegate coding tasks to the Blackbox AI multi-model CLI. | — |
| dynamic-workflow | `optional-skills/autonomous-ai-agents/dynamic-workflow` | Plan-in-code fan-outs, adversarial verification, waves. | — |
| grok | `optional-skills/autonomous-ai-agents/grok` | Delegate coding to xAI Grok Build CLI (features, PRs). | — |
| honcho | `optional-skills/autonomous-ai-agents/honcho` | Configure and troubleshoot Honcho memory for Hermes. | — |
| openhands | `optional-skills/autonomous-ai-agents/openhands` | Delegate coding to OpenHands CLI (model-agnostic, LiteLLM). | `OPENROUTER_API_KEY` (or model-provider creds) |

## Blockchain

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| evm | `optional-skills/blockchain/evm` | Read-only EVM client: wallets, tokens, gas across 8 chains. | — |
| hyperliquid | `optional-skills/blockchain/hyperliquid` | Hyperliquid market data, account history, trade review. | — |
| solana | `optional-skills/blockchain/solana` | Query Solana wallets, tokens, txs, and NFTs in USD. | — |

## Communication

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| one-three-one-rule | `optional-skills/communication/one-three-one-rule` | 1-3-1 decision briefs: problem, three options, one pick. | — |

## Creative

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| ai-presenter-video | `optional-skills/creative/ai-presenter-video` | Make a verified AI presenter video from script + image. | — |
| archify | `optional-skills/creative/archify` | Validated interactive HTML diagrams, upstream-maintained. | — |
| ascii-art | `optional-skills/creative/ascii-art` | ASCII art: pyfiglet, cowsay, boxes, image-to-ascii. | — |
| audiocraft-audio-generation | `optional-skills/creative/audiocraft-audio-generation` | AudioCraft: MusicGen text-to-music, AudioGen text-to-sound. | — |
| auteur | `optional-skills/creative/auteur` | Design and build cinematic, award-level web pages. | — |
| baoyu-article-illustrator | `optional-skills/creative/baoyu-article-illustrator` | Article illustrations: type × style × palette consistency. | — |
| baoyu-comic | `optional-skills/creative/baoyu-comic` | Knowledge comics: educational, biography, tutorial. | — |
| brag-slim | `optional-skills/creative/brag-slim` | Launch video from a project or URL, upstream-maintained. | — |
| brag | `optional-skills/creative/brag` | Project launch video via Hyperframes, upstream-maintained. | — |
| comfyui | `optional-skills/creative/comfyui` | Generate images, video, and audio via diffusion workflows. | `COMFY_CLOUD_API_KEY` |
| concept-diagrams | `optional-skills/creative/concept-diagrams` | Generate flat, minimal educational SVG visuals as HTML. | — |
| creative-ideation | `optional-skills/creative/creative-ideation` | Generate ideas via named methods from creative practice. | — |
| draw-your-font | `optional-skills/creative/draw-your-font` | Turn a handwriting photo into an installable TTF font. | — |
| dream-loop | `optional-skills/creative/dream-loop` | Build stunning 3D scenes via a concept-art fidelity loop. | — |
| excalidraw | `optional-skills/creative/excalidraw` | Hand-drawn Excalidraw JSON diagrams (arch, flow, seq). | — |
| heartmula | `optional-skills/creative/heartmula` | HeartMuLa: Suno-like song generation from lyrics + tags. | — |
| hyperframes | `optional-skills/creative/hyperframes` | Render MP4/WebM videos from HTML compositions. | — |
| impeccable | `optional-skills/creative/impeccable` | Frontend design guidance, upstream-maintained. | — |
| ip-as-logo | `optional-skills/creative/ip-as-logo` | Design minimal cute IP mascot marks readable at 32px. | — |
| kanban-video-orchestrator | `optional-skills/creative/kanban-video-orchestrator` | Plan and run multi-agent video production pipelines. | — |
| meme-generation | `optional-skills/creative/meme-generation` | Create meme PNGs from templates with Pillow text overlay. | — |
| mono-color | `optional-skills/creative/mono-color` | Generate one- or two-ink editorial print poster images. | — |
| pixel-art | `optional-skills/creative/pixel-art` | Pixel art w/ era palettes (NES, Game Boy, PICO-8). | — |
| pretext | `optional-skills/creative/pretext` | Build creative browser demos with DOM-free text layout. | — |
| simple-english | `optional-skills/creative/simple-english` | Rewrite text to ASD-STE100 Simplified Technical English. | — |
| sketch | `optional-skills/creative/sketch` | Throwaway HTML mockups: 2-3 design variants to compare. | — |
| social-media-content-calendar | `optional-skills/creative/social-media-content-calendar` | Plan multi-platform social campaigns: briefs to posting. | — |
| system-atlas | `optional-skills/creative/system-atlas` | Build explorable isometric architecture atlases as HTML. | — |
| tldraw-offline | `optional-skills/creative/tldraw-offline` | Drive and script tldraw offline canvases with an agent. | — |
| unreal-mcp | `optional-skills/creative/unreal-mcp` | Automate Unreal Engine editor scenes, actors, and renders. | — |

## Data science

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| jupyter-notebook | `optional-skills/data-science/jupyter-notebook` | Iterative Python via live Jupyter kernel (hamelnb). | — |

## Devops

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| actual-setup | `optional-skills/devops/actual-setup` | Set up Actual Computer (actual.inc) inference in Hermes. | `ACTUAL_API_KEY` |
| docker-management | `optional-skills/devops/docker-management` | Manage Docker containers, images, volumes, and Compose. | — |
| hermes-s6-container-supervision | `optional-skills/devops/hermes-s6-container-supervision` | Modify or debug s6 services in the Hermes Docker image. | — |
| inference-sh-cli | `optional-skills/devops/inference-sh-cli` | Run 150+ AI apps (image, video, LLM) via inference.sh CLI. | — |
| pinggy-tunnel | `optional-skills/devops/pinggy-tunnel` | Zero-install localhost tunnels over SSH via Pinggy. | `PINGGY_TOKEN` (optional) |
| setup-wizard-generator | `optional-skills/devops/setup-wizard-generator` | Generate a bash wizard guiding a human through manual setup. | — |
| watchers | `optional-skills/devops/watchers` | Poll RSS, JSON APIs, and GitHub with watermark dedup. | — |

## Dogfood

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| adversarial-ux-test | `optional-skills/dogfood/adversarial-ux-test` | Roleplay a hostile user to find and triage UX pain points. | — |

## Email

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| agentmail | `optional-skills/email/agentmail` | Use when an agent needs AgentMail CLI email inboxes. | — |

## Finance

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| 3-statement-model | `optional-skills/finance/3-statement-model` | Build integrated IS/BS/CF financial workbooks in Excel. | — |
| comps-analysis | `optional-skills/finance/comps-analysis` | Build comparable-company valuation workbooks in Excel. | — |
| dcf-model | `optional-skills/finance/dcf-model` | Build discounted cash flow valuation workbooks in Excel. | — |
| excel-author | `optional-skills/finance/excel-author` | Build auditable financial workbooks headless via openpyxl. | — |
| lbo-model | `optional-skills/finance/lbo-model` | Build leveraged buyout workbooks with IRR/MOIC in Excel. | — |
| merger-model | `optional-skills/finance/merger-model` | Build M&A accretion/dilution workbooks in Excel. | — |
| polymarket | `optional-skills/finance/polymarket` | Query Polymarket: markets, prices, orderbooks, history. | — |
| pptx-author | `optional-skills/finance/pptx-author` | Build PowerPoint decks headless with python-pptx. | — |
| stocks | `optional-skills/finance/stocks` | Stock quotes, history, search, compare, crypto via Yahoo. | — |

## Gaming

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| minecraft-modpack-server | `optional-skills/gaming/minecraft-modpack-server` | Host modded Minecraft servers (CurseForge, Modrinth). | — |
| pokemon-player | `optional-skills/gaming/pokemon-player` | Play Pokemon via headless emulator + RAM reads. | — |

## Health

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| fitness-nutrition | `optional-skills/health/fitness-nutrition` | Workout planning, macros, and body metrics via wger/USDA. | `USDA_API_KEY` (optional) |
| neuroskill-bci | `optional-skills/health/neuroskill-bci` | Use live BCI cognitive and mood state from NeuroSkill. | — |

## MCP

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| fastmcp | `optional-skills/mcp/fastmcp` | Build, test, and deploy Python MCP servers. | — |
| mcp-oauth-remote-gateway | `optional-skills/mcp/mcp-oauth-remote-gateway` | Manual OAuth for remote MCP servers on headless gateways. | — |
| mcporter | `optional-skills/mcp/mcporter` | List, auth, and call MCP servers/tools from the terminal. | — |

## Migration

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| openclaw-migration | `optional-skills/migration/openclaw-migration` | Import an OpenClaw setup (memories, skills) into Hermes. | — |

## MLOps

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| accelerate | `optional-skills/mlops/accelerate` | Run PyTorch training across GPUs with minimal changes. | — |
| chroma | `optional-skills/mlops/chroma` | Embedding database for RAG and semantic search. | — |
| clip | `optional-skills/mlops/clip` | Zero-shot image classification and image-text search. | — |
| evaluating-llms-harness | `optional-skills/mlops/evaluation/evaluating-llms-harness` | lm-eval-harness: benchmark LLMs (MMLU, GSM8K, etc.). | — |
| weights-and-biases | `optional-skills/mlops/evaluation/weights-and-biases` | W&B: log ML experiments, sweeps, model registry, dashboards. | — |
| faiss | `optional-skills/mlops/faiss` | Fast vector similarity search at billion scale. | — |
| flash-attention | `optional-skills/mlops/flash-attention` | Speed up long-sequence transformer training and inference. | — |
| guidance | `optional-skills/mlops/guidance` | Constrain LLM output with grammars; guarantee valid JSON. | — |
| huggingface-tokenizers | `optional-skills/mlops/huggingface-tokenizers` | Fast BPE/WordPiece tokenization and custom vocab training. | — |
| llama-cpp | `optional-skills/mlops/inference/llama-cpp` | llama.cpp local GGUF inference + HF Hub model discovery. | — |
| outlines | `optional-skills/mlops/inference/outlines` | Outlines: structured JSON/regex/Pydantic LLM generation. | — |
| serving-llms-vllm | `optional-skills/mlops/inference/serving-llms-vllm` | vLLM: high-throughput LLM serving, OpenAI API, quantization. | — |
| instructor | `optional-skills/mlops/instructor` | Structured LLM outputs validated with Pydantic. | — |
| lambda-labs | `optional-skills/mlops/lambda-labs` | On-demand GPU cloud instances for ML training. | `LAMBDA_API_KEY` |
| llava | `optional-skills/mlops/llava` | Vision-language chat: VQA, captioning, image dialogue. | — |
| modal | `optional-skills/mlops/modal` | Serverless GPU cloud for ML jobs and model APIs. | — |
| huggingface-hub | `optional-skills/mlops/models/huggingface-hub` | HuggingFace hf CLI: search/download/upload models, datasets. | — |
| segment-anything-model | `optional-skills/mlops/models/segment-anything-model` | SAM: zero-shot image segmentation via points, boxes, masks. | — |
| nemo-curator | `optional-skills/mlops/nemo-curator` | Curate LLM training data: dedupe, filter, PII redaction. | — |
| obliteratus | `optional-skills/mlops/obliteratus` | OBLITERATUS: abliterate LLM refusals (diff-in-means). | — |
| peft | `optional-skills/mlops/peft` | Fine-tune large LLMs with LoRA on limited GPU memory. | — |
| pinecone | `optional-skills/mlops/pinecone` | Managed vector DB for production RAG and search. | — |
| pytorch-fsdp | `optional-skills/mlops/pytorch-fsdp` | Fully sharded data-parallel training for large models. | — |
| pytorch-lightning | `optional-skills/mlops/pytorch-lightning` | Clean training loops with built-in distributed support. | — |
| qdrant | `optional-skills/mlops/qdrant` | Vector search engine for production RAG systems. | — |
| dspy | `optional-skills/mlops/research/dspy` | DSPy: declarative LM programs, auto-optimize prompts, RAG. | — |
| saelens | `optional-skills/mlops/saelens` | Train sparse autoencoders to interpret model features. | — |
| simpo | `optional-skills/mlops/simpo` | Reference-free preference alignment, simpler than DPO. | — |
| slime | `optional-skills/mlops/slime` | RL post-training for LLMs with Megatron and SGLang. | — |
| stable-diffusion | `optional-skills/mlops/stable-diffusion` | Text-to-image generation, inpainting, and img2img. | — |
| tensorrt-llm | `optional-skills/mlops/tensorrt-llm` | High-throughput LLM inference on NVIDIA GPUs. | — |
| torchtitan | `optional-skills/mlops/torchtitan` | Pretrain LLMs at scale with PyTorch 4D parallelism. | — |
| axolotl | `optional-skills/mlops/training/axolotl` | Axolotl: YAML LLM fine-tuning (LoRA, DPO, GRPO). | — |
| trl-fine-tuning | `optional-skills/mlops/training/trl-fine-tuning` | TRL: SFT, DPO, GRPO, RLOO reward modeling for LLM RLHF. | — |
| unsloth | `optional-skills/mlops/training/unsloth` | Unsloth: 2-5x faster LoRA/QLoRA fine-tuning, less VRAM. | — |
| whisper | `optional-skills/mlops/whisper` | Transcribe and translate speech in 99 languages. | — |

## Payments

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| mpp-agent | `optional-skills/payments/mpp-agent` | Pay HTTP 402 APIs via Machine Payments Protocol (MPP). | — |
| stripe-link-cli | `optional-skills/payments/stripe-link-cli` | Agent payments via Stripe Link — cards, SPT, approvals. | — |
| stripe-projects | `optional-skills/payments/stripe-projects` | Provision SaaS services + sync creds via Stripe Projects. | — |

## Productivity

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| canvas | `optional-skills/productivity/canvas` | Fetch Canvas LMS courses and assignments via API token. | `CANVAS_API_TOKEN`, `CANVAS_BASE_URL` |
| decision-questionnaire | `optional-skills/productivity/decision-questionnaire` | Turn an unanswerable decision into a questionnaire doc. | — |
| here-now | `optional-skills/productivity/here-now` | Publish sites to {slug}.here.now and store files in Drives. | `HERENOW_API_KEY`/`HERENOW_DRIVE_TOKEN` |
| live-dashboard | `optional-skills/productivity/live-dashboard` | Build self-updating dashboards from live sources. | — |
| memento-flashcards | `optional-skills/productivity/memento-flashcards` | Spaced-repetition flashcards: create, review, quiz, export. | — |
| property-listings | `optional-skills/productivity/property-listings` | Present property and rental listings as desktop cards. | — |
| shop | `optional-skills/productivity/shop` | Shop catalog search, checkout, order tracking, returns. | — |
| shopify | `optional-skills/productivity/shopify` | Query Shopify Admin/Storefront GraphQL APIs via curl. | `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_STORE_DOMAIN` (+ `SHOPIFY_STOREFRONT_TOKEN`) |
| siyuan | `optional-skills/productivity/siyuan` | Query and edit a SiYuan knowledge base via its API. | `SIYUAN_TOKEN` (+ `SIYUAN_URL`) |
| telephony | `optional-skills/productivity/telephony` | Provision Twilio numbers, SMS/MMS, and AI outbound calls. | — |

## Research

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| bioinformatics | `optional-skills/research/bioinformatics` | Gateway to 400+ genomics and computational biology skills. | — |
| blogwatcher | `optional-skills/research/blogwatcher` | Monitor blogs and RSS/Atom feeds via blogwatcher-cli tool. | — |
| darwinian-evolver | `optional-skills/research/darwinian-evolver` | Evolve prompts/regex/SQL/code with Imbue's evolution loop. | — |
| domain-intel | `optional-skills/research/domain-intel` | Passive recon of subdomains, SSL certs, WHOIS, and DNS. | — |
| drug-discovery | `optional-skills/research/drug-discovery` | Drug discovery: ChEMBL search, drug-likeness, interactions. | — |
| duckduckgo-search | `optional-skills/research/duckduckgo-search` | Free keyless web, news, and image search via ddgs. | — |
| gitnexus-explorer | `optional-skills/research/gitnexus-explorer` | Serve an interactive codebase knowledge graph web UI. | — |
| osint-investigation | `optional-skills/research/osint-investigation` | Follow the money via public records and sanctions data. | — |
| parallel-cli | `optional-skills/research/parallel-cli` | Agent-native web search, deep research, and enrichment. | — |
| pinecone-research | `optional-skills/research/pinecone-research` | Agent RAG and long-term memory with Pinecone. | — |
| qmd | `optional-skills/research/qmd` | Hybrid local search over notes, docs, and transcripts. | — |
| research-paper-writing | `optional-skills/research/research-paper-writing` | Write ML papers for NeurIPS/ICML/ICLR: design→submit. | — |
| rss-feeds | `optional-skills/research/rss-feeds` | Read RSS, Atom, JSON feeds; discover feeds behind a page. | — |
| scrapling | `optional-skills/research/scrapling` | Scrape sites with stealth browsing and Cloudflare bypass. | — |
| searxng-search | `optional-skills/research/searxng-search` | Free keyless meta-search aggregating 70+ engines. | `SEARXNG_URL` |

## Security

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| 1password | `optional-skills/security/1password` | Set up op CLI, sign in, and read or inject secrets. | — |
| godmode | `optional-skills/security/godmode` | Jailbreak LLMs: Parseltongue, GODMODE, ULTRAPLINIAN. | — |
| oss-forensics | `optional-skills/security/oss-forensics` | GitHub supply-chain forensics: recovery, IOCs, reporting. | — |
| sherlock | `optional-skills/security/sherlock` | Find accounts for a username across 400+ platforms. | — |
| unbroker | `optional-skills/security/unbroker` | Autonomously remove your info from data-broker sites. | — |
| web-pentest | `optional-skills/security/web-pentest` | Authorized web pentest: recon, proof-based exploits, report. | — |

## Smart home

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| openhue | `optional-skills/smart-home/openhue` | Control Philips Hue lights, scenes, rooms via OpenHue CLI. | — |

## Social media

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| reddit-reading | `optional-skills/social-media/reddit-reading` | Read Reddit: subreddits, search, threads, users. No browser. | — |

## Software development

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| ast-grep | `optional-skills/software-development/ast-grep` | AST-aware structural code search and rewrite via ast-grep. | — |
| code-wiki | `optional-skills/software-development/code-wiki` | Generate wiki docs + Mermaid diagrams for any codebase. | — |
| grill-me | `optional-skills/software-development/grill-me` | Adversarial plan interview before implementation. | — |
| pr-lens | `optional-skills/software-development/pr-lens` | Draw code changes as animated architecture/data-flow SVGs. | — |
| rest-graphql-debug | `optional-skills/software-development/rest-graphql-debug` | Debug REST/GraphQL APIs: status codes, auth, schemas, repro. | — |
| subagent-driven-development | `optional-skills/software-development/subagent-driven-development` | Execute plans via delegate_task subagents (2-stage review). | — |

## Web development

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| cloudflare-temporary-deploy | `optional-skills/web-development/cloudflare-temporary-deploy` | Deploy a Worker live, no account, via wrangler `--temporary`. | — |
| har-derived-api-client | `optional-skills/web-development/har-derived-api-client` | Record a site's XHR into a HAR, derive an HTTP client. | — |
| page-agent | `optional-skills/web-development/page-agent` | Embed an in-page natural-language GUI copilot in web apps. | — |
| publish-site | `optional-skills/web-development/publish-site` | Versioned site deploys to GitHub/Cloudflare/Netlify Pages. | — |
| scrollcraft | `optional-skills/web-development/scrollcraft` | Premium scroll-driven landing pages; scroll = timeline. | — |

## Yuanbao

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| yuanbao | `optional-skills/yuanbao/yuanbao` | Yuanbao groups: @mention users, query info/members. | — |

## Example

An agent with the optional `shopify` skill:

```yaml
name: Shopify helper
description: Answers product questions and tracks orders via Shopify.
skills:
  - official/productivity/shopify
env:
  - name: SHOPIFY_ACCESS_TOKEN
    value: "<fill-me>"
    sensitive: true
  - name: SHOPIFY_STORE_DOMAIN
    value: "<fill-me>"
```

Skills with no env vars need only the `skills` entry, e.g.
`skills: [official/research/duckduckgo-search]`.

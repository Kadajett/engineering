# Building AI Workers you can actually debug

[Getting started](../README.md) · [CLI reference](REFERENCE.md)

You should be able to answer “what failed?”, “why was that response slow?”, and “where did the tokens go?” without having to log everyone's conversation. Start with Cloudflare's own logging and tracing. Add another provider when it solves a problem you have—not because a starter picked one for you.

## What "engineering" brings in

The existing official **cloudflare**, **workers-best-practices**, and **wrangler** skills already cover native observability. The Cloudflare skill includes `references/observability`, `references/workers-ai`, and `references/ai-gateway`; these are reference folders, not three extra skills to install.

This release makes those references easier to find and adds a short, relevant checklist with official links to the project's managed `AGENTS.md` section. `CLAUDE.md` points to the same guidance. `.engineering/skills.json` records both installed skills and the separately labeled `guidance` entries.

| Project signal | What gets added |
| --- | --- |
| Workers profile or known Workers dependency | Native logging/tracing and production references, alongside the existing Cloudflare skills |
| `workers-ai` profile | Model usage, streaming, privacy, and optional Gateway references; no assumption that the app uses the Agents SDK |
| `agents` | Agents SDK and Durable Objects skills, plus current diagnostics, GenAI tracing, and durable-execution docs |
| `@cloudflare/ai-chat` | Cloudflare, Agents SDK, Durable Objects, and AI SDK skills, with matching reference guidance |
| `ai` | Official Vercel `ai-sdk` skill and version-aware telemetry/usage guidance, on Cloudflare or elsewhere |
| `workers-ai-provider` | Cloudflare and AI SDK skills, plus their observability references |
| `@sentry/cloudflare` | Optional Sentry Cloudflare docs and native Workers observability references; no automatic Sentry installation skill |

Selection uses direct dependencies, dev dependencies, optional dependencies, peers, and the selected/stored profile. It doesn't scan application code or parse Wrangler bindings. For an existing native `env.AI` app without an AI package or stored profile, use:

```bash
engineering skills . --profile workers-ai
```

Run `engineering skills .` again after dependency changes; `--dry-run` previews the skills and reference guidance. Existing local skills and pinned fallback revisions are preserved. Removing a matching dependency removes its generated reference section on refresh, unless another dependency or the retained profile still selects it. `--no-skills` skips this setup too; it isn't an uninstall command.

This installs guidance, not telemetry. It doesn't edit Wrangler, install monitoring SDKs or MCP servers, add a DSN, choose a gateway, enable payload capture, or send test events. Official docs are live links, not version-pinned downloads. Read the project's installed types and version-matched docs before copying an example.

## Start with native logs and traces

Read [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/), and [Workers Traces](https://developers.cloudflare.com/workers/observability/traces/).

- Inspect the actual Wrangler configuration and environment. Don't assume an older project has observability enabled. Traces need their own explicit enablement; top-level observability isn't proof that traces are collected.
- Use structured events with a stable operation name, severity, duration, outcome, and safe request/trace correlation. Keep the existing logger if it already does that well.
- Pick log and trace sampling separately. A sample rate of `1` in a quickstart isn't a production recommendation. Consider volume, retention, access, and export costs.
- Allowlist fields. Credentials, cookies, raw URLs/query strings, bodies, prompts, responses, and tool payloads don't belong in routine logs. Even an exception message can contain user data.
- Keep per-request, user, and session identifiers out of metric labels. Use safe correlation fields where appropriate without creating unbounded metric cardinality.
- `wrangler tail` helps with live debugging; it isn't retained history. Native request and binding spans also aren't proof that model-token tracing is configured.

OTLP export is a transport option, not a promise that an arbitrary Node OpenTelemetry package works in Workers. Follow the supported integration for the installed runtime. For cross-provider naming, consult the current [OpenTelemetry GenAI conventions](https://github.com/open-telemetry/semantic-conventions-genai/tree/main/docs/gen-ai), which moved out of the older general semantic-conventions page.

## Count tokens without breaking streaming

Record the provider/model, operation, latency, time to first token, outcome, retries, tool steps, and whatever usage the provider actually returns. Keep input/output totals and any supported cache/reasoning breakdowns distinguishable.

**Missing usage means unknown, not zero.** Models and transports have different response schemas. Read the actual [Workers AI model schema](https://developers.cloudflare.com/workers-ai/models/) or the installed provider's types. Don't derive billed tokens from character counts.

Choose where accounting happens: model attempt, step, or complete turn. Don't sum a turn aggregate and the steps it already contains, or add cached/reasoning subsets to totals that already include them. Include unsuccessful attempts where usage is available and distinguish complete, failed, and cancelled runs.

For streams, use the installed API's completion/error/abort paths. Final usage may arrive only at the end. Don't await it before returning a stream that nobody has consumed yet, buffer the entire answer, or drain a second copy just to collect telemetry. Preserve backpressure and cancellation. An interrupted stream may never provide a final count.

### The AI SDK version trap

The official `ai-sdk` skill is pinned to a reviewed revision of [vercel/ai](https://github.com/vercel/ai/tree/45f2b6a5bc06bdb40a847ea961f8d7ca7cd86563/skills/use-ai-sdk). Its best advice is to read the docs shipped in `node_modules/ai/docs` and the installed types.

- [AI SDK 6's version-tagged docs](https://github.com/vercel/ai/blob/ai%406.0.0/content/docs/03-ai-sdk-core/05-generating-text.mdx) describe `totalUsage` across all steps, `usage` for the final step, and `onFinish`.
- [Newer generation docs](https://ai-sdk.dev/docs/ai-sdk-core/generating-text) describe aggregate `usage` and `onEnd`.
- [Telemetry configuration](https://ai-sdk.dev/docs/ai-sdk-core/telemetry) changes across versions too. Explicitly disable input/output recording when enabling metadata-only observability, and allowlist any included context.

Don't mix those APIs or upgrade a project's major version just to make an example work. The skill's Vercel Gateway examples don't require switching away from Workers AI or another existing provider. DevTools can capture full requests, responses, and tool payloads; enabling it is a separate privacy decision.

## Agents need more than HTTP traces

Read the current [diagnostics channels](https://developers.cloudflare.com/agents/runtime/operations/observability/diagnostics-channels/) and [GenAI tracing](https://developers.cloudflare.com/agents/runtime/operations/observability/tracing/) docs alongside the installed Agents SDK.

Diagnostics explain RPC calls, state changes, chat recovery, and other operations. They aren't automatically a token/cost tracing backend. The typed subscription helper uses keys such as `rpc`; raw `diagnostics_channel` uses `agents:rpc`. Older skill examples may show different keys.

GenAI tracing depends on the harness. Don't assume every `Agent` or `AIChatAgent` subclass is instrumented. Current docs distinguish automatic Think/Flue instrumentation, direct AI SDK `wrapAISDK` integration, and custom harness spans. Their message/tool storage defaults differ. Inspect your actual integration rather than assuming all payload capture is off. Use stable logical agent names and avoid duplicate model spans when combining instrumentation layers.

For production, [long-running agents](https://developers.cloudflare.com/agents/concepts/agentic-patterns/long-running-agents/) explains the important distinction: durable identity isn't an always-running process. Persist recoverable state; use idempotency, checkpoints, and Workflows where needed. Timers and `waitUntil` aren't durable queues.

Bound tool loops, timeouts, retries, concurrency, and token/spend budgets. Validate tool inputs and enforce tenant access and permissions independently of model output. Require approval for sensitive actions. Treat retrieved text and tool responses as untrusted inputs. Exercise cancellation, overload, model failures, duplicate side effects, eviction/restart recovery, and prompt-injection boundaries before relying on the agent.

## AI Gateway is optional

Gateway can give you [analytics](https://developers.cloudflare.com/ai-gateway/observability/analytics/) for requests, latency, tokens, errors, cache behavior, and estimated costs. It isn't required for native Workers logging or tracing.

Read its [logging controls](https://developers.cloudflare.com/ai-gateway/observability/logging/) before routing traffic through it. Logs normally include prompt and response bodies:

- `cf-aig-collect-log-payload: false` suppresses bodies while retaining metadata logs.
- `cf-aig-collect-log: false` suppresses the whole log, including metadata.

Check the equivalent options for your actual binding/provider transport. Gateway logging settings don't control a downstream model provider's retention policy. Read [Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/) and the policy for any other provider you use.

[Gateway cost figures](https://developers.cloudflare.com/ai-gateway/observability/costs/) are estimates and depend on returned model identity, token data, and pricing coverage. Sampled traces, incomplete streams, and unsupported models leave gaps. Reconcile financial reporting against the provider's billing and current [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), rather than presenting a trace dashboard as a complete ledger.

## If the project already uses Sentry

The automatic reference selection requires an actual `@sentry/cloudflare` dependency. AI code alone doesn't select Sentry.

The [Workers AI guide](https://docs.sentry.io/platforms/javascript/guides/cloudflare/agent-tracing/workers-ai.md) documents automatic `env.AI.run` spans from **10.67.0**, provided the handler receives the instrumented `env` from `withSentry`. The [Agents SDK guide](https://docs.sentry.io/platforms/javascript/guides/cloudflare/agent-tracing/agents-sdk.md) documents `instrumentAgentWithSentry` from **10.69.0**. Check the installed version; an HTTP span alone doesn't prove either integration works.

Prompt and response content is off without `dataCollection`. **Even `dataCollection: {}` changes privacy defaults.** Read all [collection options](https://docs.sentry.io/platforms/javascript/guides/cloudflare/configuration/options.md#dataCollection) and [collected-data details](https://docs.sentry.io/platforms/javascript/guides/cloudflare/data-management/data-collected.md), not only the GenAI switch. Query strings, headers, identity, cookies, and bodies need their own review.

Streaming spans end when consumed or cancelled; `returnRawResponse` and `websocket` don't record response body fields. Use safe conversation IDs that reflect a chat session, not a shared user/agent identity that merges unrelated conversations. Review duplicate spans across native, AI SDK, and Sentry layers.

Check the [current logging guide](https://docs.sentry.io/platforms/javascript/guides/cloudflare/logs.md) too: logs default on starting in **10.71.0**, and console breadcrumbs aren't the same thing as forwarding console calls to Logs. Preserve the app's existing logger and sampling choices unless changing them is part of the task.

Why docs instead of another auto-installed skill? The [old Sentry skills repository is archived](https://github.com/getsentry/sentry-agent-skills), and its successor [sentry-for-ai](https://github.com/getsentry/sentry-for-ai) distinguishes frozen legacy SDK skills from a broader installation/instrumentation workflow. That workflow is useful when you explicitly want to set up Sentry; it isn't a neutral default for every AI Worker. The scoped docs are a better fit here.

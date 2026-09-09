const cloudflare = "https://developers.cloudflare.com";
const sentry = "https://docs.sentry.io/platforms/javascript/guides/cloudflare";
const references = {
	workers: {
		id: "workers-observability",
		title: "Workers logging and tracing",
		notes: [
			"Start with native Workers Logs and Traces; no monitoring vendor is required. Review the actual Wrangler environment, enable traces explicitly, and choose separate log/trace sampling and retention for the workload rather than copying 100% sampling into production.",
			"Use structured events with severity, operation, safe request/trace correlation, duration, and outcome. Allowlist fields; exclude credentials, cookies, raw URLs/query strings, request bodies, and user content. Keep high-cardinality identifiers out of metric labels. Live tail output is not retained history.",
			"Read the selected cloudflare skill's references/observability and workers-best-practices before changing runtime configuration. Native request/binding traces do not guarantee model-token spans. OTLP export does not mean every Node OpenTelemetry SDK works inside Workers.",
		],
		links: [
			["Workers best practices", `${cloudflare}/workers/best-practices/workers-best-practices/`],
			["Workers Logs", `${cloudflare}/workers/observability/logs/workers-logs/`],
			["Workers Traces", `${cloudflare}/workers/observability/traces/`],
		],
	},
	ai: {
		id: "ai-usage-and-safety",
		title: "AI usage, streaming, and safe production behavior",
		notes: [
			"Track model/provider, operation, latency/time to first token, outcome, retries, tool steps, and available input/output/cache/reasoning usage. Missing usage is unknown, not zero; distinguish complete, failed, and cancelled runs. Never estimate billed tokens from text length or treat sampled traces as a billing ledger.",
			"Choose one accounting level for attempts, steps, and turns; do not add step usage to a total that already includes it, or add reasoning/cache subsets twice. Label cost estimates with model/pricing assumptions and reconcile against provider billing.",
			"Preserve backpressure and cancellation. Collect final usage through the installed API's completion path without waiting for it before returning the stream, buffering the response, or draining a second copy just for telemetry. Interrupted streams may never report final usage.",
			"Keep prompt, response, tool-argument/result, and identity capture off unless explicitly approved. Review redaction, sampling, retention, and access before enabling exports or DevTools. Keep the existing model/provider routing; a skill's gateway recommendation is not a requirement to switch providers or upgrade SDK majors.",
			"Bound tool loops, retries, timeouts, concurrency, and token/spend budgets. Validate tool inputs, authorize sensitive actions independently of model output, require approval where appropriate, and make retried side effects idempotent. Treat retrieved content and tool output as untrusted. Test failures, cancellation, recovery, and prompt-injection boundaries.",
		],
		links: [
			[
				"OpenTelemetry GenAI conventions",
				"https://github.com/open-telemetry/semantic-conventions-genai/tree/main/docs/gen-ai",
			],
		],
	},
	workersAI: {
		id: "workers-ai-production",
		title: "Workers AI and optional AI Gateway",
		notes: [
			"Check the actual model schema and installed provider: native env.AI responses and streams do not share one universal usage format. Read the cloudflare skill's references/workers-ai and references/ai-gateway when applicable. A Workers AI binding alone does not imply the Agents SDK.",
			"AI Gateway is optional. Its logs normally include prompt/response bodies; cf-aig-collect-log-payload:false suppresses bodies while keeping metadata, whereas cf-aig-collect-log:false disables the whole log. Verify the chosen transport's options and provider retention separately. Gateway token/cost coverage depends on returned model/usage data; costs are estimates.",
		],
		links: [
			["Workers AI models and response schemas", `${cloudflare}/workers-ai/models/`],
			["Workers AI data usage", `${cloudflare}/workers-ai/platform/data-usage/`],
			["Workers AI pricing", `${cloudflare}/workers-ai/platform/pricing/`],
			["AI Gateway analytics", `${cloudflare}/ai-gateway/observability/analytics/`],
			["AI Gateway logging controls", `${cloudflare}/ai-gateway/observability/logging/`],
			["AI Gateway cost estimates", `${cloudflare}/ai-gateway/observability/costs/`],
		],
	},
	agents: {
		id: "agents-production",
		title: "Agents diagnostics, GenAI tracing, and durable execution",
		notes: [
			"Read current Agents observability docs alongside the installed SDK types: diagnostics events are not the same as model/token traces. The typed agents/observability subscription uses keys such as rpc; raw diagnostics_channel uses agents:rpc. Older skill examples may differ.",
			"Do not assume every Agent or AIChatAgent subclass has automatic GenAI tracing. Check the installed harness; direct AI SDK calls can use the supported wrapAISDK integration. Review message/tool storage defaults for that harness, use stable logical agent names, and avoid duplicate model spans across instrumentation layers.",
			"Durable identity is not an always-running process. Persist recoverable state, use idempotency/checkpoints or Workflows for durable jobs, and test eviction/restart behavior. Timers and waitUntil are not a durable job queue. Keep tenant authorization and tool permissions outside model control.",
		],
		links: [
			[
				"Agents diagnostics channels",
				`${cloudflare}/agents/runtime/operations/observability/diagnostics-channels/`,
			],
			["Agents GenAI tracing", `${cloudflare}/agents/runtime/operations/observability/tracing/`],
			[
				"Long-running agents",
				`${cloudflare}/agents/concepts/agentic-patterns/long-running-agents/`,
			],
		],
	},
	aiSDK: {
		id: "ai-sdk-observability",
		title: "Version-matched AI SDK telemetry",
		notes: [
			"Read node_modules/ai/docs and installed types first. AI SDK 6 uses totalUsage for all steps and usage for the final step, with onFinish; newer docs describe usage as the aggregate and onEnd. Do not mix major-version examples or automatically upgrade to make an example compile.",
			"Telemetry registration and options also vary by version. When enabling it, explicitly disable input/output recording and allowlist metadata/context. Handle stream errors and aborts as well as completion. DevTools may capture full requests, responses, and tool payloads; do not enable it as harmless metadata-only logging.",
		],
		links: [
			["AI SDK telemetry", "https://ai-sdk.dev/docs/ai-sdk-core/telemetry"],
			["AI SDK generation and streaming", "https://ai-sdk.dev/docs/ai-sdk-core/generating-text"],
			[
				"AI SDK 6 usage contract",
				"https://github.com/vercel/ai/blob/ai%406.0.0/content/docs/03-ai-sdk-core/05-generating-text.mdx",
			],
		],
	},
	sentry: {
		id: "sentry-cloudflare",
		title: "Sentry for the installed Cloudflare SDK (optional provider)",
		notes: [
			"Check the installed @sentry/cloudflare version. Automatic env.AI.run spans require 10.67.0+ and the instrumented env from withSentry; Agents SDK instrumentAgentWithSentry requires 10.69.0+. A plain Worker request span does not prove AI or agent instrumentation is active.",
			"Workers AI prompt/response capture is off without dataCollection. Even dataCollection:{} changes several privacy defaults; review all collection controls rather than copying it. Review logs, headers/query strings, identities, cookies, and body capture too. Sampling is a workload decision, not automatically tracesSampleRate:1.",
			"Streaming spans end after consumption/cancellation; returnRawResponse and websocket do not record response body fields. Use safe conversation correlation and avoid counting the same call twice across native, AI SDK, and Sentry instrumentation. Consult current logging defaults before enabling or duplicating console capture.",
		],
		links: [
			["Sentry Workers AI tracing", `${sentry}/agent-tracing/workers-ai.md`],
			["Sentry Agents SDK tracing", `${sentry}/agent-tracing/agents-sdk.md`],
			["Sentry data collection options", `${sentry}/configuration/options.md#dataCollection`],
			["Sentry collected data", `${sentry}/data-management/data-collected.md`],
			["Sentry structured logs", `${sentry}/logs.md`],
		],
	},
};

export function selectGuidance(packages, profile, skills) {
	const names = new Set(skills.map((skill) => skill.name));
	const hasSentry = packages.includes("@sentry/cloudflare");
	const workers = names.has("cloudflare") || hasSentry;
	const ai = profile === "workers-ai" || names.has("agents-sdk") || names.has("ai-sdk");
	const selected = [];
	if (workers) selected.push(references.workers);
	if (ai) {
		selected.push(references.ai);
		if (workers) selected.push(references.workersAI);
	}
	if (names.has("agents-sdk")) selected.push(references.agents);
	if (names.has("ai-sdk")) selected.push(references.aiSDK);
	if (hasSentry) selected.push(references.sentry);
	return selected;
}

export function guidanceInstructions(guidance) {
	if (!guidance.length) return "";
	const sections = guidance.map(({ title, notes, links }) => {
		const advice = notes.map((note) => `- ${note}`).join("\n");
		const sources = links.map(([label, url]) => `[${label}](${url})`).join(" · ");
		return `### ${title}\n\n${advice}\n\nRead: ${sources}`;
	});
	return `\n## Observability and AI production guidance\n\nThese are project recommendations and official reference docs, not additional installed skills. Read the relevant sources before implementation; live docs may describe a newer SDK than this project. Guidance setup does not install telemetry SDKs, change Wrangler settings, enable exports/content capture, or choose a provider.\n\n${sections.join("\n\n")}\n`;
}

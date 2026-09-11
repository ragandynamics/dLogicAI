import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type StateType = "greeting" | "question" | "qualification" | "recommendation" | "confirmation" | "handoff" | "completed" | "abandoned";
type FlowState = { key: string; type: StateType; goal?: string; prompt: string; required_slots: string[]; knowledge_base_ids: string[]; max_retries: number };
type FlowTransition = Record<string, unknown> & { from: string; to: string; conditions: Record<string, unknown>[]; priority: number };
type FlowOutcome = { key: string; label: string; actions: Record<string, unknown>[] };
type FlowData = { name: string; entry_state_key: string; states: FlowState[]; transitions: FlowTransition[]; outcomes: FlowOutcome[] };
type FlowNode = Node<{ label: string; state: FlowState }>;
type FlowEdge = Edge<FlowTransition>;

type Props = { apiBaseUrl: string; projectId: string; serviceId: string; blankDraft?: boolean };

const stateTypes: StateType[] = ["greeting", "question", "qualification", "recommendation", "confirmation", "handoff", "completed", "abandoned"];
const templates: Record<string, FlowData> = {
  support: {
    name: "Customer support",
    entry_state_key: "greeting",
    states: [
      { key: "greeting", type: "greeting", goal: "Welcome the customer", prompt: "Welcome the customer and ask how you can help.", required_slots: [], knowledge_base_ids: [], max_retries: 2 },
      { key: "resolve", type: "question", goal: "Understand and resolve the issue", prompt: "Ask one question at a time and provide the most relevant support guidance.", required_slots: ["issue"], knowledge_base_ids: [], max_retries: 2 },
      { key: "handoff", type: "handoff", goal: "Escalate when needed", prompt: "Explain that a human specialist will follow up.", required_slots: [], knowledge_base_ids: [], max_retries: 1 },
    ],
    transitions: [{ from: "greeting", to: "resolve", conditions: [], priority: 0 }, { from: "resolve", to: "handoff", conditions: [{ field: "sentiment", operator: "equals", value: "negative" }], priority: 10 }],
    outcomes: [{ key: "support_resolved", label: "Support issue resolved", actions: [{ type: "record_event", event: "support_resolved" }] }, { key: "human_handoff", label: "Human handoff", actions: [{ type: "handoff" }] }],
  },
  sales: {
    name: "Lead qualification",
    entry_state_key: "greeting",
    states: [
      { key: "greeting", type: "greeting", goal: "Start the sales conversation", prompt: "Welcome the customer and ask what they are looking for.", required_slots: [], knowledge_base_ids: [], max_retries: 2 },
      { key: "qualify", type: "qualification", goal: "Understand the opportunity", prompt: "Ask about the customer's needs, budget, and timeframe.", required_slots: ["need", "budget", "timeframe"], knowledge_base_ids: [], max_retries: 2 },
      { key: "recommend", type: "recommendation", goal: "Recommend the next step", prompt: "Use approved product knowledge to recommend the best next step.", required_slots: [], knowledge_base_ids: [], max_retries: 2 },
      { key: "billing_handoff", type: "handoff", goal: "Route account and billing questions safely", prompt: "Explain that account, invoice, payment, subscription, and refund questions will be handled by billing support. Do not request full card numbers, passwords, or other payment secrets.", required_slots: [], knowledge_base_ids: [], max_retries: 1 },
    ],
    transitions: [{ from: "greeting", to: "billing_handoff", conditions: [{ field: "intent", operator: "equals", value: "billing" }], priority: 100 }, { from: "greeting", to: "qualify", conditions: [], priority: 0 }, { from: "qualify", to: "billing_handoff", conditions: [{ field: "intent", operator: "equals", value: "billing" }], priority: 100 }, { from: "qualify", to: "recommend", conditions: [{ field: "slots.need", operator: "exists" }], priority: 0 }],
    outcomes: [{ key: "qualified_lead", label: "Qualified lead", actions: [{ type: "record_event", event: "qualified_lead" }] }, { key: "billing_handoff", label: "Billing support handoff", actions: [{ type: "handoff" }] }],
  },
  booking: {
    name: "Appointment booking",
    entry_state_key: "intent",
    states: [
      { key: "intent", type: "greeting", goal: "Understand the booking request", prompt: "Welcome the customer and ask which service they would like to book.", required_slots: ["service"], knowledge_base_ids: [], max_retries: 2 },
      { key: "schedule", type: "qualification", goal: "Collect a preferred time", prompt: "Ask for the customer's preferred date and time, then confirm the timezone.", required_slots: ["date", "time", "timezone"], knowledge_base_ids: [], max_retries: 2 },
      { key: "confirm", type: "confirmation", goal: "Confirm the appointment details", prompt: "Repeat the service, date, time, and contact details and ask the customer to confirm.", required_slots: ["email"], knowledge_base_ids: [], max_retries: 2 },
      { key: "booked", type: "completed", goal: "Complete the booking request", prompt: "Confirm that the appointment request has been recorded and explain what happens next.", required_slots: [], knowledge_base_ids: [], max_retries: 1 },
    ],
    transitions: [{ from: "intent", to: "schedule", conditions: [{ field: "slots.service", operator: "exists" }], priority: 0 }, { from: "schedule", to: "confirm", conditions: [{ field: "slots.date", operator: "exists" }, { field: "slots.time", operator: "exists" }], priority: 0 }, { from: "confirm", to: "booked", conditions: [{ field: "sentiment", operator: "equals", value: "positive" }], priority: 0 }],
    outcomes: [{ key: "appointment_requested", label: "Appointment requested", actions: [{ type: "record_event", event: "appointment_requested" }] }],
  },
  payments: {
    name: "Payment and billing support",
    entry_state_key: "identify",
    states: [
      { key: "identify", type: "greeting", goal: "Identify the billing need", prompt: "Ask whether the customer needs help with a payment, invoice, refund, or subscription.", required_slots: ["billing_issue"], knowledge_base_ids: [], max_retries: 2 },
      { key: "verify", type: "qualification", goal: "Collect safe billing context", prompt: "Collect the invoice or order reference without asking for full card details or passwords.", required_slots: ["order_reference"], knowledge_base_ids: [], max_retries: 2 },
      { key: "resolve", type: "recommendation", goal: "Provide the approved billing resolution", prompt: "Use approved billing policy to explain the next action and any required timeline.", required_slots: [], knowledge_base_ids: [], max_retries: 2 },
      { key: "handoff", type: "handoff", goal: "Escalate sensitive billing cases", prompt: "Explain that a billing specialist will review the case securely.", required_slots: [], knowledge_base_ids: [], max_retries: 1 },
    ],
    transitions: [{ from: "identify", to: "verify", conditions: [{ field: "slots.billing_issue", operator: "exists" }], priority: 0 }, { from: "verify", to: "resolve", conditions: [{ field: "slots.order_reference", operator: "exists" }], priority: 0 }, { from: "identify", to: "handoff", conditions: [{ field: "intent", operator: "equals", value: "support_escalation" }], priority: 10 }],
    outcomes: [{ key: "billing_resolved", label: "Billing issue resolved", actions: [{ type: "record_event", event: "billing_resolved" }] }, { key: "billing_handoff", label: "Billing specialist handoff", actions: [{ type: "handoff" }] }],
  },
  returns: {
    name: "Returns and refunds",
    entry_state_key: "request",
    states: [
      { key: "request", type: "greeting", goal: "Understand the return request", prompt: "Ask what the customer would like to return and why.", required_slots: ["order_reference", "return_reason"], knowledge_base_ids: [], max_retries: 2 },
      { key: "eligibility", type: "qualification", goal: "Check return eligibility", prompt: "Use the return policy to explain eligibility, timing, and required product condition.", required_slots: [], knowledge_base_ids: [], max_retries: 2 },
      { key: "confirm", type: "confirmation", goal: "Confirm the requested resolution", prompt: "Confirm whether the customer wants a return, exchange, or refund.", required_slots: ["resolution"], knowledge_base_ids: [], max_retries: 2 },
      { key: "complete", type: "completed", goal: "Complete the return request", prompt: "Summarize the return steps and provide the approved next action.", required_slots: [], knowledge_base_ids: [], max_retries: 1 },
    ],
    transitions: [{ from: "request", to: "eligibility", conditions: [{ field: "slots.order_reference", operator: "exists" }, { field: "slots.return_reason", operator: "exists" }], priority: 0 }, { from: "eligibility", to: "confirm", conditions: [], priority: 0 }, { from: "confirm", to: "complete", conditions: [{ field: "slots.resolution", operator: "exists" }], priority: 0 }],
    outcomes: [{ key: "return_requested", label: "Return or refund requested", actions: [{ type: "record_event", event: "return_requested" }] }],
  },
  faq: {
    name: "Knowledge-base FAQ",
    entry_state_key: "ask",
    states: [
      { key: "ask", type: "question", goal: "Answer the customer's question", prompt: "Answer using the attached knowledge base. If the answer is not documented, say so clearly.", required_slots: ["question"], knowledge_base_ids: [], max_retries: 2 },
      { key: "followup", type: "confirmation", goal: "Check whether more help is needed", prompt: "Ask whether the customer needs anything else or would like a human specialist.", required_slots: [], knowledge_base_ids: [], max_retries: 1 },
      { key: "handoff", type: "handoff", goal: "Escalate unanswered questions", prompt: "Offer a human handoff because the requested information was not found.", required_slots: [], knowledge_base_ids: [], max_retries: 1 },
    ],
    transitions: [{ from: "ask", to: "followup", conditions: [], priority: 0 }, { from: "ask", to: "handoff", conditions: [{ field: "intent", operator: "equals", value: "support_escalation" }], priority: 10 }],
    outcomes: [{ key: "question_answered", label: "Question answered", actions: [{ type: "record_event", event: "question_answered" }] }, { key: "faq_handoff", label: "FAQ human handoff", actions: [{ type: "handoff" }] }],
  },
  lead_capture: {
    name: "Lead capture",
    entry_state_key: "discover",
    states: [
      { key: "discover", type: "greeting", goal: "Discover the customer's interest", prompt: "Ask what the customer is trying to achieve and which offering interests them.", required_slots: ["interest"], knowledge_base_ids: [], max_retries: 2 },
      { key: "contact", type: "qualification", goal: "Collect follow-up details", prompt: "Ask for the customer's name, work email, and preferred follow-up method.", required_slots: ["name", "email"], knowledge_base_ids: [], max_retries: 2 },
      { key: "next_step", type: "recommendation", goal: "Offer a relevant next step", prompt: "Recommend a relevant demo, consultation, or resource based on the customer's interest.", required_slots: [], knowledge_base_ids: [], max_retries: 2 },
    ],
    transitions: [{ from: "discover", to: "contact", conditions: [{ field: "slots.interest", operator: "exists" }], priority: 0 }, { from: "contact", to: "next_step", conditions: [{ field: "slots.email", operator: "exists" }], priority: 0 }],
    outcomes: [{ key: "lead_captured", label: "Lead captured", actions: [{ type: "record_event", event: "lead_captured" }] }],
  },
  sop_engine: {
    name: "SOP Engine",
    entry_state_key: "identify_procedure",
    states: [
      { key: "identify_procedure", type: "greeting", goal: "Identify the applicable standard operating procedure", prompt: "Ask what task, issue, or procedure the user needs help with. Confirm the operating context before giving instructions.", required_slots: ["procedure"], knowledge_base_ids: [], max_retries: 2 },
      { key: "collect_context", type: "qualification", goal: "Collect the facts required to safely follow the procedure", prompt: "Ask for the required site, asset, role, conditions, or reference details. Do not proceed when a safety-critical fact is missing.", required_slots: ["context"], knowledge_base_ids: [], max_retries: 2 },
      { key: "guide_steps", type: "question", goal: "Guide the user through the approved procedure", prompt: "Provide one approved SOP step at a time. Ask the user to confirm the step before continuing.", required_slots: ["step_confirmation"], knowledge_base_ids: [], max_retries: 2 },
      { key: "verify_completion", type: "confirmation", goal: "Verify that the procedure achieved its intended result", prompt: "Ask whether the procedure completed successfully and capture any remaining issue or exception.", required_slots: ["completion_status"], knowledge_base_ids: [], max_retries: 2 },
      { key: "sop_handoff", type: "handoff", goal: "Escalate unsafe, blocked, or exceptional procedures", prompt: "Stop the procedure and route the case to a qualified human specialist. Include the confirmed context and steps already completed.", required_slots: [], knowledge_base_ids: [], max_retries: 1 },
      { key: "sop_completed", type: "completed", goal: "Record successful SOP completion", prompt: "Confirm completion, summarize the result, and state any follow-up checks or maintenance required.", required_slots: [], knowledge_base_ids: [], max_retries: 1 },
    ],
    transitions: [
      { from: "identify_procedure", to: "collect_context", conditions: [{ field: "slots.procedure", operator: "exists" }], priority: 0 },
      { from: "collect_context", to: "guide_steps", conditions: [{ field: "slots.context", operator: "exists" }], priority: 0 },
      { from: "guide_steps", to: "verify_completion", conditions: [{ field: "slots.step_confirmation", operator: "exists" }], priority: 0 },
      { from: "verify_completion", to: "sop_completed", conditions: [{ field: "slots.completion_status", operator: "equals", value: "complete" }], priority: 10 },
      { from: "verify_completion", to: "sop_handoff", conditions: [{ field: "slots.completion_status", operator: "equals", value: "blocked" }], priority: 10 },
    ],
    outcomes: [{ key: "sop_completed", label: "SOP completed", actions: [{ type: "record_event", event: "sop_completed" }] }, { key: "sop_handoff", label: "SOP specialist handoff", actions: [{ type: "handoff" }] }],
  },
  knowledgebase_engine: {
    name: "Knowledgebase Engine",
    entry_state_key: "understand_question",
    states: [
      { key: "understand_question", type: "greeting", goal: "Understand the information request", prompt: "Ask the user to state the question clearly and identify the relevant product, policy, or topic.", required_slots: ["question"], knowledge_base_ids: [], max_retries: 2 },
      { key: "retrieve_evidence", type: "question", goal: "Find authoritative supporting knowledge", prompt: "Search the attached knowledge bases and use only relevant, current source material. Do not invent an answer when evidence is missing.", required_slots: [], knowledge_base_ids: [], max_retries: 2 },
      { key: "answer_with_sources", type: "recommendation", goal: "Answer with grounded guidance", prompt: "Give a concise answer grounded in the retrieved knowledge. Identify the source or document when possible and distinguish facts from recommendations.", required_slots: [], knowledge_base_ids: [], max_retries: 2 },
      { key: "clarify_or_handoff", type: "handoff", goal: "Handle missing or ambiguous knowledge safely", prompt: "Explain that the knowledge base does not contain a reliable answer. Ask one clarifying question or offer a human specialist; never guess.", required_slots: [], knowledge_base_ids: [], max_retries: 1 },
      { key: "knowledge_resolved", type: "completed", goal: "Record a grounded answer", prompt: "Confirm that the answer addressed the question and offer the next relevant documented resource.", required_slots: [], knowledge_base_ids: [], max_retries: 1 },
    ],
    transitions: [
      { from: "understand_question", to: "retrieve_evidence", conditions: [], priority: 0 },
      { from: "retrieve_evidence", to: "answer_with_sources", conditions: [], priority: 0 },
      { from: "answer_with_sources", to: "knowledge_resolved", conditions: [], priority: 0 },
      { from: "retrieve_evidence", to: "clarify_or_handoff", conditions: [{ field: "intent", operator: "equals", value: "support_escalation" }], priority: 100 },
    ],
    outcomes: [{ key: "knowledge_resolved", label: "Grounded answer provided", actions: [{ type: "record_event", event: "knowledge_resolved" }] }, { key: "knowledge_handoff", label: "Knowledge specialist handoff", actions: [{ type: "handoff" }] }],
  },
};

const templateDescriptions: Record<string, string> = {
  support: "Resolve issues and hand off when a person is needed.",
  sales: "Qualify interest and guide customers to a recommendation.",
  booking: "Collect service, schedule, contact, and confirmation details.",
  payments: "Handle billing questions with safe escalation paths.",
  returns: "Guide returns, exchanges, and refund requests.",
  faq: "Answer documented questions using attached knowledge.",
  lead_capture: "Capture qualified contact details for follow-up.",
  sop_engine: "Guide users through approved procedures with checkpoints and safe escalation.",
  knowledgebase_engine: "Answer questions from approved knowledge with grounded fallback behavior.",
};

const stateVisuals: Record<StateType, { icon: string; accent: string; tint: string }> = {
  greeting: { icon: "✦", accent: "#34d399", tint: "#ecfdf5" },
  question: { icon: "?", accent: "#60a5fa", tint: "#eff6ff" },
  qualification: { icon: "◌", accent: "#fbbf24", tint: "#fffbeb" },
  recommendation: { icon: "↗", accent: "#22d3ee", tint: "#ecfeff" },
  confirmation: { icon: "✓", accent: "#a78bfa", tint: "#f5f3ff" },
  handoff: { icon: "!", accent: "#fb7185", tint: "#fff1f2" },
  completed: { icon: "✓", accent: "#10b981", tint: "#ecfdf5" },
  abandoned: { icon: "×", accent: "#94a3b8", tint: "#f1f5f9" },
};

function FlowStateNode({ data }: { data: { label: string; state: FlowState } }) {
  const visual = stateVisuals[data.state.type];
  return <div className="min-w-[190px] overflow-hidden rounded-lg border border-slate-600 bg-slate-900 shadow-xl">
    <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-2 !border-slate-900" style={{ background: visual.accent }} />
    <div className="border-l-4 px-3 py-2.5" style={{ borderColor: visual.accent }}>
      <div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold text-slate-950" style={{ background: visual.tint, color: visual.accent }}>{visual.icon}</span><p className="truncate text-sm font-bold text-white">{data.label}</p></div>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{data.state.type}</p>
      {data.state.goal && <p className="mt-1 max-w-[170px] truncate text-xs text-slate-300">{data.state.goal}</p>}
    </div>
    <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-2 !border-slate-900" style={{ background: visual.accent }} />
  </div>;
}

const nodeTypes = { flowState: FlowStateNode };

function stateNode(state: FlowState, index: number): FlowNode {
  return { id: state.key, position: { x: (index % 3) * 260 + 30, y: Math.floor(index / 3) * 150 + 30 }, data: { label: state.key, state }, type: "flowState" };
}

function toGraph(flow: FlowData) {
  return {
    nodes: flow.states.map(stateNode),
    edges: flow.transitions.map((transition, index) => ({ id: `edge-${index}-${transition.from}-${transition.to}`, source: transition.from, target: transition.to, label: transition.conditions.length ? `${transition.conditions.length} condition${transition.conditions.length > 1 ? "s" : ""}` : "always", animated: false, data: transition })),
  };
}

function fromGraph(nodes: FlowNode[], edges: FlowEdge[], name: string, entryStateKey: string, outcomes: FlowOutcome[]): FlowData {
  return {
    name,
    entry_state_key: entryStateKey,
    states: nodes.map((node) => ({ ...(node.data.state as FlowState), key: node.id })),
    transitions: edges.map((edge) => ({ from: edge.source, to: edge.target, conditions: (edge.data as FlowTransition | undefined)?.conditions || [], priority: Number((edge.data as FlowTransition | undefined)?.priority || 0) })),
    outcomes,
  };
}

export default function DialogFlowDesigner({ apiBaseUrl, projectId, serviceId, blankDraft = false }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const [flowName, setFlowName] = useState("Customer conversation");
  const [entryStateKey, setEntryStateKey] = useState("");
  const [outcomes, setOutcomes] = useState<FlowOutcome[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading flow…");
  const [saving, setSaving] = useState(false);
  const [draggingState, setDraggingState] = useState<StateType | null>(null);
  const [canvasActive, setCanvasActive] = useState(false);
  const [previewStateKey, setPreviewStateKey] = useState("");
  const [previewInput, setPreviewInput] = useState("");
  const [previewSlots, setPreviewSlots] = useState<Record<string, string>>({});
  const [previewMilestones, setPreviewMilestones] = useState<string[]>([]);
  const [previewMessages, setPreviewMessages] = useState<Array<{ role: string; text: string }>>([]);
  const [previewOpen, setPreviewOpen] = useState(false);

  const selected = useMemo(() => nodes.find((node) => node.id === selectedNode), [nodes, selectedNode]);
  const selectedTransition = useMemo(() => edges.find((edge) => edge.id === selectedEdge), [edges, selectedEdge]);

  useEffect(() => {
    if (blankDraft) {
      setNodes([]);
      setEdges([]);
      setFlowName("New conversation flow");
      setEntryStateKey("");
      setOutcomes([]);
      setStatus("Blank draft");
      return;
    }

    fetch(`${apiBaseUrl}/v1/projects/${encodeURIComponent(projectId)}/chat-services/${encodeURIComponent(serviceId)}/dialog-flow`, { credentials: "include" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error?.message || "Unable to load dialog flow.");
        if (data.dialog_flow) {
          const graph = toGraph(data.dialog_flow);
          setNodes(graph.nodes); setEdges(graph.edges); setFlowName(data.dialog_flow.name); setEntryStateKey(data.dialog_flow.entry_state_key); setOutcomes(data.dialog_flow.outcomes || []); setStatus(`Published version ${data.dialog_flow.version}`);
        } else {
          const graph = toGraph(templates.support);
          setNodes(graph.nodes); setEdges(graph.edges); setFlowName(templates.support.name); setEntryStateKey(templates.support.entry_state_key); setOutcomes(templates.support.outcomes); setStatus("Default support template");
        }
      })
      .catch((error) => setStatus(error.message));
  }, [apiBaseUrl, blankDraft, projectId, serviceId, setEdges, setNodes]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((current) => addEdge({ ...connection, type: "smoothstep", label: "always", data: { from: connection.source, to: connection.target, conditions: [], priority: 0 } }, current));
  }, [setEdges]);

  function addState(type: StateType) {
    const key = `${type}-${nodes.length + 1}`;
    const state: FlowState = { key, type, goal: "", prompt: "Describe what this step should say or ask.", required_slots: [], knowledge_base_ids: [], max_retries: 2 };
    setNodes((current) => [...current, stateNode(state, current.length)]);
    if (!entryStateKey) setEntryStateKey(key);
  }

  function applyTemplate(templateKey: string) {
    const template = templates[templateKey];
    if (!template) return;
    if (nodes.length && !window.confirm("Replace the current canvas with this template? Unsaved changes will be lost.")) return;
    const graph = toGraph(template);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setFlowName(template.name);
    setEntryStateKey(template.entry_state_key);
    setOutcomes(template.outcomes);
    setSelectedNode(null);
    setSelectedEdge(null);
    setStatus(`${template.name} template loaded`);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/x-dialog-state") as StateType;
    setCanvasActive(false);
    setDraggingState(null);
    if (stateTypes.includes(type)) addState(type);
  }

  function updateSelectedState(field: keyof FlowState, value: unknown) {
    if (!selectedNode) return;
    const nextKey = field === "key" ? String(value).trim() : selectedNode;
    if (field === "key" && (!nextKey || nodes.some((node) => node.id === nextKey && node.id !== selectedNode))) return;
    setNodes((current) => current.map((node) => node.id === selectedNode ? { ...node, id: nextKey, data: { ...node.data, label: field === "key" ? nextKey : node.data.label, state: { ...node.data.state, [field]: value, ...(field === "key" ? { key: nextKey } : {}) } } } : node));
    if (field === "key") {
      setEdges((current) => current.map((edge) => ({ ...edge, source: edge.source === selectedNode ? nextKey : edge.source, target: edge.target === selectedNode ? nextKey : edge.target })));
      if (entryStateKey === selectedNode) setEntryStateKey(nextKey);
      setSelectedNode(nextKey);
    }
  }

  function updateSelectedEdge(field: "priority" | "conditions", value: unknown) {
    if (!selectedEdge) return;
    setEdges((current) => current.map((edge) => edge.id === selectedEdge ? { ...edge, label: field === "conditions" && Array.isArray(value) && value.length ? `${value.length} condition${value.length > 1 ? "s" : ""}` : "always", data: { from: edge.source, to: edge.target, conditions: edge.data?.conditions || [], priority: Number(edge.data?.priority || 0), [field]: value } } : edge));
  }

  function addCondition() {
    if (!selectedEdge) return;
    const edge = edges.find((item) => item.id === selectedEdge);
    updateSelectedEdge("conditions", [...(((edge?.data as FlowTransition | undefined)?.conditions) || []), { field: "intent", operator: "equals", value: "" }]);
  }

  function updateCondition(index: number, field: string, value: unknown) {
    if (!selectedEdge) return;
    const edge = edges.find((item) => item.id === selectedEdge);
    const conditions = [...(((edge?.data as FlowTransition | undefined)?.conditions) || [])];
    conditions[index] = { ...conditions[index], [field]: value };
    updateSelectedEdge("conditions", conditions);
  }

  function removeCondition(index: number) {
    if (!selectedEdge) return;
    const edge = edges.find((item) => item.id === selectedEdge);
    updateSelectedEdge("conditions", (((edge?.data as FlowTransition | undefined)?.conditions) || []).filter((_, conditionIndex) => conditionIndex !== index));
  }

  function resetPreview() {
    setPreviewStateKey(entryStateKey || nodes[0]?.id || "");
    setPreviewSlots({});
    setPreviewMilestones([]);
    setPreviewMessages([]);
  }

  function runPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = previewInput.trim();
    const currentKey = previewStateKey || entryStateKey || nodes[0]?.id || "";
    const current = nodes.find((node) => node.id === currentKey);
    if (!text || !current) return;
    const nextSlots = { ...previewSlots };
    for (const slot of current.data.state.required_slots) {
      const match = text.match(new RegExp(`\\b${slot}\\s*(?:is|:|=)\\s*([^,.;\\n]+)`, "i"));
      if (match?.[1]) nextSlots[slot] = match[1].trim();
    }
    const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i)?.[0];
    if (email && current.data.state.required_slots.includes("email")) nextSlots.email = email;
    const lower = text.toLowerCase();
    const intent = /\b(invoice|billing|payment|refund|charged)\b/.test(lower) ? "billing" : "general_enquiry";
    const sentiment = /\b(angry|frustrated|complaint)\b/.test(lower) ? "negative" : "neutral";
    const outgoing = edges.filter((edge) => edge.source === currentKey).sort((left, right) => Number((right.data as FlowTransition | undefined)?.priority || 0) - Number((left.data as FlowTransition | undefined)?.priority || 0));
    const next = outgoing.find((edge) => (((edge.data as FlowTransition | undefined)?.conditions) || []).every((condition) => { const field = String(condition.field || ""); const value = field.startsWith("slots.") ? nextSlots[field.slice(6)] : field === "intent" ? intent : field === "sentiment" ? sentiment : currentKey; return condition.operator === "exists" ? Boolean(value) : condition.operator === "contains" ? String(value).toLowerCase().includes(String(condition.value || "").toLowerCase()) : String(value) === String(condition.value || ""); }))?.target;
    setPreviewMessages((messages) => [...messages, { role: "user", text }]);
    setPreviewSlots(nextSlots);
    if (next && next !== currentKey) { setPreviewStateKey(next); setPreviewMilestones((milestones) => milestones.includes(currentKey) ? milestones : [...milestones, currentKey]); const nextNode = nodes.find((node) => node.id === next); setPreviewMessages((messages) => [...messages, { role: "assistant", text: nextNode?.data.state.prompt || `Moved to ${next}.` }]); } else setPreviewMessages((messages) => [...messages, { role: "assistant", text: current.data.state.prompt }]);
    setPreviewInput("");
  }

  async function save() {
    const flow = fromGraph(nodes, edges, flowName, entryStateKey || nodes[0]?.id || "", outcomes);
    if (!flow.entry_state_key || !flow.states.length) return setStatus("Add at least one state and choose an entry state.");
    setSaving(true); setStatus("Publishing new version…");
    try {
      const response = await fetch(`${apiBaseUrl}/v1/projects/${encodeURIComponent(projectId)}/chat-services/${encodeURIComponent(serviceId)}/dialog-flow`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(flow) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || "Unable to save dialog flow.");
      setStatus(`Published version ${data.dialog_flow.version}`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to save dialog flow."); } finally { setSaving(false); }
  }

  return <section className="border-y border-slate-300 bg-white py-5">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 pb-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-slate-950">Visual dialog flow</h2><span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700"><span aria-hidden="true">●</span> Attached to Chat Service</span></div><p className="mt-1 text-sm text-slate-500">Project {projectId} · Service {serviceId}</p></div><div className="flex items-center gap-3"><span className="text-xs font-semibold text-slate-500">{status}</span><button type="button" onClick={() => setPreviewOpen((open) => !open)} title={previewOpen ? "Close draft preview" : "Open draft preview"} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50"><span aria-hidden="true">{previewOpen ? "×" : "▶"}</span>{previewOpen ? "Close preview" : "Preview"}</button><button type="button" onClick={save} disabled={saving} title="Save and publish this flow" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"><span aria-hidden="true">{saving ? "…" : "↑"}</span>{saving ? "Saving…" : "Save and publish"}</button></div></div>
    <div className="mt-5 border-b border-slate-300 pb-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Start from a business scenario</p><p className="mt-1 text-sm text-slate-600">Templates create a working path with states, transitions, and expected outcomes.</p></div><span className="text-xs text-slate-500">{Object.keys(templates).length} ready starters</span></div><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.keys(templates).map((templateKey) => <button type="button" key={templateKey} onClick={() => applyTemplate(templateKey)} className="group rounded-xl border border-slate-300 bg-white p-4 text-left transition hover:border-blue-400 hover:bg-blue-50"><div className="flex items-center justify-between gap-2"><span className="font-semibold capitalize text-slate-900">{templateKey.replace("_", " ")}</span><span className="text-blue-600 transition group-hover:translate-x-0.5">→</span></div><p className="mt-2 text-xs leading-5 text-slate-500">{templateDescriptions[templateKey]}</p></button>)}</div></div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[150px_minmax(0,1fr)_270px]">
      <aside className="space-y-2 border border-slate-300 bg-slate-50 p-3"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400"><span aria-hidden="true">✦</span> Drag onto canvas</p>{stateTypes.map((type) => <button type="button" draggable title={`Add ${type} state`} onDragStart={(event) => { event.dataTransfer.setData("application/x-dialog-state", type); setDraggingState(type); }} onDragEnd={() => setDraggingState(null)} key={type} onClick={() => addState(type)} className="flex w-full items-center justify-between border border-slate-300 bg-white px-2.5 py-2 text-left text-xs font-semibold capitalize text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50"><span>{type}</span><span className="text-blue-600" aria-hidden="true">+</span></button>)}<p className="mt-4 text-[11px] leading-5 text-slate-500">Drag a state to place it. Connect nodes from handle to handle.</p></aside>
      <div onDragOver={(event) => { event.preventDefault(); setCanvasActive(true); }} onDragEnter={(event) => { event.preventDefault(); setCanvasActive(true); }} onDragLeave={(event) => { if (event.currentTarget === event.target) setCanvasActive(false); }} onDrop={handleDrop} className={`relative h-[560px] overflow-hidden rounded-xl border-2 bg-[#172033] transition ${canvasActive ? "border-blue-400 bg-[#1d2a42] ring-4 ring-blue-100" : "border-slate-600"}`}><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} defaultEdgeOptions={{ type: "smoothstep", style: { stroke: "#60a5fa", strokeWidth: 2 } }} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => { setSelectedNode(node.id); setSelectedEdge(null); }} onEdgeClick={(_, edge) => { setSelectedEdge(edge.id); setSelectedNode(null); }} fitView><Background gap={20} size={1} color="#344054" /><Controls /><MiniMap nodeColor={(node) => stateVisuals[(node.data?.state as FlowState)?.type || "question"]?.accent || "#60a5fa"} maskColor="rgba(16, 24, 40, 0.7)" /></ReactFlow>{canvasActive && <div className="pointer-events-none absolute inset-5 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-blue-300 bg-slate-900/70"><div className="rounded-lg border border-blue-300 bg-slate-800 px-4 py-3 text-center shadow-sm"><p className="text-sm font-bold text-blue-100">Drop to add {draggingState || "a state"}</p><p className="mt-1 text-xs text-slate-300">The new state will be ready to connect</p></div></div>}</div>
      <aside className="rounded-xl border border-slate-200 bg-white p-4"><label className="block text-xs font-bold uppercase tracking-wide text-slate-400">Flow name<input value={flowName} onChange={(event) => setFlowName(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case" /></label><label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-400">Entry state<select value={entryStateKey} onChange={(event) => setEntryStateKey(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case"><option value="">Choose state</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.id}</option>)}</select></label>{selected && <div className="mt-6 border-t border-slate-100 pt-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Selected state</p><label className="mt-3 block text-sm font-medium text-slate-700">Key<input value={selected.data.state.key} onChange={(event) => updateSelectedState("key", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></label><label className="mt-3 block text-sm font-medium text-slate-700">Goal<input value={selected.data.state.goal || ""} onChange={(event) => updateSelectedState("goal", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></label><label className="mt-3 block text-sm font-medium text-slate-700">Prompt<textarea value={selected.data.state.prompt} onChange={(event) => updateSelectedState("prompt", event.target.value)} rows={5} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></label><label className="mt-3 block text-sm font-medium text-slate-700">Required slots<input value={selected.data.state.required_slots.join(", ")} onChange={(event) => updateSelectedState("required_slots", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></label></div>}{selectedTransition && <div className="mt-6 border-t border-slate-100 pt-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Selected transition</p><p className="mt-2 text-sm text-slate-700">{selectedTransition.source} → {selectedTransition.target}</p><label className="mt-3 block text-sm font-medium text-slate-700">Priority<input type="number" value={Number(selectedTransition.data?.priority || 0)} onChange={(event) => updateSelectedEdge("priority", Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></label></div>}<div className="mt-6 border-t border-slate-100 pt-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Expected outcomes</p>{outcomes.map((outcome, index) => <div key={outcome.key} className="mt-2 rounded-lg bg-slate-50 p-2 text-xs"><p className="font-semibold text-slate-800">{outcome.label}</p><p className="mt-1 text-slate-500">{outcome.key}</p></div>)}<button type="button" onClick={() => setOutcomes((current) => [...current, { key: `outcome-${current.length + 1}`, label: "New outcome", actions: [{ type: "record_event", event: "completed" }] }])} className="mt-3 text-xs font-semibold text-blue-600">+ Add outcome</button></div></aside>
    </div>
    <div className={`mt-5 grid gap-4 border-t border-slate-200 pt-5 ${previewOpen ? "lg:grid-cols-2" : ""}`}>
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Trigger builder</p><h3 className="mt-1 font-bold text-slate-900">Configure the selected transition</h3></div><button type="button" onClick={addCondition} title="Add trigger condition" className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-bold text-white">+</button></div>
        {selectedTransition ? <div className="mt-3 space-y-2">{(((selectedTransition.data as FlowTransition | undefined)?.conditions) || []).map((condition, index) => <div key={`${selectedTransition.id}-condition-${index}`} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"><select value={String(condition.field || "intent")} onChange={(event) => updateCondition(index, "field", event.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"><option value="intent">Intent</option><option value="sentiment">Sentiment</option><option value="slots.need">Slot: need</option><option value="slots.email">Slot: email</option><option value="slots.order_reference">Slot: order reference</option><option value="state">Current state</option></select><select value={String(condition.operator || "equals")} onChange={(event) => updateCondition(index, "operator", event.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"><option value="exists">exists</option><option value="equals">equals</option><option value="contains">contains</option></select><input value={String(condition.value || "")} onChange={(event) => updateCondition(index, "value", event.target.value)} placeholder="Value" className="min-w-0 rounded border border-slate-300 px-2 py-1.5 text-xs" /><button type="button" onClick={() => removeCondition(index)} title="Remove trigger condition" className="rounded px-2 text-lg leading-none text-red-600">×</button></div>)}{!(((selectedTransition.data as FlowTransition | undefined)?.conditions) || []).length && <p className="text-sm text-slate-500">Select a transition and add a condition, such as intent equals billing.</p>}<label className="block text-sm font-medium text-slate-700">Priority<input type="number" value={Number(selectedTransition.data?.priority || 0)} onChange={(event) => updateSelectedEdge("priority", Number(event.target.value))} className="mt-1 w-28 rounded border border-slate-300 px-2 py-1.5 text-sm" /></label></div> : <p className="mt-4 text-sm text-slate-500">Select an edge on the canvas to configure its trigger.</p>}
      </section>
      {previewOpen && <section className="rounded-xl border border-slate-200 bg-slate-950 p-4 text-white xl:fixed xl:right-6 xl:top-24 xl:bottom-6 xl:z-10 xl:mt-0 xl:flex xl:w-[360px] xl:flex-col xl:overflow-y-auto">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-blue-300">Draft preview</p><h3 className="mt-1 font-bold">Test the flow before publishing</h3></div><button type="button" onClick={resetPreview} title="Reset draft preview" className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10">Reset</button></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-lg bg-white/10 p-2"><p className="text-[10px] uppercase text-slate-400">Current state</p><p className="mt-1 truncate text-xs font-semibold">{previewStateKey || entryStateKey || "Not started"}</p></div><div className="rounded-lg bg-white/10 p-2"><p className="text-[10px] uppercase text-slate-400">Milestones</p><p className="mt-1 truncate text-xs font-semibold">{previewMilestones.length || 0} completed</p></div><div className="rounded-lg bg-white/10 p-2"><p className="text-[10px] uppercase text-slate-400">Slots</p><p className="mt-1 truncate text-xs font-semibold">{Object.keys(previewSlots).length} collected</p></div></div>
        <div className="mt-3 max-h-32 space-y-2 overflow-y-auto">{previewMessages.length ? previewMessages.map((message, index) => <div key={`${message.role}-${index}`} className={`rounded-lg p-2 text-xs ${message.role === "user" ? "ml-5 bg-blue-500 text-white" : "mr-5 bg-white/10 text-slate-200"}`}>{message.text}</div>) : <p className="rounded-lg border border-dashed border-white/20 p-3 text-xs text-slate-400">Enter a customer message to walk the configured transitions.</p>}</div>
        <form onSubmit={runPreview} className="mt-3 flex gap-2 xl:mt-auto"><input value={previewInput} onChange={(event) => setPreviewInput(event.target.value)} placeholder="Try a customer message" className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-white placeholder:text-slate-400" /><button type="submit" className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-400">Run</button></form>
      </section>}
    </div>
  </section>;
}

import { Hono } from "hono";
import type { Env, HonoVariables } from "../types";
import { id, now, jsonError } from "../utils/common";
import { requireDashboard } from "../utils/auth";
import { canManageTenantServices } from "../tenant-roles";
import { dialogFlowSchema } from "../services/dialog";

const router = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

router.get(
  "/v1/projects/:projectId/chat-services/:serviceId/dialog-flow",
  async (c) => {
    const auth = await requireDashboard(c);
    if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
    const flow = await c.env.DB.prepare(
      `SELECT f.id, f.name, f.active_version_id, v.id AS version_id, v.version, v.status, v.entry_state_key
       FROM dialog_flows f LEFT JOIN dialog_flow_versions v ON v.id = f.active_version_id
       WHERE f.chat_service_id = ? AND f.project_id = ? AND f.tenant_id = ?`
    )
      .bind(
        c.req.param("serviceId"),
        c.req.param("projectId"),
        auth.tenantId
      )
      .first<any>();
    if (!flow) return c.json({ dialog_flow: null });
    const [states, transitions, outcomes] = await Promise.all([
      c.env.DB.prepare(
        "SELECT state_key AS key, state_type AS type, goal, prompt, required_slots_json, knowledge_base_ids_json, max_retries FROM dialog_states WHERE flow_version_id = ? AND tenant_id = ? ORDER BY state_key"
      )
        .bind(flow.version_id, auth.tenantId)
        .all(),
      c.env.DB.prepare(
        "SELECT from_state_key AS 'from', to_state_key AS 'to', conditions_json, priority FROM dialog_transitions WHERE flow_version_id = ? AND tenant_id = ? ORDER BY priority DESC"
      )
        .bind(flow.version_id, auth.tenantId)
        .all(),
      c.env.DB.prepare(
        "SELECT outcome_key AS key, label, actions_json FROM dialog_outcomes WHERE flow_version_id = ? AND tenant_id = ? ORDER BY outcome_key"
      )
        .bind(flow.version_id, auth.tenantId)
        .all(),
    ]);
    return c.json({
      dialog_flow: {
        id: flow.id,
        name: flow.name,
        version_id: flow.version_id,
        version: flow.version,
        status: flow.status,
        entry_state_key: flow.entry_state_key,
        states: states.results.map((state: any) => ({
          ...state,
          required_slots: JSON.parse(state.required_slots_json),
          knowledge_base_ids: JSON.parse(state.knowledge_base_ids_json),
        })),
        transitions: transitions.results.map((transition: any) => ({
          ...transition,
          conditions: JSON.parse(transition.conditions_json),
        })),
        outcomes: outcomes.results.map((outcome: any) => ({
          ...outcome,
          actions: JSON.parse(outcome.actions_json),
        })),
      },
    });
  }
);

router.put(
  "/v1/projects/:projectId/chat-services/:serviceId/dialog-flow",
  async (c) => {
    const auth = await requireDashboard(c);
    if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
    if (!canManageTenantServices(auth.role)) {
      return jsonError(c, "FORBIDDEN", "Tenant workspace access is required.", 403);
    }
    const service = await c.env.DB.prepare(
      "SELECT id FROM chat_services WHERE id = ? AND project_id = ? AND tenant_id = ?"
    )
      .bind(
        c.req.param("serviceId"),
        c.req.param("projectId"),
        auth.tenantId
      )
      .first();
    if (!service) return jsonError(c, "NOT_FOUND", "Chat Service not found.", 404);
    const parsed = dialogFlowSchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return jsonError(
        c,
        "INVALID_REQUEST",
        parsed.error.issues[0]?.message || "Invalid dialog flow.",
        400
      );
    }
    const stateKeys = new Set(parsed.data.states.map((state) => state.key));
    if (
      !stateKeys.has(parsed.data.entry_state_key) ||
      parsed.data.transitions.some(
        (transition) =>
          !stateKeys.has(transition.from) || !stateKeys.has(transition.to)
      )
    ) {
      return jsonError(
        c,
        "INVALID_REQUEST",
        "Dialog flow state references are invalid.",
        400
      );
    }
    const flow = await c.env.DB.prepare(
      "SELECT id FROM dialog_flows WHERE chat_service_id = ? AND tenant_id = ?"
    )
      .bind(c.req.param("serviceId"), auth.tenantId)
      .first<{ id: string }>();
    const flowId = flow?.id || id("flow");
    if (!flow) {
      await c.env.DB.prepare(
        "INSERT INTO dialog_flows (id, tenant_id, project_id, chat_service_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
        .bind(
          flowId,
          auth.tenantId,
          c.req.param("projectId"),
          c.req.param("serviceId"),
          parsed.data.name,
          now(),
          now()
        )
        .run();
    }
    const latest = await c.env.DB.prepare(
      "SELECT COALESCE(MAX(version), 0) AS version FROM dialog_flow_versions WHERE flow_id = ?"
    )
      .bind(flowId)
      .first<{ version: number }>();
    const version = Number(latest?.version || 0) + 1;
    const versionId = id("flowv");
    const timestamp = now();
    const statements = [
      c.env.DB.prepare(
        "INSERT INTO dialog_flow_versions (id, flow_id, tenant_id, version, status, entry_state_key, created_by, created_at) VALUES (?, ?, ?, ?, 'published', ?, ?, ?)"
      ).bind(
        versionId,
        flowId,
        auth.tenantId,
        version,
        parsed.data.entry_state_key,
        auth.userId,
        timestamp
      ),
      c.env.DB.prepare(
        "UPDATE dialog_flows SET name = ?, active_version_id = ?, updated_at = ? WHERE id = ? AND tenant_id = ?"
      ).bind(parsed.data.name, versionId, timestamp, flowId, auth.tenantId),
    ];
    for (const state of parsed.data.states) {
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO dialog_states (id, flow_version_id, tenant_id, state_key, state_type, goal, prompt, required_slots_json, knowledge_base_ids_json, max_retries) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          id("state"),
          versionId,
          auth.tenantId,
          state.key,
          state.type,
          state.goal || null,
          state.prompt,
          JSON.stringify(state.required_slots),
          JSON.stringify(state.knowledge_base_ids),
          state.max_retries
        )
      );
    }
    for (const transition of parsed.data.transitions) {
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO dialog_transitions (id, flow_version_id, tenant_id, from_state_key, to_state_key, conditions_json, priority) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          id("trans"),
          versionId,
          auth.tenantId,
          transition.from,
          transition.to,
          JSON.stringify(transition.conditions),
          transition.priority
        )
      );
    }
    for (const outcome of parsed.data.outcomes) {
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO dialog_outcomes (id, flow_version_id, tenant_id, outcome_key, label, actions_json) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(
          id("outcome"),
          versionId,
          auth.tenantId,
          outcome.key,
          outcome.label,
          JSON.stringify(outcome.actions)
        )
      );
    }
    await c.env.DB.batch(statements);
    return c.json(
      {
        dialog_flow: {
          id: flowId,
          version_id: versionId,
          version,
          status: "published",
          ...parsed.data,
        },
      },
      201
    );
  }
);

export const dialogFlowRoutes = router;

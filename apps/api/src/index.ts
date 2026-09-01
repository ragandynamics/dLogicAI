import { Hono } from "hono";
import { cors } from "hono/cors";
import type {
  AppContext,
  ChannelQueueMessage,
  Env,
  HonoVariables,
} from "./types";
import { id, now, jsonError } from "./utils/common";
import { requireDashboard } from "./utils/auth";
import { registerBillingRoutes } from "./billing";
import { sendChannelDelivery } from "./services/channels";

// Route modules
import { publicRoutes } from "./routes/public";
import { authRoutes } from "./routes/auth";
import { organizationRoutes } from "./routes/organization";
import { serviceRequestRoutes } from "./routes/service-requests";
import { creditRoutes } from "./routes/credits";
import { projectRoutes } from "./routes/projects";
import { knowledgeBaseRoutes } from "./routes/knowledge-bases";
import { dialogFlowRoutes } from "./routes/dialog-flows";
import { chatServiceRoutes } from "./routes/chat-services";
import { connectorRoutes } from "./routes/connectors";
import { channelRoutes } from "./routes/channels";
import { conversationRoutes } from "./routes/conversations";
import { responseRoutes } from "./routes/responses";

const app = new Hono<{
  Bindings: Env;
  Variables: HonoVariables;
}>();

/* -------------------------------------------------------------------------- */
/* CORS                                                                       */
/* -------------------------------------------------------------------------- */

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowedOrigins = new Set(
        (c.env.CORS_ORIGINS || "http://localhost:4321,http://127.0.0.1:4321")
          .split(",")
          .map((value: string) => value.trim())
          .filter(Boolean)
      );
      return origin && allowedOrigins.has(origin) ? origin : "";
    },
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })
);

/* -------------------------------------------------------------------------- */
/* BILLING ROUTES                                                             */
/* -------------------------------------------------------------------------- */

registerBillingRoutes(app, {
  requireDashboard,
  jsonError,
  id,
  now,
});

/* -------------------------------------------------------------------------- */
/* ROUTE MODULES                                                              */
/* -------------------------------------------------------------------------- */

app.route("/", publicRoutes);
app.route("/", authRoutes);
app.route("/", organizationRoutes);
app.route("/", serviceRequestRoutes);
app.route("/", creditRoutes);
app.route("/", projectRoutes);
app.route("/", knowledgeBaseRoutes);
app.route("/", dialogFlowRoutes);
app.route("/", chatServiceRoutes);
app.route("/", connectorRoutes);
app.route("/", channelRoutes);
app.route("/", conversationRoutes);
app.route("/", responseRoutes);

/* -------------------------------------------------------------------------- */
/* EXPORT & QUEUE CONSUMER                                                    */
/* -------------------------------------------------------------------------- */

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<ChannelQueueMessage>, env: Env) {
    for (const message of batch.messages) {
      const item = message.body;
      if (item.type === "channel.outbound" && item.deliveryId) {
        const result = await sendChannelDelivery(
          { env } as AppContext,
          item.deliveryId
        );
        if (!result.ok && result.retryable) {
          message.retry({
            delaySeconds: Math.min(60, 2 ** Number(result.attempt || 1)),
          });
        } else {
          message.ack();
        }
        continue;
      }

      if (item.type === "channel.inbound") {
        await env.DB.prepare(
          `UPDATE channel_events SET status = 'queued' WHERE tenant_id = ? AND installation_id = ? AND status = 'processed'`
        )
          .bind(item.tenantId, item.installationId)
          .run();
        message.ack();
      }
    }
  },
};

import { Hono } from "hono";
import { featureRoutes } from './routes/features';
import { formRoutes,expireFormAnswers } from './routes/forms';
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
import { processChannelInbound, sendChannelDelivery } from "./services/channels";

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
import { businessConnectorRoutes,processBusinessAction } from "./routes/business-connectors";
import { scheduledBusinessSync } from './services/business-sync';
import { channelRoutes } from "./routes/channels";
import { operationsRoutes } from "./routes/operations";
import { conversationRoutes } from "./routes/conversations";
import { responseRoutes } from "./routes/responses";
import { webWidgetRoutes } from "./routes/web-widgets";
import { telegramConnectRoutes } from "./routes/telegram-connect";

const app = new Hono<{
  Bindings: Env;
  Variables: HonoVariables;
}>();

// Public widgets enforce their own exact tenant origin allowlist.
app.route("/", webWidgetRoutes);
app.route("/", telegramConnectRoutes);

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
app.route('/',featureRoutes);
app.route('/',formRoutes);
app.route("/", authRoutes);
app.route("/", organizationRoutes);
app.route("/", serviceRequestRoutes);
app.route("/", creditRoutes);
app.route("/", projectRoutes);
app.route("/", knowledgeBaseRoutes);
app.route("/", dialogFlowRoutes);
app.route("/", chatServiceRoutes);
app.route("/", connectorRoutes);
app.route("/", businessConnectorRoutes);
app.route("/", channelRoutes);
app.route("/", operationsRoutes);
app.route("/", conversationRoutes);
app.route("/", responseRoutes);

/* -------------------------------------------------------------------------- */
/* EXPORT & QUEUE CONSUMER                                                    */
/* -------------------------------------------------------------------------- */

export default {
  fetch: app.fetch,
  async scheduled(_event:ScheduledController,env:Env) { await expireFormAnswers(env); await scheduledBusinessSync(env); },
  async queue(batch: MessageBatch<ChannelQueueMessage | {type:'business.action';id:string;tenantId:string}>, env: Env) {
    for (const message of batch.messages) {
      const item = message.body;
      if(item.type==='business.action') {
        await processBusinessAction(env,item.id,item.tenantId);
        message.ack();continue;
      }
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
        const result = await processChannelInbound(env, item);
        if (result.ok && result.deliveryId && env.CHANNEL_QUEUE) {
          await env.CHANNEL_QUEUE.send({
            type: "channel.outbound",
            tenantId: item.tenantId,
            installationId: item.installationId,
            conversationId: item.conversationId,
            text: "",
            deliveryId: result.deliveryId,
          });
        }
        message.ack();
      }
    }
  },
};

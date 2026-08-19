CREATE TABLE IF NOT EXISTS conversation_intelligence (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  request_id TEXT NOT NULL,

  intent TEXT NOT NULL,
  intent_confidence INTEGER NOT NULL DEFAULT 0,

  sentiment TEXT NOT NULL,
  emotion TEXT NOT NULL,

  frustration_score INTEGER NOT NULL DEFAULT 0,
  urgency_score INTEGER NOT NULL DEFAULT 0,
  customer_effort_score INTEGER NOT NULL DEFAULT 0,
  confusion_score INTEGER NOT NULL DEFAULT 0,

  purchase_intent_score INTEGER NOT NULL DEFAULT 0,
  upsell_probability INTEGER NOT NULL DEFAULT 0,
  cross_sell_probability INTEGER NOT NULL DEFAULT 0,
  churn_risk_score INTEGER NOT NULL DEFAULT 0,
  escalation_risk_score INTEGER NOT NULL DEFAULT 0,
  refund_risk_score INTEGER NOT NULL DEFAULT 0,
  conversion_probability INTEGER NOT NULL DEFAULT 0,
  abandonment_probability INTEGER NOT NULL DEFAULT 0,

  price_sensitivity TEXT,
  customer_lifecycle TEXT,

  objection TEXT,
  product_interest TEXT,
  competitor_mention TEXT,

  next_best_action TEXT,
  next_best_offer TEXT,

  business_event TEXT,
  business_event_severity TEXT,

  human_handoff_recommended INTEGER NOT NULL DEFAULT 0,

  topics_json TEXT,
  entities_json TEXT,
  preferences_json TEXT,
  constraints_json TEXT,

  created_at INTEGER NOT NULL,

  FOREIGN KEY (conversation_id)
    REFERENCES conversations(id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_intelligence_conversation
ON conversation_intelligence(conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_intelligence_request
ON conversation_intelligence(request_id);

CREATE INDEX IF NOT EXISTS idx_conversation_intelligence_intent
ON conversation_intelligence(intent);

CREATE INDEX IF NOT EXISTS idx_conversation_intelligence_event
ON conversation_intelligence(business_event);

CREATE INDEX IF NOT EXISTS idx_conversation_intelligence_created
ON conversation_intelligence(created_at);
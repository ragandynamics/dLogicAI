export type CommerceConnectorKey = "amazon" | "shopee" | "lazada" | "tiktok_shop";

export type ConnectorOperation =
  | "get_order"
  | "get_order_items"
  | "get_product"
  | "get_inventory"
  | "get_shipment"
  | "get_return"
  | "get_refund";

export type ConnectorResult = {
  ok: boolean;
  provider: CommerceConnectorKey;
  operation: ConnectorOperation;
  data?: Record<string, unknown>;
  code?: string;
};

export type CommerceConnector = {
  key: CommerceConnectorKey;
  operations: ConnectorOperation[];
  validateCredentials(credentials: Record<string, string>): string | null;
  execute(
    operation: ConnectorOperation,
    input: Record<string, unknown>,
    credentials: Record<string, string>,
  ): Promise<ConnectorResult>;
};

const operations: ConnectorOperation[] = [
  "get_order",
  "get_order_items",
  "get_product",
  "get_inventory",
  "get_shipment",
  "get_return",
  "get_refund",
];

function notConfigured(key: CommerceConnectorKey): CommerceConnector {
  return {
    key,
    operations,
    validateCredentials(credentials) {
      return Object.keys(credentials).length ? null : "CONNECTOR_CREDENTIALS_REQUIRED";
    },
    async execute(operation) {
      return {
        ok: false,
        provider: key,
        operation,
        code: "CONNECTOR_ADAPTER_NOT_CONFIGURED",
      };
    },
  };
}

export const commerceConnectors = new Map<CommerceConnectorKey, CommerceConnector>(
  (["amazon", "shopee", "lazada", "tiktok_shop"] as CommerceConnectorKey[]).map((key) => [key, notConfigured(key)]),
);

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const environment = process.argv[2];
if (environment !== "uat" && environment !== "production") {
  throw new Error("Usage: node scripts/prepare-worker-deploy-config.mjs <uat|production>");
}

const settings = environment === "uat"
  ? {
      workerName: "dlogicai-web-uat",
      apiWorkerName: "dlogicai-api-uat",
      apiBaseUrl: "https://dlogicai-api-uat.rdproducts-adm1.workers.dev",
    }
  : {
      workerName: "dlogicai-web",
      apiWorkerName: "dlogicai-api",
      apiBaseUrl: "https://dlogicai-api.rdproducts-adm1.workers.dev",
    };

const generatedPath = resolve("dist/server/wrangler.json");
const deployPath = resolve(`dist/server/wrangler.${environment}.json`);
const config = JSON.parse(await readFile(generatedPath, "utf8"));

config.name = settings.workerName;
config.vars = {
  ...config.vars,
  APP_ENV: environment,
  API_BASE_URL: settings.apiBaseUrl,
};
config.services = [
  ...(config.services || []).filter((binding) => binding.binding !== "API"),
  { binding: "API", service: settings.apiWorkerName },
];

await writeFile(deployPath, `${JSON.stringify(config)}\n`, "utf8");
console.log(`Prepared ${deployPath} for ${settings.workerName}.`);

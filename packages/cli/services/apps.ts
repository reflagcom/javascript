import { authStore } from "../stores/auth.js";
import { configStore } from "../stores/config.js";
import { authRequest } from "../utils/auth.js";
import type { KeyFormat } from "../utils/gen.js";

type AppSummary = {
  id: string;
  name: string;
  demo: boolean;
  environments: { id: string; name: string; isProduction: boolean }[];
};

type OrgSummary = {
  id: string;
  name: string;
  featureKeyFormat: KeyFormat;
};

type Organization = OrgSummary & { apps: AppSummary[] };
export type App = AppSummary & { org: OrgSummary };

let organizations: Promise<Organization[]> | undefined;

async function fetchOrganizations(): Promise<Organization[]> {
  const { isApiKey } = authStore.getToken(configStore.getConfig("baseUrl"));
  if (isApiKey) {
    // The membership list is only for personal sign-ins. Bootstrap returns
    // just the app associated with this key.
    const { org } = await authRequest<{ org: Organization | null }>(
      "/bootstrap",
    );
    return org ? [org] : [];
  }

  const { data } = await authRequest<{ data: Organization[] }>("/orgs");
  return data;
}

export async function listOrganizations(): Promise<Organization[]> {
  const orgs = await (organizations ??= fetchOrganizations());
  const orgId = configStore.getConfig("orgId");
  if (orgId === undefined) return orgs;

  const org = orgs.find(({ id }) => id === orgId);
  if (!org) {
    throw new Error(
      `Organization '${orgId}' was not found or is not accessible. Check --org-id or orgId in reflag.config.json.`,
    );
  }
  return [org];
}

export async function listApps(): Promise<App[]> {
  return (await listOrganizations()).flatMap(
    ({ id, name, featureKeyFormat, apps }) =>
      apps.map((app) => ({ ...app, org: { id, name, featureKeyFormat } })),
  );
}

export async function getApp(id: string): Promise<App> {
  const app = (await listApps()).find(({ id: appId }) => appId === id);
  if (app) return app;

  const orgId = configStore.getConfig("orgId");
  const scope = orgId === undefined ? "" : ` in organization '${orgId}'`;
  throw new Error(
    `App '${id}' was not found or is not accessible${scope}. Use \`reflag apps list\` to see available apps.`,
  );
}

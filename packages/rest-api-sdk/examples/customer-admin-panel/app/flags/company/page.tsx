import Link from "next/link";
import { redirect } from "next/navigation";
import {
  fetchCompanyFlags,
  listApps,
  listEnvironments,
  toggleCompanyFlag,
} from "../actions";

type QueryValue = string | string[] | undefined;

type PageProps = {
  searchParams?: {
    appId?: QueryValue;
    envId?: QueryValue;
    companyId?: QueryValue;
  };
};

function getQueryValue(value: QueryValue) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function CompanyFlagsPage({ searchParams }: PageProps) {
  const apps = (await listApps()).data ?? [];
  const requestedAppId = getQueryValue(searchParams?.appId);
  const selectedAppId =
    apps.find((app) => app.id === requestedAppId)?.id ?? apps[0]?.id ?? "";

  const envs = selectedAppId
    ? ((await listEnvironments(selectedAppId)).data ?? [])
    : [];

  const requestedEnvId = getQueryValue(searchParams?.envId);
  const selectedEnvId =
    envs.find((env) => env.id === requestedEnvId)?.id ?? envs[0]?.id ?? "";

  const companyId = getQueryValue(searchParams?.companyId);

  const flags =
    selectedAppId && selectedEnvId && companyId
      ? (await fetchCompanyFlags(selectedAppId, selectedEnvId, companyId)).data ?? []
      : [];

  async function updateCompanyFlagAction(formData: FormData) {
    "use server";

    const appId = String(formData.get("appId") ?? "");
    const envId = String(formData.get("envId") ?? "");
    const nextCompanyId = String(formData.get("companyId") ?? "");
    const flagKey = String(formData.get("flagKey") ?? "");
    const nextValue = String(formData.get("nextValue") ?? "") === "true";

    await toggleCompanyFlag(appId, envId, nextCompanyId, flagKey, nextValue);

    const query = new URLSearchParams({ appId, envId, companyId: nextCompanyId });
    redirect(`/flags/company?${query.toString()}`);
  }

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <Link href="/flags">Back to flags</Link>
      <h1>Company Flags</h1>

      <form
        method="get"
        action="/flags/company"
        style={{ display: "grid", gap: 12, marginBottom: 16 }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          <span>App</span>
          <select name="appId" defaultValue={selectedAppId} style={{ padding: 8 }}>
            {apps.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Environment</span>
          <select
            name="envId"
            defaultValue={selectedEnvId}
            style={{ padding: 8 }}
            disabled={!selectedAppId}
          >
            {envs.map((env) => (
              <option key={env.id} value={env.id}>
                {env.name}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 6, flex: 1 }}>
            <span>Company ID</span>
            <input
              name="companyId"
              defaultValue={companyId}
              placeholder="Company ID"
              style={{ padding: 8 }}
              required
            />
          </label>
          <button type="submit" disabled={!selectedAppId || !selectedEnvId}>
            Load company flags
          </button>
        </div>
      </form>

      {!companyId ? <p>Enter a company ID to load flags.</p> : null}
      {companyId && flags.length === 0 ? <p>No flags loaded.</p> : null}

      {flags.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 8 }}>Flag</th>
              <th style={{ textAlign: "left", padding: 8 }}>Key</th>
              <th style={{ textAlign: "left", padding: 8 }}>Enabled</th>
              <th style={{ textAlign: "left", padding: 8 }}>Status</th>
              <th style={{ textAlign: "left", padding: 8 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {flags.map((flag) => {
              const isInherited = flag.value && flag.specificallyTargetedValue === null;
              const canToggle = !isInherited;
              const nextValue = !flag.value;

              return (
                <tr key={flag.id} style={{ borderTop: "1px solid #ddd" }}>
                  <td style={{ padding: 8 }}>{flag.name}</td>
                  <td style={{ padding: 8 }}>{flag.key}</td>
                  <td style={{ padding: 8 }}>
                    <input type="checkbox" checked={flag.value} readOnly disabled={isInherited} />
                  </td>
                  <td style={{ padding: 8 }}>{isInherited ? "Inherited" : "Targeted"}</td>
                  <td style={{ padding: 8 }}>
                    <form action={updateCompanyFlagAction}>
                      <input type="hidden" name="appId" value={selectedAppId} />
                      <input type="hidden" name="envId" value={selectedEnvId} />
                      <input type="hidden" name="companyId" value={companyId} />
                      <input type="hidden" name="flagKey" value={flag.key} />
                      <input type="hidden" name="nextValue" value={String(nextValue)} />
                      <button type="submit" disabled={!canToggle}>
                        {canToggle ? (flag.value ? "Turn off" : "Turn on") : "Inherited"}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </main>
  );
}

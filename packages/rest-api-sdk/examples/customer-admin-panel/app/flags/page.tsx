import Link from "next/link";
import { listApps, listEnvironments, listFlags } from "./actions";

type QueryValue = string | string[] | undefined;

type PageProps = {
  searchParams?: {
    appId?: QueryValue;
    envId?: QueryValue;
  };
};

function getQueryValue(value: QueryValue) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function FlagsPage({ searchParams }: PageProps) {
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

  const flags = selectedAppId ? (await listFlags(selectedAppId)).data ?? [] : [];

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <h1>Flags</h1>

      <form method="get" action="/flags" style={{ display: "grid", gap: 12, marginBottom: 16 }}>
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
        <div>
          <button type="submit" disabled={!selectedAppId}>
            Apply
          </button>
        </div>
      </form>

      <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
        <form
          method="get"
          action="/flags/user"
          style={{ display: "flex", gap: 8, alignItems: "end" }}
        >
          <input type="hidden" name="appId" value={selectedAppId} />
          <input type="hidden" name="envId" value={selectedEnvId} />
          <label style={{ display: "grid", gap: 6, flex: 1 }}>
            <span>User ID</span>
            <input name="userId" placeholder="User ID" style={{ padding: 8 }} required />
          </label>
          <button type="submit" disabled={!selectedAppId || !selectedEnvId}>
            Go to user flags
          </button>
        </form>

        <form
          method="get"
          action="/flags/company"
          style={{ display: "flex", gap: 8, alignItems: "end" }}
        >
          <input type="hidden" name="appId" value={selectedAppId} />
          <input type="hidden" name="envId" value={selectedEnvId} />
          <label style={{ display: "grid", gap: 6, flex: 1 }}>
            <span>Company ID</span>
            <input
              name="companyId"
              placeholder="Company ID"
              style={{ padding: 8 }}
              required
            />
          </label>
          <button type="submit" disabled={!selectedAppId || !selectedEnvId}>
            Go to company flags
          </button>
        </form>
      </div>

      {flags.length === 0 ? <p>No flags loaded.</p> : null}
      {flags.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 8 }}>Flag</th>
              <th style={{ textAlign: "left", padding: 8 }}>Key</th>
              <th style={{ textAlign: "left", padding: 8 }}>Open</th>
            </tr>
          </thead>
          <tbody>
            {flags.map((flag) => (
              <tr key={flag.id} style={{ borderTop: "1px solid #ddd" }}>
                <td style={{ padding: 8 }}>{flag.name}</td>
                <td style={{ padding: 8 }}>{flag.key}</td>
                <td style={{ padding: 8 }}>
                  <Link
                    href={`/flags/user?appId=${encodeURIComponent(selectedAppId)}&envId=${encodeURIComponent(selectedEnvId)}`}
                  >
                    User
                  </Link>
                  {" / "}
                  <Link
                    href={`/flags/company?appId=${encodeURIComponent(selectedAppId)}&envId=${encodeURIComponent(selectedEnvId)}`}
                  >
                    Company
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </main>
  );
}

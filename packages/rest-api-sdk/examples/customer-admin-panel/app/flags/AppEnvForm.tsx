"use client";

type Option = {
  id: string;
  name: string;
};

type AppEnvFormProps = {
  apps: Option[];
  envs: Option[];
  selectedAppId: string;
  selectedEnvId: string;
};

export default function AppEnvForm({
  apps,
  envs,
  selectedAppId,
  selectedEnvId,
}: AppEnvFormProps) {
  return (
    <form
      method="get"
      action="/flags"
      style={{ display: "grid", gap: 12, marginBottom: 16 }}
      onChange={(event) => {
        if (event.target instanceof HTMLSelectElement) {
          event.currentTarget.requestSubmit();
        }
      }}
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
      <noscript>
        <div>
          <button type="submit" disabled={!selectedAppId}>
            Apply
          </button>
        </div>
      </noscript>
    </form>
  );
}

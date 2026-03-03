"use client";

type Option = {
  id: string;
  name: string;
};

type EntityFlagsFilterFormProps = {
  action: "/flags/user" | "/flags/company";
  apps: Option[];
  envs: Option[];
  selectedAppId: string;
  selectedEnvId: string;
  entityIdName: "userId" | "companyId";
  entityIdLabel: string;
  entityIdValue: string;
  submitLabel: string;
};

export default function EntityFlagsFilterForm({
  action,
  apps,
  envs,
  selectedAppId,
  selectedEnvId,
  entityIdName,
  entityIdLabel,
  entityIdValue,
  submitLabel,
}: EntityFlagsFilterFormProps) {
  return (
    <form
      method="get"
      action={action}
      style={{ display: "grid", gap: 12, marginBottom: 16 }}
      onChange={(event) => {
        if (event.target instanceof HTMLSelectElement) {
          event.currentTarget.requestSubmit();
        }
      }}
    >
      <label style={{ display: "grid", gap: 6 }}>
        <span>App</span>
        <select
          name="appId"
          defaultValue={selectedAppId}
          style={{ padding: 8 }}
        >
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
          <span>{entityIdLabel}</span>
          <input
            name={entityIdName}
            defaultValue={entityIdValue}
            placeholder={entityIdLabel}
            style={{ padding: 8 }}
            required
          />
        </label>
        <button type="submit" disabled={!selectedAppId || !selectedEnvId}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

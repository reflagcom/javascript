import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import EntityFlagsFilterForm from "../EntityFlagsFilterForm";
import {
  fetchCompanyFlags,
  listApps,
  listEnvironments,
  toggleCompanyFlag,
} from "../actions";

export const dynamic = "force-dynamic";

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
      ? ((await fetchCompanyFlags(selectedAppId, selectedEnvId, companyId))
          .data ?? [])
      : [];

  async function updateCompanyFlagAction(formData: FormData) {
    "use server";

    const appId = String(formData.get("appId") ?? "");
    const envId = String(formData.get("envId") ?? "");
    const nextCompanyId = String(formData.get("companyId") ?? "");
    const flagKey = String(formData.get("flagKey") ?? "");
    const nextValue = String(formData.get("nextValue") ?? "") === "true";

    await toggleCompanyFlag(appId, envId, nextCompanyId, flagKey, nextValue);

    const query = new URLSearchParams({
      appId,
      envId,
      companyId: nextCompanyId,
    });
    revalidatePath("/flags/company");
    redirect(`/flags/company?${query.toString()}`);
  }

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <Link href="/flags">Back to flags</Link>
      <h1>Company Flags</h1>

      <EntityFlagsFilterForm
        action="/flags/company"
        apps={apps}
        envs={envs}
        selectedAppId={selectedAppId}
        selectedEnvId={selectedEnvId}
        entityIdName="companyId"
        entityIdLabel="Company ID"
        entityIdValue={companyId}
        submitLabel="Load company flags"
      />

      {!companyId ? <p>Enter a company ID to load flags.</p> : null}
      {companyId && flags.length === 0 ? <p>No flags loaded.</p> : null}

      {flags.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 8 }}>Flag</th>
              <th style={{ textAlign: "left", padding: 8 }}>Key</th>
              <th style={{ textAlign: "left", padding: 8 }}>Enabled</th>
              <th style={{ textAlign: "left", padding: 8 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {flags.map((flag) => {
              const isInherited =
                flag.value && flag.specificTargetValue === null;

              return (
                <tr key={flag.id} style={{ borderTop: "1px solid #ddd" }}>
                  <td style={{ padding: 8 }}>{flag.name}</td>
                  <td style={{ padding: 8 }}>{flag.key}</td>
                  <td style={{ padding: 8 }}>
                    {flag.value
                      ? isInherited
                        ? "Yes (implicitly)"
                        : "Yes"
                      : "No"}
                  </td>
                  <td style={{ padding: 8 }}>
                    {!isInherited && (
                      <form action={updateCompanyFlagAction}>
                        <input
                          type="hidden"
                          name="appId"
                          value={selectedAppId}
                        />
                        <input
                          type="hidden"
                          name="envId"
                          value={selectedEnvId}
                        />
                        <input
                          type="hidden"
                          name="companyId"
                          value={companyId}
                        />
                        <input type="hidden" name="flagKey" value={flag.key} />
                        <input
                          type="hidden"
                          name="nextValue"
                          value={String(!flag.value)}
                        />
                        <button type="submit">
                          {flag.value ? "Turn off" : "Turn on"}
                        </button>
                      </form>
                    )}
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

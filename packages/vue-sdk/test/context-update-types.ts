import type {
  CompanyContext,
  ContextValue,
  UserContext,
} from "@reflag/browser-sdk";
import {
  ReflagProps,
  useClient,
  useUpdateCompany,
  useUpdateOtherContext,
  useUpdateUser,
} from "@reflag/vue-sdk";

export function ContextUpdateTypes() {
  const client = useClient();
  const updateUser = useUpdateUser();
  const updateCompany = useUpdateCompany();
  const updateOtherContext = useUpdateOtherContext();
  const user: UserContext = {
    id: "user-1",
    enabled: true,
    tags: ["beta", 1, null],
    preferences: { theme: "dark", omitted: undefined },
    cleared: null,
  };
  const company: CompanyContext = { ...user, id: "company-1" };
  const other: Record<string, ContextValue> = {
    preview: true,
    settings: { locale: "en" },
  };

  void client.updateUser(user);
  void client.updateCompany(company);
  void client.updateOtherContext(other);
  void updateUser(user);
  void updateCompany(company);
  void updateOtherContext(other);
  void updateUser({ enabled: false });
  void updateCompany({ tags: ["enterprise"] });

  const options: ReflagProps = {
    publishableKey: "test-key",
    otherContext: other,
  };
  void options;

  // @ts-expect-error user IDs must remain strings or numbers
  void client.updateUser({ id: true });
  // @ts-expect-error company IDs must remain strings or numbers
  void updateCompany({ id: { nested: "id" } });
  // @ts-expect-error context values must be JSON-compatible
  void updateUser({ callback: () => true });
  // @ts-expect-error undefined array entries are not JSON context values
  void updateOtherContext({ tags: [undefined] });

  return updateUser;
}

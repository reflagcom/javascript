/**
 * Context is a set of key-value pairs.
 * This is used to determine if feature targeting matches and to track events.
 * Id should always be present so that it can be referenced to an existing company.
 */
export interface CompanyContext {
  /**
   * Company id
   */
  id: string | number | undefined;

  /**
   * Company name
   */
  name?: string | undefined;

  /**
   * Other company attributes
   */
  [key: string]: string | number | undefined;
}

/**
 * Context is a set of key-value pairs.
 * This is used to determine if feature targeting matches and to track events.
 * Id should always be present so that it can be referenced to an existing user.
 */
export interface UserContext {
  /**
   * User id
   */
  id: string | number | undefined;

  /**
   * User name
   */
  name?: string | undefined;

  /**
   * User email
   */
  email?: string | undefined;

  /**
   * Other user attributes
   */
  [key: string]: string | number | undefined;
}

/**
 * Context is a set of key-value pairs.
 * This is used to determine if feature targeting matches and to track events.
 */
export interface ReflagContext {
  /**
   * Company related context. If you provide `id` Reflag will enrich the evaluation context with
   * company attributes on Reflag servers.
   */
  company?: CompanyContext;

  /**
   * User related context. If you provide `id` Reflag will enrich the evaluation context with
   * user attributes on Reflag servers.
   */
  user?: UserContext;

  /**
   * Context which is not related to a user or a company.
   */
  other?: Record<string, string | number | undefined>;
}

/**
 * @deprecated Use `ReflagContext` instead, this interface will be removed in the next major version
 * @internal
 */
export interface ReflagDeprecatedContext extends ReflagContext {
  /**
   * Context which is not related to a user or a company.
   * @deprecated Use `other` instead, this property will be removed in the next major version
   */
  otherContext?: Record<string, string | number | undefined>;
}

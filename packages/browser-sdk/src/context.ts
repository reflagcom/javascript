/**
 * Context is a set of key-value pairs.
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

export interface ReflagContext {
  /**
   * Company related context
   */
  company?: CompanyContext;

  /**
   * User related context
   */
  user?: UserContext;

  /**
   * Context which is not related to a user or a company
   */
  otherContext?: Record<string, string | number | undefined>;
}

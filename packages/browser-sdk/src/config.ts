import { version } from "../package.json";

export const API_BASE_URL = "https://front.reflag.com";
export const APP_BASE_URL = "https://app.reflag.com";
export const SSE_REALTIME_BASE_URL = "https://livemessaging.bucket.co";

export const SDK_VERSION_HEADER_NAME = "reflag-sdk-version";

export const SDK_VERSION = `browser-sdk/${version}`;
export const FLAG_EVENTS_PER_MIN = 1;
export const FLAGS_EXPIRE_MS = 30 * 24 * 60 * 60 * 1000; // expire entirely after 30 days

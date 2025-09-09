import { ReflagClient, CheckEvent, RawFlags } from "../../src";

const urlParams = new URLSearchParams(window?.location?.search);
const publishableKey = urlParams.get("publishableKey");
const flagKey = urlParams.get("flagKey") ?? "huddles";

if (!publishableKey) {
  throw Error("publishableKey is missing");
}

const reflag = new ReflagClient({
  publishableKey,
  user: { id: "42" },
  company: { id: "1" },
  toolbar: {
    show: true,
    position: { placement: "bottom-right" },
  },
});

document
  .getElementById("startHuddle")
  ?.addEventListener("click", () => reflag.track(flagKey));
document.getElementById("giveFeedback")?.addEventListener("click", (event) =>
  reflag.requestFeedback({
    flagKey,
    position: { type: "POPOVER", anchor: event.currentTarget as HTMLElement },
  }),
);

reflag.initialize().then(() => {
  console.log("Reflag initialized");
  const loadingElem = document.getElementById("loading");
  if (loadingElem) loadingElem.style.display = "none";
});

reflag.on("flagsUpdated", (flags: RawFlags) => {
  const { isEnabled } = flags[flagKey];

  const startHuddleElem = document.getElementById("start-huddle");
  if (isEnabled) {
    // show the start-huddle button
    if (startHuddleElem) startHuddleElem.style.display = "block";
  } else {
    // hide the start-huddle button
    if (startHuddleElem) startHuddleElem.style.display = "none";
  }
});

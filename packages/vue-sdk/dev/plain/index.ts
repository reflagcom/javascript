import { createApp } from "vue";

import App from "./App.vue";

const el = document.getElementById("app");

if (el) {
  const app = createApp(App);
  app.mount(el);
}

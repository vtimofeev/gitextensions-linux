import { createApp } from "vue";
import PrimeVue from "primevue/config";
import "primeicons/primeicons.css";
import "./theme/tokens.scss";
import "./theme/base.scss";
import { AppPreset } from "./theme/primevue";
import { container } from "./store/container";
import App from "./App.vue";
const app = createApp(App);
app.config.globalProperties.$t = container.i18n.t.bind(container.i18n);
app.use(PrimeVue, {
  theme: {
    preset: AppPreset,
    options: { darkModeSelector: ".app-theme-dark" },
  },
});
container.preferences.applyTheme();
app.mount("#app");

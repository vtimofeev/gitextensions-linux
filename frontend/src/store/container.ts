import { Review } from "./review";
import { markRaw, reactive } from "vue";
import { GitApi } from "../api/git-api";
import { Repository } from "./repository";
import { Preferences } from "./preferences";
import { I18n } from "../i18n/i18n";
export class Container {
  readonly api = markRaw(new GitApi());
  readonly preferences = reactive(new Preferences());
  readonly repository = reactive(new Repository(this.api, this.preferences));
  readonly review = reactive(new Review(this.api, this.preferences));
  readonly i18n = new I18n(this.preferences);
  constructor() {
    this.repository.translate = this.i18n.t.bind(this.i18n);
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () =>
      this.preferences.applyTheme(),
    );
  }
}
export const container = new Container();

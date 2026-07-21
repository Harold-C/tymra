import { assertActionAllowed, createReadOnlyActionPolicy } from "./action-policy.js";

const DEFAULT_VIEWPORT = Object.freeze({
  width: 1280,
  height: 900,
  deviceScaleFactor: 1,
  screenWidth: 1280,
  screenHeight: 900,
});

export class UlixeeBrowserSession {
  constructor({ coreUrl = "ws://127.0.0.1:1818", headed = true, viewport = DEFAULT_VIEWPORT, sessionDbDirectory, userProfile = null, onProfileExport = null, hero, heroModule } = {}) {
    this.coreUrl = coreUrl;
    this.headed = headed;
    this.viewport = viewport;
    this.sessionDbDirectory = sessionDbDirectory;
    this.userProfile = userProfile;
    this.onProfileExport = onProfileExport;
    this.hero = hero;
    this.heroModule = heroModule;
    this.policy = createReadOnlyActionPolicy();
  }

  async ensureHero() {
    if (this.hero) return this.hero;
    const module = this.heroModule ?? await import("@ulixee/hero");
    const Hero = module.default;
    const { ConnectionToHeroCore } = module;
    this.hero = new Hero({
      connectionToCore: ConnectionToHeroCore.remote(this.coreUrl),
      noChromeSandbox: true,
      showChrome: this.headed,
      showChromeAlive: false,
      sessionKeepAlive: false,
      viewport: this.viewport,
      userProfile: this.userProfile || undefined,
      sessionPersistence: true,
      sessionDbDirectory: this.sessionDbDirectory,
    });
    return this.hero;
  }

  async openUrl(url, { timeoutMs = 30_000 } = {}) {
    assertActionAllowed("open_url", this.policy);
    const hero = await this.ensureHero();
    await hero.goto(url, { timeoutMs });
  }

  async waitForPageReady({ timeoutMs = 30_000 } = {}) {
    assertActionAllowed("wait_for_page_ready", this.policy);
    const hero = await this.ensureHero();
    await hero.waitForLoad("PaintingStable", { timeoutMs }).catch(() => {});
  }

  async captureScreenshot({ fullPage = true } = {}) {
    assertActionAllowed("capture_screenshot", this.policy);
    return (await this.ensureHero()).takeScreenshot({ format: "png", fullPage });
  }

  async captureHtml() {
    assertActionAllowed("capture_html", this.policy);
    const hero = await this.ensureHero();
    const root = await hero.document.documentElement;
    return root ? String(await root.outerHTML || "") : "";
  }

  async getTitle() {
    assertActionAllowed("get_title", this.policy);
    return String(await (await this.ensureHero()).document.title || "");
  }

  async getUrl() {
    assertActionAllowed("get_url", this.policy);
    return String(await (await this.ensureHero()).url || "");
  }

  async persistSuccessfulProfile() {
    if (!this.onProfileExport) return { saved: false };
    const hero = await this.ensureHero();
    if (typeof hero.exportUserProfile !== "function") return { saved: false };
    await this.onProfileExport(await hero.exportUserProfile());
    return { saved: true };
  }

  async close() {
    if (!this.hero) return;
    assertActionAllowed("close", this.policy);
    await Promise.race([
      this.hero.close().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    this.hero = null;
  }
}

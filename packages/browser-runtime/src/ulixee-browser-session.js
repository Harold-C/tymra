import { assertActionAllowed, createReadOnlyActionPolicy } from "./action-policy.js";

const DEFAULT_VIEWPORT = Object.freeze({
  width: 1280,
  height: 900,
  deviceScaleFactor: 1,
  screenWidth: 1280,
  screenHeight: 900,
});

export class UlixeeBrowserSession {
  constructor({ coreUrl = "ws://127.0.0.1:1818", headed = true, viewport = DEFAULT_VIEWPORT, sessionDbDirectory, userProfile = null, onProfileExport = null, blockedResourceTypes, blockedResourceUrls, hero, heroModule } = {}) {
    this.coreUrl = coreUrl;
    this.headed = headed;
    this.viewport = viewport;
    this.sessionDbDirectory = sessionDbDirectory;
    this.userProfile = userProfile;
    this.onProfileExport = onProfileExport;
    this.blockedResourceTypes = blockedResourceTypes;
    this.blockedResourceUrls = blockedResourceUrls;
    this.hero = hero;
    this.connectionToCore = null;
    this.heroModule = heroModule;
    this.policy = createReadOnlyActionPolicy();
  }

  async ensureHero() {
    if (this.hero) return this.hero;
    const module = this.heroModule ?? await import("@ulixee/hero");
    const Hero = module.default;
    this.connectionToCore = module.ConnectionToHeroCore.remote(this.coreUrl);
    this.hero = new Hero({
      connectionToCore: this.connectionToCore,
      noChromeSandbox: true,
      showChrome: this.headed,
      showChromeAlive: false,
      sessionKeepAlive: false,
      viewport: this.viewport,
      userProfile: this.userProfile || undefined,
      blockedResourceTypes: this.blockedResourceTypes,
      blockedResourceUrls: this.blockedResourceUrls,
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
    // Ulixee alpha closes the server socket while handling Core.disconnect,
    // then attempts to send its response on that closing socket. Once the Hero
    // session is closed, terminate the owned transport directly to avoid that
    // server-side unhandled rejection.
    if (this.connectionToCore?.transport?.disconnect) {
      this.connectionToCore.transport.disconnect();
    } else {
      await Promise.race([
        this.connectionToCore?.disconnect?.().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
    this.hero = null;
    this.connectionToCore = null;
  }
}

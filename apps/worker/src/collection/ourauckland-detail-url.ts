export function isOurAucklandDetailUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname.toLowerCase() === "ourauckland.aucklandcouncil.govt.nz"
      && url.port === "" && url.username === "" && url.password === ""
      && url.search === "" && url.hash === ""
      && /^\/events\/20\d{2}\/\d{2}\/[^/]+\/?$/u.test(url.pathname);
  } catch {
    return false;
  }
}

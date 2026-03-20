/**
 * Gecko-based browsers (Firefox, Zen, LibreWolf, etc.) often need gentler WebGL settings and
 * can fail compiling/linking some custom ShaderMaterials that work in Chromium.
 */
export function isFirefoxFamilyBrowser() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/Seamonkey\//i.test(ua)) return false
  if (
    /Firefox\//i.test(ua) ||
    /\bZen\b/i.test(ua) ||
    /LibreWolf/i.test(ua) ||
    /Waterfox/i.test(ua) ||
    /Floorp\//i.test(ua)
  ) {
    return true
  }
  // Some Gecko builds (incl. certain Zen profiles) match Firefox’s rv:+Gecko pattern but omit “Firefox/”.
  if (
    /rv:[0-9.]+/i.test(ua) &&
    /Gecko\/[0-9]+/i.test(ua) &&
    !/Chrome\/[0-9]/i.test(ua) &&
    !/Chromium\/[0-9]/i.test(ua)
  ) {
    return true
  }
  return false
}

// Downloaded from the OneSignal dashboard, not written here. Left as delivered.
//
// THE FILENAME IS PART OF THE CONTRACT. OneSignal's Web SDK registers a service worker at
// `/OneSignalSDKWorker.js` on the site's own origin, and a browser will only accept a push
// subscription for a worker it can actually fetch. Renaming or moving this file breaks push
// silently — the app still loads, the SDK still initialises, and nothing ever arrives.
//
// It lives in `public/` because Vite copies that directory to the site root verbatim, which is
// the one place the SDK looks. Bundling it through `src/` would give it a hashed filename.
//
// A service worker is required for web push at all: notifications have to be received while the
// page is closed, which is the only thing a worker can do that a page cannot. This one does
// nothing else — deliberately no offline asset caching, because the app already works offline
// through localStorage and a caching worker would only add a way to serve a stale bundle.
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

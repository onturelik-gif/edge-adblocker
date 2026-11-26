/* EdgeShield Stealth AdSense Stub */
(function () {
  try {
    window.canRunAds = true;
    window.isAdBlockActive = false;
    window.adblockDetected = false;
    var ads = window.adsbygoogle || [];
    ads.loaded = true;
    ads.push = function () {
      return 0;
    };
    window.adsbygoogle = ads;
  } catch (e) {}
})();

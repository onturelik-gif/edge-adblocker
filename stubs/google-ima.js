/* EdgeShield Stealth Google IMA3 SDK Stub */
(function () {
  try {
    window.google = window.google || {};

    var AdEvent = {
      Type: {
        LOADED: "loaded",
        STARTED: "start",
        FIRST_QUARTILE: "firstQuartile",
        MIDPOINT: "midpoint",
        THIRD_QUARTILE: "thirdQuartile",
        COMPLETE: "complete",
        ALL_ADS_COMPLETED: "allAdsCompleted",
        CONTENT_PAUSE_REQUESTED: "contentPauseRequested",
        CONTENT_RESUME_REQUESTED: "contentResumeRequested",
        SKIPPED: "skip",
        PAUSED: "pause",
        RESUMED: "resume",
        CLICK: "click",
        IMPRESSION: "impression",
        AD_BREAK_READY: "adBreakReady",
        AD_METADATA: "adMetadata",
        LOG: "log"
      }
    };

    var AdErrorEvent = {
      Type: {
        AD_ERROR: "adError"
      }
    };

    var AdsManagerLoadedEvent = {
      Type: {
        ADS_MANAGER_LOADED: "adsManagerLoaded"
      }
    };

    var ViewMode = {
      NORMAL: "normal",
      FULLSCREEN: "fullscreen"
    };

    var OmidAccessMode = {
      FULL: "full",
      DOMAIN: "domain",
      LIMITED: "limited"
    };

    var UiElements = {
      AD_ATTRIBUTION: "adAttribution",
      COUNTDOWN: "countdown"
    };

    function ImaSdkSettings() {
      this._locale = "en";
      this._vpaidMode = ImaSdkSettings.VpaidMode.ENABLED;
      this._autoPlayAdBreaks = true;
      this._numRedirects = 4;
      this._playerType = "";
      this._playerVersion = "";
      this._companionBackfill = "always";
    }
    ImaSdkSettings.VpaidMode = {
      DISABLED: 0,
      ENABLED: 1,
      INSECURE: 2
    };
    ImaSdkSettings.prototype.setLocale = function (locale) {
      this._locale = locale;
    };
    ImaSdkSettings.prototype.setVpaidMode = function (mode) {
      this._vpaidMode = mode;
    };
    ImaSdkSettings.prototype.setAutoPlayAdBreaks = function (val) {
      this._autoPlayAdBreaks = Boolean(val);
    };
    ImaSdkSettings.prototype.setDisableCustomPlaybackForIOS10Plus = function () {};
    ImaSdkSettings.prototype.setNumRedirects = function (num) {
      this._numRedirects = num;
    };
    ImaSdkSettings.prototype.setPlayerType = function (type) {
      this._playerType = type;
    };
    ImaSdkSettings.prototype.setPlayerVersion = function (ver) {
      this._playerVersion = ver;
    };
    ImaSdkSettings.prototype.getCompanionBackfill = function () {
      return this._companionBackfill;
    };
    ImaSdkSettings.prototype.setCompanionBackfill = function (mode) {
      this._companionBackfill = mode;
    };

    var sharedSettings = new ImaSdkSettings();

    function AdDisplayContainer(container, video) {
      this._container = container || null;
      this._video = video || null;
    }
    AdDisplayContainer.prototype.initialize = function () {};
    AdDisplayContainer.prototype.destroy = function () {};

    function AdsRenderingSettings() {
      this.restoreCustomPlaybackStateOnAdBreakComplete = true;
      this.enablePreloading = false;
    }

    function AdsRequest() {
      this.adTagUrl = "";
    }
    AdsRequest.prototype.setAdWillAutoPlay = function () {};
    AdsRequest.prototype.setAdWillPlayMuted = function () {};
    AdsRequest.prototype.setContinuousPlayback = function () {};

    function AdError(message) {
      this._message = message || "Ad blocked";
    }
    AdError.prototype.getMessage = function () {
      return this._message;
    };
    AdError.prototype.getErrorCode = function () {
      return 1009;
    };
    AdError.prototype.getType = function () {
      return "adPlayError";
    };
    AdError.prototype.getVastErrorCode = function () {
      return 303;
    };

    function createEmitter() {
      var listeners = {};
      return {
        addEventListener: function (type, handler) {
          if (typeof handler !== "function") return;
          if (!listeners[type]) listeners[type] = [];
          if (listeners[type].indexOf(handler) === -1) {
            listeners[type].push(handler);
          }
        },
        removeEventListener: function (type, handler) {
          if (!listeners[type]) return;
          listeners[type] = listeners[type].filter(function (fn) {
            return fn !== handler;
          });
        },
        emit: function (type, eventObj) {
          var list = listeners[type];
          if (!list) return;
          list.slice().forEach(function (fn) {
            try {
              fn(eventObj);
            } catch (e) {}
          });
        }
      };
    }

    function AdsManager() {
      this._emitter = createEmitter();
      this._volume = 1;
    }
    AdsManager.prototype.addEventListener = function (type, handler) {
      this._emitter.addEventListener(type, handler);
    };
    AdsManager.prototype.removeEventListener = function (type, handler) {
      this._emitter.removeEventListener(type, handler);
    };
    AdsManager.prototype.init = function () {};
    AdsManager.prototype.start = function () {};
    AdsManager.prototype.stop = function () {};
    AdsManager.prototype.pause = function () {};
    AdsManager.prototype.resume = function () {};
    AdsManager.prototype.resize = function () {};
    AdsManager.prototype.destroy = function () {};
    AdsManager.prototype.skip = function () {};
    AdsManager.prototype.collapse = function () {};
    AdsManager.prototype.getRemainingTime = function () {
      return 0;
    };
    AdsManager.prototype.getVolume = function () {
      return this._volume;
    };
    AdsManager.prototype.setVolume = function (vol) {
      this._volume = vol;
    };
    AdsManager.prototype.getCuePoints = function () {
      return [];
    };
    AdsManager.prototype.isCustomClickTrackingUsed = function () {
      return false;
    };
    AdsManager.prototype.isCustomPlaybackUsed = function () {
      return false;
    };
    AdsManager.prototype.updateAdsRenderingSettings = function () {};

    function AdsLoader(adDisplayContainer) {
      this._adDisplayContainer = adDisplayContainer || null;
      this._emitter = createEmitter();
    }
    AdsLoader.prototype.addEventListener = function (type, handler) {
      this._emitter.addEventListener(type, handler);
    };
    AdsLoader.prototype.removeEventListener = function (type, handler) {
      this._emitter.removeEventListener(type, handler);
    };
    AdsLoader.prototype.getSettings = function () {
      return sharedSettings;
    };
    AdsLoader.prototype.contentComplete = function () {};
    AdsLoader.prototype.destroy = function () {};
    AdsLoader.prototype.requestAds = function () {
      var emitter = this._emitter;
      setTimeout(function () {
        emitter.emit(AdErrorEvent.Type.AD_ERROR, {
          getError: function () {
            return new AdError("Ad blocked");
          }
        });
      }, 10);
    };

    window.google.ima = {
      VERSION: "3.600.0",
      AdEvent: AdEvent,
      AdErrorEvent: AdErrorEvent,
      AdsManagerLoadedEvent: AdsManagerLoadedEvent,
      ViewMode: ViewMode,
      OmidAccessMode: OmidAccessMode,
      UiElements: UiElements,
      ImaSdkSettings: ImaSdkSettings,
      settings: sharedSettings,
      AdDisplayContainer: AdDisplayContainer,
      AdsRenderingSettings: AdsRenderingSettings,
      AdsRequest: AdsRequest,
      AdError: AdError,
      AdsManager: AdsManager,
      AdsLoader: AdsLoader
    };
  } catch (e) {}
})();

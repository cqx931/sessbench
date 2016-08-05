/*******************************************************************************

    sessbench - a Chromium browser extension to benchmark browser session.
    Copyright (C) 2013  Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/sessbench

    TODO: cleanup/refactor
*/

/******************************************************************************/

(function () {

  /******************************************************************************/

  var SessBench = {
    manifest: chrome.runtime.getManifest(),

    // session state can be:
    // {empty} = no ongoing session
    // 'loading'
    // 'waiting'
    state: '',
    portName: '',
    tabId: 0,
    pageLoadCompletedTimeoutTimer: null,
    pageLoadCompletedTimeout: 20 * 1000, // 20s after navigating to the page

    playlistRaw: '',
    playlist: [],
    playlistPtr: 0,
    repeat: 1,
    wait: 1,
    sessionLoadTime: 0,
    URLCount: 0,
    sessionBandwidth: 0,
    networkCount: 0,
    cacheCount: 0,
    blockCount: 0,

    firstPartyRequestCount: 0,
    firstPartyDomainCount: 0,
    firstPartyHostCount: 0,
    firstPartyScriptCount: 0,
    firstPartyCookieSentCount: 0,
    thirdPartyRequestCount: 0,
    thirdPartyDomainCount: 0,
    thirdPartyHostCount: 0,
    thirdPartyScriptCount: 0,
    thirdPartyCookieSentCount: 0,
    firstPartyDomains: [],
    thirdPartyDomains: [],
    firstPartyHosts: [],
    thirdPartyHosts: [],
    failedURLs: [],

    repeatCountdown: 0,
    resultStack: [],

    pageURL: '',

    devtoolPorts: {},
    portCount: 0,

    // adn
    adCount: 0,
    adNauseamId: "membmphhaahcgobalfjakpmgoccehdlp",
    adNauseamDisabled: false,

    // so that I don't have to care for last comma
    dummy: 0
  };

  /******************************************************************************/

  function startBenchmark(request, portName) {

    var sess = SessBench;

    if (sess.state !== '') {
      return;
    }
    sess.portName = portName;
    sess.tabId = request.tabId;
    parsePlaylist(request.playlistRaw);
    sess.devtoolPorts[sess.portName].postMessage({
      what: 'benchmarkStarted'
    });
    startSession();
  }

  function stopBenchmark() {
    var sess = SessBench;
    if (sess.state === '') {
      return;
    }
    sess.state = '';
    results = processResults(sess.resultStack);
    results.what = 'benchmarkCompleted';
    sess.devtoolPorts[sess.portName].postMessage(results);
  }

  /******************************************************************************/

  function startSession(request, portName) {
    var sess = SessBench;
    initSession();
    sess.devtoolPorts[sess.portName].postMessage({
      what: 'sessionStarted'
    });
    executePlaylist();
  }

  function initSession() {
    var sess = SessBench;
    sess.playlistPtr = 0;
    sess.resultStack = [];
    sess.repeatCountdown = sess.repeat;
    sess.state = 'waiting';
  }

  function stopSession() {
    var sess = SessBench;
    if (sess.state !== 'waiting') {
      return;
    }
    var results = {
      time: sess.sessionLoadTime,
      URLCount: sess.URLCount,
      bandwidth: sess.sessionBandwidth,
      networkCount: sess.networkCount,
      cacheCount: sess.cacheCount,
      blockCount: sess.blockCount,
      firstPartyRequestCount: sess.firstPartyRequestCount,
      firstPartyDomainCount: sess.firstPartyDomainCount,
      firstPartyHostCount: sess.firstPartyHostCount,
      firstPartyScriptCount: sess.firstPartyScriptCount,
      firstPartyCookieSentCount: sess.firstPartyCookieSentCount,
      thirdPartyRequestCount: sess.thirdPartyRequestCount,
      thirdPartyDomainCount: sess.thirdPartyDomainCount,
      thirdPartyHostCount: sess.thirdPartyHostCount,
      thirdPartyScriptCount: sess.thirdPartyScriptCount,
      thirdPartyCookieSentCount: sess.thirdPartyCookieSentCount,
      firstPartyDomains: sess.firstPartyDomains,
      thirdPartyDomains: sess.thirdPartyDomains,
      firstPartyHosts: sess.firstPartyHosts,
      thirdPartyHosts: sess.thirdPartyHosts,
      failedURLs: sess.failedURLs,

      adCount: sess.adCount // adn
    };
    sess.resultStack.push(results);
    results = processResults(sess.resultStack);
    sess.devtoolPorts[sess.portName].postMessage(results);
    sess.repeatCountdown--;
    if (sess.repeatCountdown) {
      sess.playlistPtr = 0;
      wait(0);
      return;
    }
    sess.state = '';
    sess.devtoolPorts[sess.portName].postMessage({
      what: 'benchmarkCompleted'
    });
  }

  /******************************************************************************/

  function processResults(entries) {

    var uniqueValuesFromValues = function (aa) {
      var map = {};
      var i = aa.length;
      while (i--) {
        map[aa[i]] = true;
      }
      return Object.keys(map).sort();
    };

    var n = entries.length,
      i = n;
    var results = {
      what: 'sessionCompleted',
      repeatCount: n,
      time: 0,
      URLCount: 0,
      bandwidth: 0,
      networkCount: 0,
      cacheCount: 0,
      blockCount: 0,
      firstPartyRequestCount: 0,
      firstPartyDomainCount: 0,
      firstPartyHostCount: 0,
      firstPartyScriptCount: 0,
      firstPartyCookieSentCount: 0,
      thirdPartyRequestCount: 0,
      thirdPartyDomainCount: 0,
      thirdPartyHostCount: 0,
      thirdPartyScriptCount: 0,
      thirdPartyCookieSentCount: 0,
      firstPartyDomains: [],
      thirdPartyDomains: [],
      firstPartyHosts: [],
      thirdPartyHosts: [],
      failedURLs: [],
      adCount: 0
    };
    var entry;
    while (i--) {
      entry = entries[i];
      results.time += entry.time;
      results.URLCount += entry.URLCount;
      results.bandwidth += entry.bandwidth;
      results.networkCount += entry.networkCount;
      results.cacheCount += entry.cacheCount;
      results.blockCount += entry.blockCount;
      results.firstPartyRequestCount += entry.firstPartyRequestCount;
      results.firstPartyDomainCount += entry.firstPartyDomainCount;
      results.firstPartyHostCount += entry.firstPartyHostCount;
      results.firstPartyScriptCount += entry.firstPartyScriptCount;
      results.firstPartyCookieSentCount += entry.firstPartyCookieSentCount;
      results.thirdPartyRequestCount += entry.thirdPartyRequestCount;
      results.thirdPartyDomainCount += entry.thirdPartyDomainCount;
      results.thirdPartyHostCount += entry.thirdPartyHostCount;
      results.thirdPartyScriptCount += entry.thirdPartyScriptCount;
      results.thirdPartyCookieSentCount += entry.thirdPartyCookieSentCount;
      results.firstPartyDomains = results.firstPartyDomains.concat(entry.firstPartyDomains);
      results.thirdPartyDomains = results.thirdPartyDomains.concat(entry.thirdPartyDomains);
      results.firstPartyHosts = results.firstPartyHosts.concat(entry.firstPartyHosts);
      results.thirdPartyHosts = results.thirdPartyHosts.concat(entry.thirdPartyHosts);
      results.failedURLs = results.failedURLs.concat(entry.failedURLs);

      results.adCount += entry.adCount; // adn
    }
    if (n > 1) {
      results.time /= n;
      results.URLCount /= n;
      results.bandwidth /= n;
      results.networkCount /= n;
      results.cacheCount /= n;
      results.blockCount /= n;
      results.firstPartyRequestCount /= n;
      results.firstPartyDomainCount /= n;
      results.firstPartyHostCount /= n;
      results.firstPartyScriptCount /= n;
      results.firstPartyCookieSentCount /= n;
      results.thirdPartyRequestCount /= n;
      results.thirdPartyDomainCount /= n;
      results.thirdPartyHostCount /= n;
      results.thirdPartyScriptCount /= n;
      results.thirdPartyCookieSentCount /= n;
    }
    results.firstPartyDomains = uniqueValuesFromValues(results.firstPartyDomains);
    results.thirdPartyDomains = uniqueValuesFromValues(results.thirdPartyDomains);
    results.firstPartyHosts = uniqueValuesFromValues(results.firstPartyHosts);
    results.thirdPartyHosts = uniqueValuesFromValues(results.thirdPartyHosts);

    return results;
  }

  /******************************************************************************/

  function executePlaylist() {
    var sess = SessBench;

    if (sess.state === '') {
      return;
    }

    // wrap-up?
    if (sess.playlistPtr === sess.playlist.length) {
      stopSession();
      return;
    }

    // set-up?
    if (sess.playlistPtr === 0) {
      sess.sessionLoadTime = 0;
      sess.URLCount = 0;
      sess.sessionBandwidth = 0;
      sess.networkCount = 0;
      sess.cacheCount = 0;
      sess.blockCount = 0;
      sess.firstPartyRequestCount = 0;
      sess.firstPartyDomainCount = 0;
      sess.firstPartyHostCount = 0;
      sess.firstPartyScriptCount = 0;
      sess.firstPartyCookieSentCount = 0;
      sess.thirdPartyRequestCount = 0;
      sess.thirdPartyDomainCount = 0;
      sess.thirdPartyHostCount = 0;
      sess.thirdPartyScriptCount = 0;
      sess.thirdPartyCookieSentCount = 0;
      sess.firstPartyDomains = [];
      sess.thirdPartyDomains = [];
      sess.firstPartyHosts = [];
      sess.thirdPartyHosts = [];
      sess.failedURLs = [];

      sess.adCount = 0; // adn
    }

    var entry;
    while (sess.playlistPtr < sess.playlist.length) {
      entry = sess.playlist[sess.playlistPtr];
      sess.playlistPtr++;

      if (entry.indexOf('repeat ') === 0) {
        continue;
      }

      if (entry.indexOf('wait ') === 0) {
        continue;
      }

      if (entry === 'clear cache') {
        clearCache();
        return;
      }

      if (entry === 'clear cookies') {
        clearCookies();
        return;
      }

      if (entry.indexOf('http') === 0) {
        pageStart(entry);
        return;
      }
    }

    wait(1);
  }

  /******************************************************************************/

  function wait(s) {
    setTimeout(waitCallback, s * 1000);
  }

  function waitCallback() {
    var sess = SessBench;
    if (sess.state === 'loading') {
      sess.state = 'waiting';
      getPageStats(sess.pageURL)
    } else {
      executePlaylist();
    }
  }

  /******************************************************************************/

  function clearCache() {
    chrome.browsingData.removeCache({
      since: 0
    }, clearCacheCallback);
  }

  function clearCacheCallback() {
    executePlaylist();
  }

  /******************************************************************************/

  function clearCookies() {
    chrome.browsingData.removeCookies({
      since: 0
    }, clearCookiesCallback);
  }

  function clearCookiesCallback() {
    executePlaylist();
  }

  /******************************************************************************/

  function pageStart(url) {

    var sess = SessBench;
    if (sess.adNauseamDisabled) {
      chrome.tabs.update(SessBench.tabId, {
        url: url
      });
      return;
    }

    chrome.runtime.sendMessage(sess.adNauseamId, {
        what: 'startTest',
        pageURL: url
      },
      function (result) {

        if (chrome.runtime.lastError === 'Could not establish connection. Receiving end does not exist.') {

          console.warn('AdNauseam not found: continuing...', chrome.runtime.lastError);
          sess.adNauseamDisabled = true;
          pageStart(url); // try again

        } else {

          chrome.tabs.update(SessBench.tabId, {
            url: url
          });
        }
      });
  }

  function pageLoadStartCallback(details) {
    if (details.frameId) {
      return;
    }
    var sess = SessBench;
    if (details.tabId !== sess.tabId) {
      return;
    }
    sess.pageURL = details.url;
    if (sess.state !== 'waiting') {
      return;
    }
    sess.state = 'loading';
    pageLoadCompletedTimeout();
  }

  function pageCommittedCallback(details) {
    if (details.frameId) {
      return;
    }
    var sess = SessBench;
    if (details.tabId !== sess.tabId) {
      return;
    }
    if (sess.state !== 'loading') {
      return;
    }
    sess.pageURL = details.url;
  }

  function pageLoadCompletedCallback(details) {
    if (details.frameId) {
      return;
    }
    var sess = SessBench;
    if (details.tabId !== sess.tabId) {
      return;
    }
    if (sess.pageLoadCompletedTimeoutTimer === null) {
      return;
    }
    if (sess.state !== 'loading') {
      return;
    }
    pageLoadCompletedTimeoutCancel();
    if (details.url !== sess.pageURL) {
      return;
    }
    // Time to wait before fetching page stats
    wait(sess.wait);
  }

  function pageLoadCompletedTimeoutCallback() {
    var sess = SessBench;
    // console.assert(sess.pageLoadCompletedTimeoutTimer !== null, 'pageLoadCompletedTimeoutCallback(): SessBench.pageLoadCompletedTimeoutTimer should not be null!');
    sess.pageLoadCompletedTimeoutTimer = null;
    if (sess.state !== 'loading') {
      return;
    }
    wait(sess.wait);
  }

  /******************************************************************************/

  function pageLoadCompletedTimeout() {
    var sess = SessBench;
    // console.assert(sess.pageLoadCompletedTimeoutTimer === null, 'pageLoadCompletedTimeout(): SessBench.pageLoadCompletedTimeoutTimer should be null!');
    sess.pageLoadCompletedTimeoutTimer = setTimeout(pageLoadCompletedTimeoutCallback, sess.pageLoadCompletedTimeout);
  }

  function pageLoadCompletedTimeoutCancel() {
    var sess = SessBench;
    if (sess.pageLoadCompletedTimeoutTimer) {
      clearTimeout(sess.pageLoadCompletedTimeoutTimer);
      sess.pageLoadCompletedTimeoutTimer = null;
    }
  }

  /******************************************************************************/

  function getPageStats(pageURL) {

    var sess = SessBench;

    // here we call adnauseam for ad count
    if (!sess.adNauseamDisabled) {

      chrome.runtime.sendMessage(sess.adNauseamId, {
          what: 'getAdCount',
          pageURL: pageURL
        },
        function (result) {

          if (chrome.runtime.lastError) {

            // 'Could not establish connection. Receiving end does not exist.'
            console.warn('AdNauseam not found: ', chrome.runtime.lastError.message);

            sess.adNauseamDisabled = true;

            getPageStats(pageURL); // try again

          } else {

            //console.log('GOT RESULT: ', result);

            sess.devtoolPorts[sess.portName].postMessage({
              what: 'getPageStats',
              pageURL: pageURL,
              adCount: result.count
            });
          }
        }
      );
    }

    // no AdNauseam found
    sess.devtoolPorts[sess.portName].postMessage({
      what: 'getPageStats',
      pageURL: pageURL,
      adCount: -1
    });
  }

  function getPageStatsCallback(details) {

    //console.log('getPageStatsCallback(%o) for %s', details, details.pageURL);

    // aggregate stats
    var sess = SessBench;

    // All went well?
    if (details.firstPartyDomainCount > 0) {
      sess.sessionLoadTime += details.loadTime;
      sess.URLCount++;
      sess.sessionBandwidth += details.bandwidth;
      sess.cacheCount += details.cacheCount;
      sess.blockCount += details.blockCount;
      sess.networkCount += details.networkCount;
      sess.firstPartyRequestCount += details.firstPartyRequestCount;
      sess.firstPartyDomainCount += details.firstPartyDomainCount;
      sess.firstPartyHostCount += details.firstPartyHostCount;
      sess.firstPartyScriptCount += details.firstPartyScriptCount;
      sess.firstPartyCookieSentCount += details.firstPartyCookieSentCount;
      sess.thirdPartyRequestCount += details.thirdPartyRequestCount;
      sess.thirdPartyDomainCount += details.thirdPartyDomainCount;
      sess.thirdPartyHostCount += details.thirdPartyHostCount;
      sess.thirdPartyScriptCount += details.thirdPartyScriptCount;
      sess.thirdPartyCookieSentCount += details.thirdPartyCookieSentCount;
      sess.firstPartyDomains = sess.firstPartyDomains.concat(details.firstPartyDomains);
      sess.thirdPartyDomains = sess.thirdPartyDomains.concat(details.thirdPartyDomains);
      sess.firstPartyHosts = sess.firstPartyHosts.concat(details.firstPartyHosts);
      sess.thirdPartyHosts = sess.thirdPartyHosts.concat(details.thirdPartyHosts);

      sess.adCount += details.adCount; // adn

    } else {
      sess.failedURLs.push(details.pageURL);
    }
    executePlaylist();
  }

  /******************************************************************************/

  function onPortMessageHandler(request, port) {
    if (!request || !request.what) {
      return;
    }
    switch (request.what) {

    case 'getPlaylist':
      port.postMessage({
        what: 'playlist',
        playlist: SessBench.playlist
      });
      break;

    case 'startBenchmark':
      startBenchmark(request, port.name);
      break;

    case 'stopBenchmark':
      stopBenchmark(request, port.name);
      break;

    case 'pageStats':
      getPageStatsCallback(request);
      break;

    default:
      break;
    }
  }

  /******************************************************************************/

  function startPageListeners() {
    chrome.webNavigation.onBeforeNavigate.addListener(pageLoadStartCallback);
    chrome.webNavigation.onCommitted.addListener(pageCommittedCallback);
    chrome.webNavigation.onCompleted.addListener(pageLoadCompletedCallback);
  }

  function stopPageListeners() {
    chrome.webNavigation.onBeforeNavigate.removeListener(pageLoadStartCallback);
    chrome.webNavigation.onCommitted.removeListener(pageCommittedCallback);
    chrome.webNavigation.onCompleted.removeListener(pageLoadCompletedCallback);
  }

  /******************************************************************************/

  function onPortDisonnectHandler(port) {
    var sess = SessBench;
    var port = sess.devtoolPorts[port.name];
    if (port) {
      port.onMessage.removeListener(onPortMessageHandler);
      sess.portCount--;
      delete sess.devtoolPorts[port.name];
      if (sess.portCount === 0) {
        stopPageListeners();
      }
    }
  }

  function onPortConnectHandler(port) {
    var sess = SessBench;
    if (sess.devtoolPorts[port.name]) {
      return;
    }
    sess.devtoolPorts[port.name] = port;
    sess.portCount++;
    if (sess.portCount === 1) {
      startPageListeners();
    }
    port.onMessage.addListener(onPortMessageHandler);
    port.onDisconnect.addListener(onPortDisonnectHandler);
  }
  chrome.runtime.onConnect.addListener(onPortConnectHandler);

  /******************************************************************************/

  function parsePlaylist(text) {
    var sess = SessBench;
    sess.playlist = [];
    sess.playlistPtr = 0;
    sess.repeat = 1;
    sess.wait = 1;

    var lines = text.split(/\n+/);
    var n = lines.length;
    var pl = [];
    var plPtr = 0;
    var line, matches, x;
    for (var i = 0; i < n; i++) {
      line = lines[i].trim();

      // repeat directive valid only as first directive
      matches = line.match(/^repeat +(\d+)$/i);
      if (matches) {
        x = parseInt(matches[1], 10);
        if (isNaN(x)) {
          continue;
        }
        sess.repeat = Math.max(Math.min(x, 50), 1);
        sess.playlist[sess.playlistPtr] = 'repeat ' + sess.repeat;
        sess.playlistPtr++;
        continue;
      }

      // wait directive
      matches = line.match(/^wait +(\d+)$/i);
      if (matches) {
        x = parseInt(matches[1], 10);
        if (isNaN(x)) {
          continue;
        }
        sess.wait = Math.max(Math.min(x, 60), 1);
        sess.playlist[sess.playlistPtr] = 'wait ' + sess.wait;
        sess.playlistPtr++;
        continue;
      }

      // clear cache directive
      matches = line.match(/^clear +cache$/i);
      if (matches) {
        sess.playlist[sess.playlistPtr] = 'clear cache';
        sess.playlistPtr++;
        continue;
      }

      // clear cookies
      matches = line.match(/^clear +cookies$/i);
      if (matches) {
        sess.playlist[sess.playlistPtr] = 'clear cookies';
        sess.playlistPtr++;
        continue;
      }

      // URL directive
      matches = line.match(/^https?:\/\/[a-z0-9]/);
      if (matches) {
        sess.playlist[sess.playlistPtr] = line;
        sess.playlistPtr++;
        continue;
      }

      // Ignore whatever else
    }
  }

  /******************************************************************************/

})();

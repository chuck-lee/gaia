/* -*- Mode: js; js-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

// handle Wi-Fi settings
navigator.mozL10n.ready(function wifiDirectSettings() {
  var _ = navigator.mozL10n.get;

  var settings = window.navigator.mozSettings;
  if (!settings)
    return;

  var gWifiDirect = document.querySelector('#wifiDirect');
  var gWifiDirectCheckBox = document.querySelector('#wifiDirect-enabled input');
  var gWifiDirectInfoBlock = document.querySelector('#wifiDirect-desc');

  // toggle wifi on/off
  gWifiDirectCheckBox.onchange = function toggleWifiDirect() {
    settings.createLock().set({'wifi.wifidirect.enabled': this.checked});
  };

  var gWifiDirectManager = WifiHelper.getWifiDirectManager();

  gWifiDirectManager.onstatuschange = function onWifiDirectStatusChange(event) {
    dump("######## gaia:onWifiDirectStatusChange()\n");
    var req = gWifiDirectManager.getPeerList();
    req.onsuccess = function onGetPeerListSuccess() {
        var peerList = req.result;
        dump("######## gaia:onGetPeerListSuccess(), peerList = " + JSON.stringify(peerList) + "\n");
        gWifiDirectPeerList.setPeerList(peerList);
    };
  };

  gWifiDirectManager.onenabled = function onWifiDirectEnabled() {
    dump("######## gaia:onWifiDirectEnabled(), gWifiDirectManager.enabled=" + gWifiDirectManager.enabled + "\n");
    gWifiDirectPeerList.clear();
    gWifiDirectPeerList.startWifiDirectScan();
  };

  gWifiDirectManager.ondisabled = function onWifiDirectDisabled() {
    dump("######## gaia:onWifiDirectDisabled(), gWifiDirectManager.enabled=" + gWifiDirectManager.enabled + "\n");
  };

  gWifiDirectManager.onpeerinfoupdate = function onWifiDirectPeerInfoUpdate() {
    dump("######## gaia:onWifiDirectPeerInfoUpdate()\n");
    var req = gWifiDirectManager.getPeerList();
    req.onsuccess = function onGetPeerListSuccess() {
        var peerList = req.result;
        dump("######## gaia:onGetPeerListSuccess(), peerList = " + JSON.stringify(peerList) + "\n");
        gWifiDirectPeerList.setPeerList(peerList);
    };
  };

  function setMozSettingsWifiDirectEnabled(enabled) {
    gWifiDirectCheckBox.checked = enabled;
    if (enabled) {
      return;
    }
  }

  navigator.mozSetMessageHandler('wifidirect-pairing-request',
    function wifiDirect_gotPairingRequestMessage(message) {
      onRequestPairing(message);
    }
  );

  function onRequestPairing(evt) {
    var wps = null;
    switch (evt.wpsMethod) {
      case "PBC":
        if (confirm("Connect with " + evt.name + "?")) {
          wps = {
            method: "PBC"
          }
        }
        break;
      case "DISPLAY":
        wps = {
          method: "DISPLAY",
          pin: generateWpsPin()
        }
        break;
      case "KEYPAD":
        var pin = prompt("PIN");
        if (pin) {
          wps = {
            method: "KEYPAD",
            pin: pin
          };
        }
        break;
      default:
        break;
    }

    if (wps) {
      gWifiDirectManager.connect({
        address: evt.address,
        groupOwnerIntent: 1,
        wps: wps
      });

      if (wps.method === "DISPLAY") {
        alert("PIN: " + wps.pin);
      }
    }
  }

  var lastMozSettingWifiDirectEnabledValue = true;

  // register an observer to monitor wifi.enabled changes
  settings.addObserver('wifi.wifidirect.enabled', function(event) {
    dump("######## wifiDirect.js:wifi.wifidirect.enabled=" + event.settingValue +"\n");
    if (lastMozSettingWifiDirectEnabledValue == event.settingValue)
      return;

    lastMozSettingWifiDirectEnabledValue = event.settingValue;
    setMozSettingsWifiDirectEnabled(event.settingValue);

    var peerList = document.getElementById('wifiDirectPeerList');
    peerList.dataset.state = lastMozSettingWifiDirectEnabledValue ? "on" : "off";
  });

  // startup, update status
  var req = settings.createLock().get('wifi.wifidirect.enabled');
  req.onsuccess = function wf_getStatusSuccess() {
    lastMozSettingWifiDirectEnabledValue = req.result['wifi.wifidirect.enabled'];
    setMozSettingsWifiDirectEnabled(lastMozSettingWifiDirectEnabledValue);
  };

  function newPeerListItem(peerInfo, callback) {
    /**
     * A Wi-Fi list item has the following HTML structure:
     *   <li>
     *     <small> Network Security </small>
     *     <a [class="wifi-secure"]> Network SSID </a>
     *   </li>
     */

    // ssid
    var name = document.createElement('a');
    name.textContent = peerInfo.name;

    // supported authentication methods
    var mac = document.createElement('small');
    mac.textContent = peerInfo.connectState;

    // create list item
    var li = document.createElement('li');
    li.appendChild(mac);
    li.appendChild(name);

    // bind connection callback
    li.onclick = function() {
      callback(peerInfo);
    };
    return li;
  }

  function generateWpsPin() {
    var pin = "";
    for (var i = 0; i < 8; i++) {
      pin += Math.round(Math.random() * 10).toString();
    }
    return pin;
  }

  function toggleWifiDirectConnection(peerInfo) {
    if (peerInfo.connectState !== "available") {
      gWifiDirectManager.disconnect();
    } else {
      // Prefer PBC than DISPLAY than KEYPAD
      var wpsMethod = "", wpsPIN = generateWpsPin();
      for (wpsMethod in ["PBC", "DISPLAY", "KEYPAD"]) {
        if (peerInfo.wpsCapability.indexOf(wpsMethod))
          break;
      }

      gWifiDirectManager.connect({
        address: peerInfo.address,
        groupOwnerIntent: 1,
        wps: {
          method: wpsMethod,
          pin: wpsPIN
        }
      });

      if (wpsMethod === "DISPLAY") {
        alert("PIN: " + wpsPIN);
      }
    }
  }

  var gWifiDirectPeerList = (function wifiDirectPeerList(list) {
    var scanEnabling = false;
    var taggleWifiDirectScanItem = list.querySelector('li[data-state="on"]');

    taggleWifiDirectScanItem.onclick = function() {
      if (scanEnabling) {
        stopWifiDirectScan();
      } else {
        clear();
        startWifiDirectScan();
      }
    };

    // clear the network list
    function clear() {
      // remove all items except the text expl. and the "search again" button
      var peerItems = list.querySelectorAll('li:not([data-state])');
      var len = peerItems.length;
      for (var i = len - 1; i >= 0; i--) {
        list.removeChild(peerItems[i]);
      }

      list.dataset.state = lastMozSettingWifiDirectEnabledValue ? "on" : "off";
    }

    // scan wifi networks and display them in the list
    function startWifiDirectScan() {
      dump("######## WifiDirect.js:startWifiDirectScan(), Try to enable Direct Scan.\n");

      var req = gWifiDirectManager.enableScan();

      req.onsuccess = function onStartWifiDirectScanSuccess() {
        dump("# WifiDirect.js:startWifiDirectScan(), Wifi Direct Scan enabled.\n");
        document.getElementById('taggleWifiDirectPeerDiscovery').innerHTML = "Search Stop";
        scanEnabling = true;
      };

      req.onerror = function onStartWifiDirectScanError(error) {
        dump("######## WifiDirect.js:startWifiDirectScan(), Wifi Direct Scan enable failed.\n");
      };
    }

    function stopWifiDirectScan() {
      dump("######## WifiDirect.js:stopWifiDirectScan(), Try to disable Direct Scan.\n");

      var req = gWifiDirectManager.disableScan();

      req.onsuccess = function onStopWifiDirectScanSuccess() {
        dump("######## WifiDirect.js:stopWifiDirectScan(), Wifi Direct Scan disabled.\n");
        document.getElementById('taggleWifiDirectPeerDiscovery').innerHTML = "Search Start";
        scanEnabling = false;
      };

      req.onerror = function onStopWifiDirectScanError(error) {
        dump("######## WifiDirect.js:stopWifiDirectScan(), Wifi Direct Scan disable failed.\n");
      };
    }

    function setPeerList(peerList) {
      clear();
      dump("######## gaia:setPeerList(), peerList=" + JSON.stringify(peerList) + "\n");
      for (var i = 0; i < peerList.length; i++) {
        var peerInfo = peerList[i];
        dump("######## gaia:setPeerList(), peerInfo=" + JSON.stringify(peerInfo) + "\n");
        var listItem = newPeerListItem(peerInfo, toggleWifiDirectConnection);
        list.insertBefore(listItem, taggleWifiDirectScanItem);

        if (scanEnabling && peerInfo.connectState !== "available") {
          document.getElementById('taggleWifiDirectPeerDiscovery').innerHTML = "Search Start";
          scanEnabling = false;
        }
      }
    }

    // API
    return {
      clear: clear,
      startWifiDirectScan: startWifiDirectScan,
      stopWifiDirectScan: stopWifiDirectScan,
      setPeerList: setPeerList
    };
  }) (document.getElementById('wifiDirectPeerList'));
});

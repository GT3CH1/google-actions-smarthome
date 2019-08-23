/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

// Initializes the SmartHome.
function SmartHome() {
  document.addEventListener('DOMContentLoaded', function () {
    // Shortcuts to DOM Elements.
    this.denyButton = document.getElementById('demo-deny-button');
    this.userWelcome = document.getElementById('user-welcome');

    // Bind events.
    this.updateButton = document.getElementById('demo-washer-update');
    this.updateButton.addEventListener('click', this.updateState.bind(this));
    this.washer = document.getElementById('demo-washer');
    this.requestSync = document.getElementById('request-sync');
    this.requestSync.addEventListener('click', () => {
    //TODO:Implement click listener for request sync
    });

    this.initFirebase();
    this.initWasher();
  }.bind(this));
}

SmartHome.prototype.initFirebase = () => {
  // Initiates Firebase.
  console.log("Initialized Firebase");
};

SmartHome.prototype.initWasher = () => {
  console.log("Logged in as default user");
  this.uid = "123";
  this.smarthome.userWelcome.innerHTML = "Welcome user 123!";

  this.smarthome.handleData();
  this.smarthome.washer.style.display = "block";
}

SmartHome.prototype.setToken = (token) => {
  document.cookie = '__session=' + token + ';max-age=3600';
};

SmartHome.prototype.handleData = () => {
  let uid = this.uid;
  let elOnOff = document.getElementById('demo-washer-onOff');
  let elRunCycle = document.getElementById('demo-washer-runCycle');
  let elStartStopPaused = document.getElementById('demo-washer-startStopPaused');
  let elStartStopRunning = document.getElementById('demo-washer-startStopRunning');

  firebase.database().ref('/').child('washer').on("value", (snapshot) => {
    if (snapshot.exists()) {
      var washerState = snapshot.val();
      console.log(washerState)

      if (washerState.OnOff.on) elOnOff.MaterialSwitch.on();
      else elOnOff.MaterialSwitch.off();

      if (washerState.RunCycle.dummy) elRunCycle.MaterialSwitch.on();
      else elRunCycle.MaterialSwitch.off();

      if (washerState.StartStop.isPaused) elStartStopPaused.MaterialSwitch.on();
      else elStartStopPaused.MaterialSwitch.off();

      if (washerState.StartStop.isRunning) elStartStopRunning.MaterialSwitch.on();
      else elStartStopRunning.MaterialSwitch.off();

    }
  })
}

SmartHome.prototype.updateState = () => {
  let elOnOff = document.getElementById('demo-washer-onOff');
  let elRunCycle = document.getElementById('demo-washer-runCycle');
  let elStartStopPaused = document.getElementById('demo-washer-startStopPaused');
  let elStartStopRunning = document.getElementById('demo-washer-startStopRunning');

  let pkg = {
    OnOff: { on: elOnOff.classList.contains('is-checked') },
    RunCycle: { dummy: elRunCycle.classList.contains('is-checked') },
    StartStop: {
      isPaused: elStartStopPaused.classList.contains('is-checked'),
      isRunning: elStartStopRunning.classList.contains('is-checked')
    }
  };

  console.log(pkg);
  firebase.database().ref('/').child('washer').set(pkg);
}

// Load the SmartHome.
window.smarthome = new SmartHome();

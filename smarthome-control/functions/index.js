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

const functions = require('firebase-functions');
const {smarthome} = require('actions-on-google');
const {google} = require('googleapis');
const util = require('util');
const admin = require('firebase-admin');
// Initialize Firebase
admin.initializeApp();
const firebaseRef = admin.database().ref('/');

// Hardcoded user ID
const USER_ID = '123';

exports.login = functions.https.onRequest((request, response) => {
  if (request.method === 'GET') {
    functions.logger.log('Requesting login page');
    response.send(`
    <html>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <body>
        <form action="/login" method="post">
          <input type="hidden"
            name="responseurl" value="${request.query.responseurl}" />
          <button type="submit" style="font-size:14pt">
            Link this service to Google
          </button>
        </form>
      </body>
    </html>
  `);
  } else if (request.method === 'POST') {
    // Here, you should validate the user account.
    // In this sample, we do not do that.
    const responseurl = decodeURIComponent(request.body.responseurl);
    functions.logger.log(`Redirect to ${responseurl}`);
    return response.redirect(responseurl);
  } else {
    // Unsupported method
    response.send(405, 'Method Not Allowed');
  }
});


exports.fakeauth = functions.https.onRequest((request, response) => {
  const responseurl = util.format('%s?code=%s&state=%s',
      decodeURIComponent(request.query.redirect_uri), 'xxxxxx',
      request.query.state);
  functions.logger.log(`Set redirect as ${responseurl}`);
  return response.redirect(
      `/login?responseurl=${encodeURIComponent(responseurl)}`);
});

exports.faketoken = functions.https.onRequest((request, response) => {
  const grantType = request.query.grant_type ?
    request.query.grant_type : request.body.grant_type;
  const secondsInDay = 86400; // 60 * 60 * 24
  const HTTP_STATUS_OK = 200;
  functions.logger.log(`Grant type ${grantType}`);

  let obj;
  if (grantType === 'authorization_code') {
    obj = {
      token_type: 'bearer',
      access_token: '123access',
      refresh_token: '123refresh',
      expires_in: secondsInDay,
    };
  } else if (grantType === 'refresh_token') {
    obj = {
      token_type: 'bearer',
      access_token: '123access',
      expires_in: secondsInDay,
    };
  }
  response.status(HTTP_STATUS_OK)
      .json(obj);
});

let jwt
try {
    jwt = require('./serviceAccountKey.json')
} catch (e) {
  functions.logger.warn('Service account key is not found')
  functions.logger.warn('Report state and Request sync will be unavailable')
}

const app = smarthome({
    jwt: jwt,
    debug: true,
})

let devicelist
devicelist = require('./devices.json')
const deviceitems = JSON.parse(JSON.stringify(devicelist));

var devicecounter;

app.onSync((body) => {
    console.log('onSync');
    for (devicecounter = 0; devicecounter < deviceitems.length; devicecounter++) {
      let currDevice = deviceitems[devicecounter];
      if (currDevice.traits.includes('action.devices.traits.OnOff')) {
            firebaseRef.child(currDevice.id).child('OnOff').update({on: false, remote: false});
        }
        if (currDevice.traits.includes('action.devices.traits.Reboot')) {
            firebaseRef.child(currDevice.id).child('RebootNow').update({reboot: false});
        }
        if (currDevice.traits.includes('action.devices.traits.Brightness')) {
            firebaseRef.child(currDevice.id).child('Brightness').update({brightness: 10});
        }
        if (currDevice.traits.includes('action.devices.traits.OpenClose')) {
            firebaseRef.child(currDevice.id).child('OpenClose').update({openPercent: 0, remote: false});
        }
        if (currDevice.traits.includes('action.devices.traits.Volume')) {
            var deviceAttributes = currDevice.attributes;
            deviceAttributes = Object.assign(deviceAttributes, {currentVolume: 10, remote: false});
            if (firebaseRef.child(currDevice.id).child('Volume').child('currentVolume') == undefined) {
                firebaseRef.child(currDevice.id).child('Volume').update({
                    currentVolume: 20
                });
            }
            if (firebaseRef.child(currDevice.id).child('Volume').child('isMuted') == undefined) {
                firebaseRef.child(currDevice.id).child('Volume').update({
                    isMuted: false
                });
            }
        }
        if (currDevice.traits.includes('action.devices.traits.InputSelector')) {
            var availableInputs = currDevice.attributes.availableInputs;
            firebaseRef.child(currDevice.id).child('InputSelector').update({
                availableInputs: availableInputs,
                currentInput: availableInputs[0]['key']
            });
        }
    }
    var data;
    data = {
        requestId: body.requestId,
        payload: {
            agentUserId: '123',
            devices: deviceitems
        },
    };
    console.log("JSON (onSync) " + JSON.stringify(data));
    return data;
});


const queryFirebase = async (deviceId) => {
    const snapshot = await firebaseRef.child(deviceId).once('value');
    const snapshotVal = snapshot.val();

    var asyncvalue = {};

    if (Object.prototype.hasOwnProperty.call(snapshotVal, 'OnOff')) {
        asyncvalue = Object.assign(asyncvalue, {on: snapshotVal.OnOff.on});
    }
    if (Object.prototype.hasOwnProperty.call(snapshotVal, 'OpenClose')) {
        asyncvalue = Object.assign(asyncvalue, {openPercent: snapshotVal.OpenClose.openPercent});
    }
    if (Object.prototype.hasOwnProperty.call(snapshotVal, 'InputSelector')) {
        if (Object.prototype.hasOwnProperty.call(snapshotVal.InputSelector, 'currentInput')) {
            asyncvalue = Object.assign(asyncvalue, {currentInput: snapshotVal.InputSelector.currentInput});
        }
        if (Object.prototype.hasOwnProperty.call(snapshotVal.InputSelector, 'availableInputs')) {
            asyncvalue = Object.assign(asyncvalue, {availableInputs: snapshotVal.InputSelector.availableInputs});
        }
    }
    if (Object.prototype.hasOwnProperty.call(snapshotVal, 'Volume')) {
        if (Object.prototype.hasOwnProperty.call(snapshotVal.Volume, 'currentVolume')) {
            asyncvalue = Object.assign(asyncvalue, {
                currentVolume: snapshotVal.Volume.currentVolume,
                volumeLevel: snapshotVal.Volume.currentVolume
            });
        }
        if (Object.prototype.hasOwnProperty.call(snapshotVal.Volume, 'isMuted')) {
            asyncvalue = Object.assign(asyncvalue, {isMuted: snapshotVal.Volume.isMuted});
        }
    }
    if (Object.prototype.hasOwnProperty.call(snapshotVal.TemperatureSetting, 'thermostatTemperatureSetpoint')) {
      asyncvalue = Object.assign(asyncvalue, {thermostatTemperatureSetpoint: snapshotVal.TemperatureSetting.thermostatTemperatureSetpoint});
    }
    if (Object.prototype.hasOwnProperty.call(snapshotVal.TemperatureSetting, 'thermostatTemperatureAmbient')) {
      asyncvalue = Object.assign(asyncvalue, {thermostatTemperatureAmbient: snapshotVal.TemperatureSetting.thermostatTemperatureAmbient});
    }
    if (Object.prototype.hasOwnProperty.call(snapshotVal.TemperatureSetting, 'thermostatHumidityAmbient')) {
      asyncvalue = Object.assign(asyncvalue, {thermostatHumidityAmbient: snapshotVal.TemperatureSetting.thermostatHumidityAmbient});
    }
    if (Object.prototype.hasOwnProperty.call(snapshotVal.TemperatureSetting, 'thermostatTemperatureSetpointLow')) {
      asyncvalue = Object.assign(asyncvalue, {thermostatTemperatureSetpointLow: snapshotVal.TemperatureSetting.thermostatTemperatureSetpointLow});
    }
    if (Object.prototype.hasOwnProperty.call(snapshotVal.TemperatureSetting, 'thermostatTemperatureSetpointHigh')) {
      asyncvalue = Object.assign(asyncvalue, {thermostatTemperatureSetpointHigh: snapshotVal.TemperatureSetting.thermostatTemperatureSetpointHigh});
    }
  }
  return asyncvalue;
};

const queryDevice = async (deviceId) => {
    const data = await queryFirebase(deviceId);
    /* device states  / onQuery */
    var datavalue = {};
    // Current Volume
    console.log("Device data -> " + JSON.stringify(data));
    if (Object.prototype.hasOwnProperty.call(data, 'currentVolume')) {
        datavalue = Object.assign(datavalue, {currentVolume: data.currentVolume});
    }
    // On/Off switches
    if (Object.prototype.hasOwnProperty.call(data, 'on')) {
        datavalue = Object.assign(datavalue, {on: data.on});
    }
    // Current inputs
    if (Object.prototype.hasOwnProperty.call(data, 'currentInput')) {
        datavalue = Object.assign(datavalue, {currentInput: data.currentInput});
    }
    // open/close percentage
    if (Object.prototype.hasOwnProperty.call(data, 'openPercent')) {
        datavalue = Object.assign(datavalue, {openPercent: data.openPercent});
    }
    // list all available inputs
    if (Object.prototype.hasOwnProperty.call(data, 'availableInputs')) {
        datavalue = Object.assign(datavalue, {availableInputs: data.availableInputs});
    }
    // is Muted
    if (Object.prototype.hasOwnProperty.call(data, 'isMuted')) {
        datavalue = Object.assign(datavalue, {isMuted: data.isMuted});
    }
    console.log("Final query from device deviceID " + deviceId + " -> " + JSON.stringify(datavalue));
    return datavalue;
}

app.onQuery(async (body) => {
    const {requestId} = body;
    const payload = {
        devices: {},
    };

  const queryPromises = [];
  const intent = body.inputs[0];
  for (const device of intent.payload.devices) {
    const deviceId = device.id;
    queryPromises.push(
        queryDevice(deviceId)
            .then((data) => {
              // Add response to device payload
              payload.devices[deviceId] = data;
            }) );
  }
  // Wait for all promises to resolve
  await Promise.all(queryPromises);
  return {
    requestId: requestId,
    payload: payload,
  };
});

const updateDevice = async (execution, deviceId) => {
    /* Commands */
    const {params, command} = execution;
    let state, ref;
    switch (command) {
        case 'action.devices.commands.SetInput':
            state = {currentInput: params.newInput};
            ref = firebaseRef.child(deviceId).child('InputSelector');
            break;
        case 'action.devices.commands.setVolume':
            state = {currentVolume: params.volumeLevel, remote: true};
            ref = firebaseRef.child(deviceId).child('Volume');
            break;
        case 'action.devices.commands.mute':
            state = {isMuted: params.mute, remote: true};
            ref = firebaseRef.child(deviceId).child('Volume');
            break;
        case 'action.devices.commands.volumeRelative':
            ref = firebaseRef.child(deviceId).child('Volume');
            var currentVol = null;
            ref.child('currentVolume').on("value", function (snapshot) {
                currentVol = snapshot.val();
            }, function (errorObject) {
                console.log("The read failed: " + errorObject.code);
            });
            var volStep = params.relativeSteps * 2;
            var newVol = currentVol + volStep;
            console.log("New volume is: " + newVol)
            if (newVol <= 0)
                state = {currentVolume: 0, remote: true};
            else
                state = {currentVolume: newVol, remote: true};
            break;
        case 'action.devices.commands.OnOff':
            state = {on: params.on, remote: true};
            ref = firebaseRef.child(deviceId).child('OnOff');
            break;
        case 'action.devices.commands.Reboot':
            state = {reboot: true};
            ref = firebaseRef.child(deviceId).child('RebootNow')
            break;
        case 'action.devices.commands.OpenClose':
            var currentOpenClose;
            ref = firebaseRef.child(deviceId).child('OpenClose');
            ref.child('openPercent').on("value", function (snapshot) {
                currentOpenClose = snapshot.val();
            }, function (errorObject) {
                console.log("The read failed: " + errorObject.code);
            });
            var newState;
            newState = (currentOpenClose == 100) ? 0 : 100;
            state = {openPercent: newState, remote: true};
            break;
        default:
            break;
    }
    return ref.update(state)
        .then(() => state);
};

app.onExecute(async (body) => {
    const {requestId} = body;
    // Execution results are grouped by status
    const result = {
        ids: [],
        status: 'SUCCESS',
        states: {
            online: true,
        },
    };

  const executePromises = [];
  const intent = body.inputs[0];
  for (const command of intent.payload.commands) {
    for (const device of command.devices) {
      for (const execution of command.execution) {
        executePromises.push(
            updateDevice(execution, device.id)
                .then((data) => {
                  result.ids.push(device.id);
                  Object.assign(result.states, data);
                })
                .catch(() => functions.logger.error('EXECUTE', device.id)));
      }
    }
  }

  await Promise.all(executePromises);
  return {
    requestId: requestId,
    payload: {
      commands: [result],
    },
  };
});

app.onDisconnect((body, headers) => {
  functions.logger.log('User account unlinked from Google Assistant');
  // Return empty response
  return {};
});

exports.smarthome = functions.https.onRequest(app);

exports.requestsync = functions.https.onRequest(async (request, response) => {
  response.set('Access-Control-Allow-Origin', '*');
  functions.logger.info('Request SYNC for user ${USER_ID}');
  try {
    const res = await app.requestSync(USER_ID);
    functions.logger.log('Request sync completed');
    response.json(res.data);
  } catch (err) {
    functions.logger.error(err);
    response.status(500).send(`Error requesting sync: ${err}`);
  }
});

/**
 * Send a REPORT STATE call to the homegraph when data for any device id
 * has been changed.
 */
exports.reportstate = functions.database.ref('{deviceId}').onWrite(async (change, context) => {
  functions.logger.info('Firebase write event triggered this cloud function');
  if (!app.jwt) {
    functions.logger.warn('Service account key is not configured');
    functions.logger.warn('Report state is unavailable');
    return;
  }
  const snapshot = change.after.val();

  var syncvalue = {};

  if (Object.prototype.hasOwnProperty.call(snapshot, 'OnOff')) {
    syncvalue = Object.assign(syncvalue, {on: snapshot.OnOff.on});
  }
  if (Object.prototype.hasOwnProperty.call(snapshot, 'Brightness')) {
    syncvalue = Object.assign(syncvalue, {brightness: snapshot.Brightness.brightness});
  }
  if (Object.prototype.hasOwnProperty.call(snapshot, 'ColorSetting')) {
    syncvalue = Object.assign(syncvalue, {color: snapshot.ColorSetting.color});
  }
  if (Object.prototype.hasOwnProperty.call(snapshot, 'FanSpeed')) {
    if (Object.prototype.hasOwnProperty.call(snapshot.FanSpeed, 'currentFanSpeedSetting')) {
      syncvalue = Object.assign(syncvalue, {currentFanSpeedSetting: snapshot.FanSpeed.currentFanSpeedSetting});
    }
  }
  if (Object.prototype.hasOwnProperty.call(snapshot, 'Modes')) {
    if (Object.prototype.hasOwnProperty.call(snapshot.Modes, 'currentModeSettings')) {
      syncvalue = Object.assign(syncvalue, {currentModeSettings: snapshot.Modes.currentModeSettings});
    }
  }
  if (Object.prototype.hasOwnProperty.call(snapshot, 'TemperatureSetting')) {
    if (Object.prototype.hasOwnProperty.call(snapshot.TemperatureSetting, 'thermostatMode')) {
      syncvalue = Object.assign(syncvalue, {thermostatMode: snapshot.TemperatureSetting.thermostatMode});
    }
    if ("thermostatTemperatureSetpoint" in snapshot) {
      syncvalue = Object.assign(syncvalue, {thermostatTemperatureSetpoint: snapshot.TemperatureSetting.thermostatTemperatureSetpoint});
    }
    if ("thermostatTemperatureAmbient" in snapshot) {
      syncvalue = Object.assign(syncvalue, {thermostatTemperatureAmbient: snapshot.TemperatureSetting.thermostatTemperatureAmbient});
    }
    if ('thermostatHumidityAmbient' in snapshot) {
      syncvalue = Object.assign(syncvalue, {thermostatHumidityAmbient: snapshot.TemperatureSetting.thermostatHumidityAmbient});
    }
    if ('thermostatTemperatureSetpointLow' in snapshot) {
      syncvalue = Object.assign(syncvalue, {thermostatTemperatureSetpointLow: snapshot.TemperatureSetting.thermostatTemperatureSetpointLow});
    }
    if ('thermostatTemperatureSetpointHigh' in snapshot) {
      syncvalue = Object.assign(syncvalue, {thermostatTemperatureSetpointHigh: snapshot.TemperatureSetting.thermostatTemperatureSetpointHigh});
    }
  }

  const postData = {
    requestId: 'ff36a3ccsiddhy', /* Any unique ID */
    agentUserId: USER_ID, /* Hardcoded user ID */
    payload: {
      devices: {
        states: {
          /* Report the current state of our light */
          [context.params.deviceId]: syncvalue,
        },
      },
    },
  };

  const data = await app.reportState(postData);
  functions.logger.log('Report state came back');
  functions.logger.info(data);
});

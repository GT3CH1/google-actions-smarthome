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
const util = require('util');
const admin = require('firebase-admin');
// Initialize Firebase
admin.initializeApp();
const firebaseRef = admin.database().ref('/');

exports.fakeauth = functions.https.onRequest((request, response) => {
    const responseurl = util.format('%s?code=%s&state=%s',
        decodeURIComponent(request.query.redirect_uri), 'xxxxxx',
        request.query.state);
    console.log(responseurl);
    return response.redirect(responseurl);
});

exports.faketoken = functions.https.onRequest((request, response) => {
    const grantType = request.query.grant_type
        ? request.query.grant_type : request.body.grant_type;
    const secondsInDay = 86400; // 60 * 60 * 24
    const HTTP_STATUS_OK = 200;
    console.log(`Grant type ${grantType}`);

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
    jwt = require('./smart-home-key.json')
} catch (e) {
    console.warn('Service account key is not found')
    console.warn('Report state and Request sync will be unavailable')
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
        if (deviceitems[devicecounter].traits.includes('action.devices.traits.TemperatureSetting')) {
            if (deviceitems[devicecounter].attributes.queryOnlyTemperatureSetting == true) {
                firebaseRef.child(deviceitems[devicecounter].id).child('TemperatureSetting').set({
                    thermostatMode: "off",
                    thermostatTemperatureAmbient: 20,
                    thermostatHumidityAmbient: 90
                });
            } else if (deviceitems[devicecounter].attributes.queryOnlyTemperatureSetting == false) {
                firebaseRef.child(deviceitems[devicecounter].id).child('TemperatureSetting').set({
                    thermostatMode: "off",
                    thermostatTemperatureSetpoint: 25.5,
                    thermostatTemperatureAmbient: 20,
                    thermostatHumidityAmbient: 90,
                    thermostatTemperatureSetpointLow: 15,
                    thermostatTemperatureSetpointHigh: 30
                });
            }
        }
        if (deviceitems[devicecounter].traits.includes('action.devices.traits.OnOff')) {
            // firebaseRef.child(deviceitems[devicecounter].id).child('OnOff').set({on: false});
        }
        if (deviceitems[devicecounter].traits.includes('action.devices.traits.Brightness')) {
            firebaseRef.child(deviceitems[devicecounter].id).child('Brightness').set({brightness: 10});
        }
        if (deviceitems[devicecounter].traits.includes('action.devices.traits.Timer')) {
            // firebaseRef.child(deviceitems[devicecounter].id).child('Timer').set({timerRemainingSec: 0,timerTimeSec: 0});
        }
        if (deviceitems[devicecounter].traits.includes('action.devices.traits.StartStop')) {
            // firebaseRef.child(deviceitems[devicecounter].id).child('StartStop').set({isRunning: false, availableZones: deviceitems[devicecounter].attributes.availableZones, activeZones: ["none"]});
        }
        if (deviceitems[devicecounter].traits.includes('action.devices.traits.Volume')) {
            // firebaseRef.child(deviceitems[devicecounter].id).child('Volume').set({stepSize: deviceitems[devicecounter].attributes.levelStepSize, currentVolume: 10});
        }
        if (deviceitems[devicecounter].traits.includes('action.devices.traits.ColorSetting')) {
            firebaseRef.child(deviceitems[devicecounter].id).child('ColorSetting').set({
                color: {
                    name: "deep sky blue",
                    spectrumRGB: 49151
                }
            });
        }
        if (deviceitems[devicecounter].traits.includes('action.devices.traits.Modes')) {
            var modename = deviceitems[devicecounter].attributes.availableModes[0].name
            var modevalue = deviceitems[devicecounter].attributes.availableModes[0].settings[0].setting_name
            firebaseRef.child(deviceitems[devicecounter].id).child('Modes').set({currentModeSettings: {modename: modevalue}});
        }
        if (deviceitems[devicecounter].traits.includes('action.devices.traits.FanSpeed')) {
            firebaseRef.child(deviceitems[devicecounter].id).child('FanSpeed').set({currentFanSpeedSetting: 20.0});
        }
    }
    return {
        requestId: body.requestId,
        payload: {
            agentUserId: '123',
            devices: deviceitems
        },
    };
});


const queryFirebase = async (deviceId) => {
    const snapshot = await firebaseRef.child(deviceId).once('value');
    const snapshotVal = snapshot.val();

    var asyncvalue = {};

    if (Object.prototype.hasOwnProperty.call(snapshotVal, 'OnOff')) {
        asyncvalue = Object.assign(asyncvalue, {on: snapshotVal.OnOff.on});
    }
    if (Object.prototype.hasOwnProperty.call(snapshotVal, 'Volume')) {
        asyncvalue = Object.assign(asyncvalue, {
            currentVolume: snapshotVal.Volume.currentVolume,
            isMuted: snapshotVal.Volume.isMuted
        });
    }
    if (Object.prototype.hasOwnProperty.call(snapshotVal, 'Timer')) {
        if (Object.prototype.hasOwnProperty.call(snapshotVal.Timer, 'timerRemainingSec')) {
            asyncvalue = Object.assign(asyncvalue, {timerRemainingSec: snapshotVal.Timer.timerRemainingSec});
        }
        if (Object.prototype.hasOwnProperty.call(snapshotVal.Timer, 'timerTimeSec')) {
            asyncvalue = Object.assign(asyncvalue, {timerTimeSec: snapshotVal.Timer.timerTimeSec});
        }
    }
    if (Object.prototype.hasOwnProperty.call(snapshotVal, 'Brightness')) {
        asyncvalue = Object.assign(asyncvalue, {brightness: snapshotVal.Brightness.brightness});
    }
    if (Object.prototype.hasOwnProperty.call(snapshotVal, 'ColorSetting')) {
        asyncvalue = Object.assign(asyncvalue, {color: snapshotVal.ColorSetting.color});
    }
    if (Object.prototype.hasOwnProperty.call(snapshotVal, 'FanSpeed')) {
        if (Object.prototype.hasOwnProperty.call(snapshotVal.FanSpeed, 'currentFanSpeedSetting')) {
            asyncvalue = Object.assign(asyncvalue, {currentFanSpeedSetting: snapshotVal.FanSpeed.currentFanSpeedSetting});
        }
    }
    if (Object.prototype.hasOwnProperty.call(snapshotVal, 'Modes')) {
        if (Object.prototype.hasOwnProperty.call(snapshotVal.Modes, 'currentModeSettings')) {
            asyncvalue = Object.assign(asyncvalue, {currentModeSettings: snapshotVal.Modes.currentModeSettings});
        }
    }
    if (Object.prototype.hasOwnProperty.call(snapshotVal, 'TemperatureSetting')) {
        if (Object.prototype.hasOwnProperty.call(snapshotVal.TemperatureSetting, 'thermostatMode')) {
            asyncvalue = Object.assign(asyncvalue, {thermostatMode: snapshotVal.TemperatureSetting.thermostatMode});
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
}

const queryDevice = async (deviceId) => {
    const data = await queryFirebase(deviceId);
    /* device states */
    var datavalue = {};

    if (Object.prototype.hasOwnProperty.call(data, 'on')) {
        datavalue = Object.assign(datavalue, {on: data.on});
    }
    if (Object.prototype.hasOwnProperty.call(data, 'isRunning')) {
        datavalue = Object.assign(datavalue, {isRunning: data.isRunning});
    }
    if (Object.prototype.hasOwnProperty.call(data, 'currentVolume')) {
        datavalue = Object.assign(datavalue, {currentVolume: data.currentVolume});
    }
    if (Object.prototype.hasOwnProperty.call(data, 'isMuted')) {
        datavalue = Object.assign(datavalue, {isMuted: data.isMuted});
    }
    if (Object.prototype.hasOwnProperty.call(data, 'availableZones')) {
        datavalue = Object.assign(datavalue, {availableZones: data.availableZones});
    }
    if (Object.prototype.hasOwnProperty.call(data, 'zone')) {
        datavalue = Object.assign(datavalue, {zone: data.zone});
    }
    if (Object.prototype.hasOwnProperty.call(data, 'timerRemainingSec')) {
        datavalue = Object.assign(datavalue, {timerRemainingSec: data.timerRemainingSec});
    }
    if (Object.prototype.hasOwnProperty.call(data, 'timerTimeSec')) {
        datavalue = Object.assign(datavalue, {timerTimeSec: data.timerTimeSec});
    }
    if (Object.prototype.hasOwnProperty.call(data, 'activeZones')) {
        datavalue = Object.assign(datavalue, {activeZones: data.activeZones});
    }
    if (Object.prototype.hasOwnProperty.call(data, 'brightness')) {
        datavalue = Object.assign(datavalue, {brightness: data.brightness});
    }
    if (Object.prototype.hasOwnProperty.call(data, 'color')) {
        datavalue = Object.assign(datavalue, {color: data.color});
    }
    if (Object.prototype.hasOwnProperty.call(data, 'currentFanSpeedSetting')) {
        datavalue = Object.assign(datavalue, {currentFanSpeedSetting: data.currentFanSpeedSetting});
    }
    if (Object.prototype.hasOwnProperty.call(data, 'currentModeSettings')) {
        datavalue = Object.assign(datavalue, {currentModeSettings: data.currentModeSettings});
    }
    if (Object.prototype.hasOwnProperty.call(data, 'thermostatMode')) {
        datavalue = Object.assign(datavalue, {thermostatMode: data.thermostatMode});
    }
    if (Object.prototype.hasOwnProperty.call(data, 'thermostatTemperatureSetpoint')) {
        datavalue = Object.assign(datavalue, {thermostatTemperatureSetpoint: data.thermostatTemperatureSetpoint});
    }
    if (Object.prototype.hasOwnProperty.call(data, 'thermostatTemperatureAmbient')) {
        datavalue = Object.assign(datavalue, {thermostatTemperatureAmbient: data.thermostatTemperatureAmbient});
    }
    if (Object.prototype.hasOwnProperty.call(data, 'thermostatHumidityAmbient')) {
        datavalue = Object.assign(datavalue, {thermostatHumidityAmbient: data.thermostatHumidityAmbient});
    }
    if (Object.prototype.hasOwnProperty.call(data, 'thermostatTemperatureSetpointLow')) {
        datavalue = Object.assign(datavalue, {thermostatTemperatureSetpointLow: data.thermostatTemperatureSetpointLow});
    }
    if (Object.prototype.hasOwnProperty.call(data, 'thermostatTemperatureSetpointHigh')) {
        datavalue = Object.assign(datavalue, {thermostatTemperatureSetpointHigh: data.thermostatTemperatureSetpointHigh});
    }
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
        queryPromises.push(queryDevice(deviceId)
            .then((data) => {
                    // Add response to device payload
                    payload.devices[deviceId] = data;
                }
            ));
    }
    // Wait for all promises to resolve
    await Promise.all(queryPromises)
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
        case 'action.devices.commands.StartStop':
            state = {isRunning: params.start};
            ref = firebaseRef.child(deviceId).child('StartStop');
            break;
        case 'action.devices.commands.TimerStart':
            state = {timerTimeSec: params.timerTimeSec};
            ref = firebaseRef.child(deviceId).child('Timer');
            break;
        case 'action.devices.commands.TimerAdjust':
            state = {timerTimeSec: params.timerTimeSec};
            ref = firebaseRef.child(deviceId).child('Timer');
            break;
        case 'action.devices.commands.setVolume':
            state = {currentVolume: params.volumeLevel};
            ref = firebaseRef.child(deviceId).child('Volume');
            break;
        case 'action.devices.commands.volumeRelative':
            ref = firebaseRef.child(deviceId).child('Volume');
            var currentVol = null;
            ref.child('currentVolume').on("value", function(snapshot) {
                console.log(snapshot.val() + " Gavin was here.");
                currentVol = snapshot.val();
            }, function (errorObject) {
                console.log("The read failed: " + errorObject.code);
            });
            var steps = null;
            ref.child('levelStepSize').on("value", function(snapshot) {
                console.log(snapshot.val() + " steps");
                steps = snapshot.val();
            }, function (errorObject) {
                console.log("The read failed: " + errorObject.code);
            });
            var newVol = currentVol + (params.relativeSteps * steps);
            if(newVol <= 0)
                state = currentVol{currentVolume: 0};
            else
                state = {currentVolume: newVol};
            break;
        case 'action.devices.commands.mute':
            state = {isMuted: params.mute};
            ref = firebaseRef.child(deviceId).child('Volume');
            break;
        case 'action.devices.commands.OnOff':
            state = {on: params.on};
            ref = firebaseRef.child(deviceId).child('OnOff');
            break;
        case 'action.devices.commands.BrightnessAbsolute':
            state = {brightness: params.brightness};
            ref = firebaseRef.child(deviceId).child('Brightness');
            break;
        case 'action.devices.commands.ColorAbsolute':
            state = {color: params.color};
            ref = firebaseRef.child(deviceId).child('ColorSetting');
            break;
        case 'action.devices.commands.SetFanSpeed':
            state = {currentFanSpeedSetting: params.fanSpeed};
            ref = firebaseRef.child(deviceId).child('FanSpeed');
            break;
        case 'action.devices.commands.SetModes':
            state = {currentModeSettings: params.updateModeSettings};
            ref = firebaseRef.child(deviceId).child('Modes');
            break;
        case 'action.devices.commands.ThermostatTemperatureSetpoint':
            state = {thermostatTemperatureSetpoint: params.thermostatTemperatureSetpoint};
            ref = firebaseRef.child(deviceId).child('TemperatureSetting');
            break;
        case 'action.devices.commands.ThermostatSetMode':
            state = {thermostatMode: params.thermostatMode};
            ref = firebaseRef.child(deviceId).child('TemperatureSetting');
            break;
        case 'action.devices.commands.ThermostatTemperatureSetRange':
            state = {
                thermostatTemperatureSetpointLow: params.thermostatTemperatureSetpointLow,
                thermostatTemperatureSetpointHigh: params.thermostatTemperatureSetpointHigh
            };
            ref = firebaseRef.child(deviceId).child('TemperatureSetting');
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
                        .catch(() => console.error(`Unable to update ${device.id}`))
                );
            }
        }
    }

    await Promise.all(executePromises)
    return {
        requestId: requestId,
        payload: {
            commands: [result],
        },
    };
});


exports.smarthome = functions.https.onRequest(app);

exports.requestsync = functions.https.onRequest(async (request, response) => {
    response.set('Access-Control-Allow-Origin', '*');
    console.info('Request SYNC for user 123');
    try {
        const res = await app.requestSync('123');
        console.log('Request sync completed');
        response.json(res.data);
    } catch (err) {
        console.error(err);
        response.status(500).send(`Error requesting sync: ${err}`)
    }
});

/**
 * Send a REPORT STATE call to the homegraph when data for any device id
 * has been changed.
 */
exports.reportstate = functions.database.ref('{deviceId}').onWrite(async (change, context) => {
    console.info('Firebase write event triggered this cloud function');
    if (!app.jwt) {
        console.warn('Service account key is not configured');
        console.warn('Report state is unavailable');
        return;
    }
    const snapshot = change.after.val();

    var syncvalue = {};

    if (Object.prototype.hasOwnProperty.call(snapshot, 'OnOff')) {
        syncvalue = Object.assign(syncvalue, {on: snapshot.OnOff.on});
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'StartStop')) {
        syncvalue = Object.assign(syncvalue, {
            isRunning: snapshot.StartStop.isRunning,
            activeZones: snapshot.StartStop.activeZones,
            availableZones: snapshot.StartStop.availableZones
        });
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'Timer')) {
        if (Object.prototype.hasOwnProperty.call(snapshot.Timer, 'timerTimeSec')) {
            syncvalue = Object.assign(syncvalue, {timerTimeSec: snapshot.Timer.timerTimeSec});
        }
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'Brightness')) {
        syncvalue = Object.assign(syncvalue, {brightness: snapshot.Brightness.brightness});
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'Brightness')) {
        syncvalue = Object.assign(syncvalue, {brightness: snapshot.Brightness.brightness});
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'Volume')) {
        if (Object.prototype.hasOwnProperty.call(snapshot.Volume, 'currentVolume')) {
            syncvalue = Object.assign(syncvalue, {color: snapshot.Volume.currentVolume});
        }
        if (Object.prototype.hasOwnProperty.call(snapshot.Volume, 'isMuted')) {
            syncvalue = Object.assign(syncvalue, {color: snapshot.Volume.isMuted});
        }
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
        agentUserId: '123', /* Hardcoded user ID */
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
    console.log('Report state came back');
    console.info(data);
});

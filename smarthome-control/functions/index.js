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
require('firebase-functions/lib/logger/compat');
const functions = require('firebase-functions');
const {smarthome} = require('actions-on-google');
const {google} = require('googleapis');
const util = require('util');
const admin = require('firebase-admin');
const axios = require('axios');

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
    jwt = require('./smart-home-key.json')
} catch (e) {
    functions.logger.warn('Service account key is not found')
    functions.logger.warn('Report state and Request sync will be unavailable')
}

const app = smarthome({
    jwt: jwt,
    debug: true,
})
let api_url = 'https://api.peasenet.com/smarthome';
let devicelist = null;
let deviceitems = null;
axios.get(api_url + '/google')
    .then(function (response) {
        devicelist = JSON.parse(JSON.stringify(response["data"]));
        functions.logger.info("Got device list from api");
        functions.logger.info(devicelist);
        deviceitems = JSON.parse(JSON.stringify(devicelist));
    })
    .catch(err => functions.logger.error(err));

var devicecounter;

app.onSync((body) => {
    axios.get(api_url + '/google')
        .then(function (response) {
            devicelist = JSON.parse(response["data"]);
            functions.logger.info("Got device list from api");
            functions.logger.info(devicelist);
            functions.logger.log('onSync');
            return {
                requestId: body.requestId,
                payload: {
                    agentUserId: USER_ID,
                    devices: devicelist
                },
            };
        })
        .catch(err => functions.logger.error(err));
});

const queryDevice = async (deviceId) => {
    var datavalue = {};
    await axios.get(api_url + "/device/" + deviceId)
        .then(function (response) {
            let json = JSON.parse(JSON.stringify(response.data));
            let kind = json["kind"];
            let state = json["last_state"];
            switch (kind) {
                case "GARAGE":
                    let val = 0;
                    if (state)
                        val = 100
                    datavalue['openPercent'] = val;
                default:
                    datavalue['on'] = state;
            }
            return datavalue;
        })
    return datavalue;
};

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
                }));
    }
    // Wait for all promises to resolve
    await Promise.all(queryPromises);
    return {
        requestId: requestId,
        payload: payload,
    };
});

const updateDevice = async (execution, deviceId) => {
    const {params, command} = execution;
    let state;
    let ref;
    switch (command) {
        case 'action.devices.commands.OnOff':
            state = {on: params.on, remote: true};
            ref = firebaseRef.child(deviceId).child('OnOff');
            functions.logger.info(api_url + '/device');

            axios.post(api_url + '/device', {
                "guid": deviceId,
                "state": params.on
            })
                .then(function (response) {
                    functions.logger.log("DONE SENDING REQUEST => " + JSON.parse(response.data));
                })
                .catch(function (error) {
                    functions.logger.error("ERROR IN REQUEST");
                    functions.logger.error(error);
                });
            break;

        case 'action.devices.commands.Reboot':
            state = {reboot: true};
            ref = firebaseRef.child(deviceId).child('RebootNow')
            break;

        case 'action.devices.commands.OpenClose':
            state = {openPercent: 100};
            ref = firebaseRef.child(deviceId).child('openPercent');

            let url = 'https://api.peasenet.com/sprinkler/garage/bf176c86-f96b-4412-bd97-3f09fa5a7ce8/toggle';
            axios.post(url)
                .then(function (response) {
                    functions.logger.log(response);
                })
                .catch(function (error) {
                    functions.logger.error(error);
                });
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
                functions.logger.error("The read failed: " + errorObject.code);
            });
            var volStep = 1 * 2;
            var newVol = currentVol + volStep;
            if (newVol <= 0)
                state = {currentVolume: 0, remote: true};
            else
                state = {currentVolume: newVol, remote: true};
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
                        .catch((err) => functions.logger.error('EXECUTE : ' + err, device.id)));
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

    if (snapshot.hasOwnProperty('OnOff'))
        syncvalue['on'] = snapshot.OnOff.on
    if (snapshot.hasOwnProperty('MediaState'))
        syncvalue['playbackState'] = snapshot.MediaState.playbackState
    const postData = {
        requestId: 'gtech', /* Any unique ID */
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
    // functions.logger.info(data);
});

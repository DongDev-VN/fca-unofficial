"use strict";

var utils = require("../utils");
var log = require("npmlog");
const { generateOfflineThreadingID } = require("../utils");

module.exports = function (defaultFuncs, api, ctx) {
  function setMessageReactionNoMqtt(reaction, messageID, callback) {
    var resolveFunc = function () {};
    var rejectFunc = function () {};
    var returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });
    if (!callback) {
      callback = function (err, friendList) {
        if (err) {
          return rejectFunc(err);
        }
        resolveFunc(friendList);
      };
    }
    var variables = {
      data: {
        client_mutation_id: ctx.clientMutationId++,
        actor_id: ctx.userID,
        action: reaction == "" ? "REMOVE_REACTION" : "ADD_REACTION",
        message_id: messageID,
        reaction: reaction,
      },
    };
    var qs = {
      doc_id: "1491398900900362",
      variables: JSON.stringify(variables),
      dpr: 1,
    };
    defaultFuncs
      .postFormData(
        "https://www.facebook.com/webgraphql/mutation/",
        ctx.jar,
        {},
        qs,
      )
      .then(utils.parseAndCheckLogin(ctx.jar, defaultFuncs))
      .then(function (resData) {
        if (!resData) {
          throw { error: "setReaction returned empty object." };
        }
        if (resData.error) {
          throw resData;
        }
        callback(null);
      })
      .catch(function (err) {
        log.error("setReaction", err);
        return callback(err);
      });

    return returnPromise;
  }

  function setMessageReactionMqtt(reaction, messageID, threadID, callback) {
    if (!ctx.mqttClient) {
      throw new Error("Not connected to MQTT");
    }
    ctx.wsReqNumber += 1;
    let taskNumber = ++ctx.wsTaskNumber;
    const taskPayload = {
      thread_key: threadID,
      timestamp_ms: getCurrentTimestamp(),
      message_id: messageID,
      reaction: reaction,
      actor_id: ctx.userID,
      reaction_style: null,
      sync_group: 1,
      send_attribution: Math.random() < 0.5 ? 65537 : 524289,
    };
    const task = {
      failure_count: null,
      label: "29",
      payload: JSON.stringify(taskPayload),
      queue_name: JSON.stringify(["reaction", messageID]),
      task_id: taskNumber,
    };
    const content = {
      app_id: "2220391788200892",
      payload: JSON.stringify({
        data_trace_id: null,
        epoch_id: parseInt(generateOfflineThreadingID()),
        tasks: [task],
        version_id: "7158486590867448",
      }),
      request_id: ctx.wsReqNumber,
      type: 3,
    };
    if (typeof callback === "function") {
      ctx["tasks"].set(taskNumber, {
        type: "set_message_reaction",
        callback: callback,
      });
    }
    ctx.mqttClient.publish("/ls_req", JSON.stringify(content), {
      qos: 1,
      retain: false,
    });
  }
  return function setMessageReaction(reaction, messageID, threadID, callback) {
    if (ctx.mqttClient) {
      try {
        setMessageReactionMqtt(reaction, messageID, threadID, callback);
        callback();
      } catch (e) {
        setMessageReactionNoMqtt(reaction, messageID, callback);
      }
    } else {
      setMessageReactionNoMqtt(reaction, messageID, callback);
    }
  };
};
"use strict";
const utils = require("../utils");
const log = require("npmlog");
const mqtt = require("mqtt");
const WebSocket = require("ws");
const HttpsProxyAgent = require("https-proxy-agent");
const EventEmitter = require("events");
const Duplexify = require("duplexify");
const { Transform } = require("stream");
var identity = function () { };
var form = {};
var getSeqID = function () { };
const logger = require("../lib/logger.js");
let mqttReconnectCount = 0;
const topics = [
  "/ls_req",
  "/ls_resp",
  "/legacy_web",
  "/webrtc",
  "/rtc_multi",
  "/onevc",
  "/br_sr",
  "/sr_res",
  "/t_ms",
  "/thread_typing",
  "/orca_typing_notifications",
  "/notify_disconnect",
  "/orca_presence",
  "/inbox",
  "/mercury",
  "/messaging_events",
  "/orca_message_notifications",
  "/pp",
  "/webrtc_response",
];
let WebSocket_Global;
function buildProxy() {
  const Proxy = new Transform({
    objectMode: false,
    transform(chunk, enc, next) {
      if (WebSocket_Global.readyState !== WebSocket.OPEN) {
        return next();
      }
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
      try {
        WebSocket_Global.send(data);
        next();
      } catch (err) {
        console.error("WebSocket send error:", err);
        next(err);
      }
    },
    flush(done) {
      if (WebSocket_Global.readyState === WebSocket.OPEN) {
        WebSocket_Global.close();
      }
      done();
    },
    writev(chunks, cb) {
      try {
        for (const { chunk } of chunks) {
          this.push(
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8")
          );
        }
        cb();
      } catch (err) {
        console.error("Writev error:", err);
        cb(err);
      }
    },
  });

  return Proxy;
}
function buildStream(options, WebSocket, Proxy) {
  const Stream = Duplexify(undefined, undefined, options);
  Stream.socket = WebSocket;
  let pingInterval;
  let reconnectTimeout;
  const clearTimers = () => {
    clearInterval(pingInterval);
    clearTimeout(reconnectTimeout);
  };
  WebSocket.onclose = () => {
    clearTimers();
    Stream.end();
    Stream.destroy();
  };
  WebSocket.onerror = (err) => {
    clearTimers();
    Stream.destroy(err);
  };
  WebSocket.onmessage = (event) => {
    clearTimeout(reconnectTimeout);
    const data =
      event.data instanceof ArrayBuffer
        ? Buffer.from(event.data)
        : Buffer.from(event.data, "utf8");
    Stream.push(data);
  };
  WebSocket.onopen = () => {
    Stream.setReadable(Proxy);
    Stream.setWritable(Proxy);
    Stream.emit("connect");
    pingInterval = setInterval(() => {
      if (WebSocket.readyState === WebSocket.OPEN) {
        WebSocket.ping();
      }
    }, 30000);
    reconnectTimeout = setTimeout(() => {
      if (WebSocket.readyState === WebSocket.OPEN) {
        WebSocket.close();
        Stream.end();
        Stream.destroy();
      }
    }, 60000);
  };
  WebSocket_Global = WebSocket;
  Proxy.on("close", () => {
    clearTimers();
    WebSocket.close();
  });
  return Stream;
}
function listenMqtt(defaultFuncs, api, ctx, globalCallback) {
  const chatOn = ctx.globalOptions.online;
  const foreground = false;
  const sessionID = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER) + 1;
  const GUID = utils.getGUID();
  const username = {
    u: ctx.userID,
    s: sessionID,
    chat_on: chatOn,
    fg: foreground,
    d: GUID,
    ct: "websocket",
    aid: 219994525426954,
    aids: null,
    mqtt_sid: "",
    cp: 3,
    ecp: 10,
    st: [],
    pm: [],
    dc: "",
    no_auto_fg: true,
    gas: null,
    pack: [],
    p: null,
    php_override: ""
  };
  const cookies = ctx.jar.getCookies("https://www.facebook.com").join("; ");
  let host;
  if (ctx.mqttEndpoint) {
    host = `${ctx.mqttEndpoint}&sid=${sessionID}&cid=${GUID}`;
  } else if (ctx.region) {
    host = `wss://edge-chat.facebook.com/chat?region=${ctx.region.toLowerCase()}&sid=${sessionID}&cid=${GUID}`;
  } else {
    host = `wss://edge-chat.facebook.com/chat?sid=${sessionID}&cid=${GUID}`;
  }
  const options = {
    clientId: "mqttwsclient",
    protocolId: "MQIsdp",
    protocolVersion: 3,
    username: JSON.stringify(username),
    clean: true,
    wsOptions: {
      headers: {
        Cookie: cookies,
        Origin: "https://www.facebook.com",
        "User-Agent":
          ctx.globalOptions.userAgent ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        Referer: "https://www.facebook.com/",
        Host: "edge-chat.facebook.com",
        Connection: "Upgrade",
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "vi,en;q=0.9",
        "Sec-WebSocket-Extensions":
          "permessage-deflate; client_max_window_bits",
      },
      origin: "https://www.facebook.com",
      protocolVersion: 13,
      binaryType: "arraybuffer",
    },
    keepalive: 30,
    reschedulePings: true,
    reconnectPeriod: 1000,
    connectTimeout: 5000,
  };
  if (ctx.globalOptions.proxy !== undefined) {
    const agent = new HttpsProxyAgent(ctx.globalOptions.proxy);
    options.wsOptions.agent = agent;
  }
  ctx.mqttClient = new mqtt.Client(
    () =>
      buildStream(
        options,
        new WebSocket(host, options.wsOptions),
        buildProxy()
      ),
    options
  );
  const mqttClient = ctx.mqttClient;
  global.mqttClient = mqttClient;
  mqttClient.on('error', function (err) {
    log.error("listenMqtt", err);
    mqttClient.end();
    if (ctx.globalOptions.autoReconnect) {
      listenMqtt(defaultFuncs, api, ctx, globalCallback);
    } else {
      utils.checkLiveCookie(ctx, defaultFuncs)
        .then(res => {
          globalCallback({
            type: "stop_listen",
            error: "Connection refused: Server unavailable"
          }, null);
        })
        .catch(err => {
          globalCallback({
            type: "account_inactive",
            error: "Maybe your account is blocked by facebook, please login and check at https://facebook.com"
          }, null);
        });
    }
  });
  mqttClient.on("connect", function () {
    let StopProcessin = true;
    mqttReconnectCount = 0;
    setInterval(() => {
      console.log('Đang chuẩn bị ngắt kết nối MQTT...');
      StopProcessin = true;
      if (ctx.mqttClient) {
        topics.forEach((topic) => {
          try {
            ctx.mqttClient.unsubscribe(topic);
          } catch (e) { }
        });
        try {
          ctx.mqttClient.publish("/browser_close", "{}");
        } catch (e) { }
        ctx.mqttClient.removeAllListeners();
        console.log('Ngắt Kết Nối MQTT...');
        let connectionClosed = false;
        const afterConnectionClosed = () => {
          if (connectionClosed) return;
          connectionClosed = true;
          ctx.lastSeqId = null;
          ctx.syncToken = undefined;
          ctx.t_mqttCalled = false;
          mqttReconnectCount = 0;
          StopProcessing = false;
          console.log('Đang Kết Nối Lại MQTT...');
          setTimeout(() => {
            getSeqID();
            console.log('Kết Nối Lại MQTT Thành Công');
          }, 1000);
        };
        try {
          ctx.mqttClient.end(false, afterConnectionClosed);
          setTimeout(() => {
            if (!connectionClosed) {
              console.warn('Đóng kết nối MQTT bằng timeout');
              ctx.mqttClient = undefined;
              afterConnectionClosed();
            }
          }, 5000);
        } catch (e) {
          console.error('Lỗi khi đóng kết nối MQTT:', e);
          ctx.mqttClient = undefined;
          afterConnectionClosed();
        }
      } else {
        getSeqID();
        console.log('Kết Nối Lại MQTT Thành Công');
      }
    }, 60 * 60 * 1000);
    if (process.env.OnStatus === undefined) {
      logger("fca-unoffcial premium", "info");
      process.env.OnStatus = true;
    }
    topics.forEach((topicsub) => mqttClient.subscribe(topicsub));
    var topic;
    const queue = {
      sync_api_version: 11,
      max_deltas_able_to_process: 100,
      delta_batch_size: 500,
      encoding: "JSON",
      entity_fbid: ctx.userID,
      initial_titan_sequence_id: ctx.lastSeqId,
      device_params: null,
    };
    if (ctx.syncToken) {
      topic = "/messenger_sync_get_diffs";
      queue.last_seq_id = ctx.lastSeqId;
      queue.sync_token = ctx.syncToken;
    } else {
      topic = "/messenger_sync_create_queue";
      queue.initial_titan_sequence_id = ctx.lastSeqId;
      queue.device_params = null;
    }
    mqttClient.publish(topic, JSON.stringify(queue), { qos: 1, retain: false });
    mqttClient.publish(
      "/foreground_state",
      JSON.stringify({ foreground: chatOn }),
      { qos: 1 }
    );
    mqttClient.publish(
      "/set_client_settings",
      JSON.stringify({ make_user_available_when_in_foreground: true }),
      { qos: 1 }
    );
    const rTimeout = setTimeout(function () {
      mqttClient.end();
      listenMqtt(defaultFuncs, api, ctx, globalCallback);
    }, 5000);
    ctx.tmsWait = function () {
      clearTimeout(rTimeout);
      ctx.globalOptions.emitReady
        ? globalCallback({
          type: "ready",
          error: null,
        })
        : "";
      delete ctx.tmsWait;
    };
  });
  mqttClient.on("message", function (topic, message, _packet) {
    try {
      let jsonMessage = Buffer.isBuffer(message)
        ? Buffer.from(message).toString()
        : message;
      try {
        jsonMessage = JSON.parse(jsonMessage);
      } catch (e) {
        jsonMessage = {};
      }
      if (jsonMessage.type === "jewel_requests_add") {
        globalCallback(null, {
          type: "friend_request_received",
          actorFbId: jsonMessage.from.toString(),
          timestamp: Date.now().toString(),
        });
      } else if (jsonMessage.type === "jewel_requests_remove_old") {
        globalCallback(null, {
          type: "friend_request_cancel",
          actorFbId: jsonMessage.from.toString(),
          timestamp: Date.now().toString(),
        });
      } else if (topic === "/t_ms") {
        if (ctx.tmsWait && typeof ctx.tmsWait == "function") {
          ctx.tmsWait();
        }
        if (jsonMessage.firstDeltaSeqId && jsonMessage.syncToken) {
          ctx.lastSeqId = jsonMessage.firstDeltaSeqId;
          ctx.syncToken = jsonMessage.syncToken;
        }
        if (jsonMessage.lastIssuedSeqId) {
          ctx.lastSeqId = parseInt(jsonMessage.lastIssuedSeqId);
        }
        for (const i in jsonMessage.deltas) {
          const delta = jsonMessage.deltas[i];
          parseDelta(defaultFuncs, api, ctx, globalCallback, {
            delta: delta,
          });
        }
      } else if (
        topic === "/thread_typing" ||
        topic === "/orca_typing_notifications"
      ) {
        const typ = {
          type: "typ",
          isTyping: !!jsonMessage.state,
          from: jsonMessage.sender_fbid.toString(),
          threadID: utils.formatID(
            (jsonMessage.thread || jsonMessage.sender_fbid).toString()
          ),
        };
        (function () {
          globalCallback(null, typ);
        })();
      } else if (topic === "/orca_presence") {
        if (!ctx.globalOptions.updatePresence) {
          for (const i in jsonMessage.list) {
            const data = jsonMessage.list[i];
            const userID = data["u"];
            const presence = {
              type: "presence",
              userID: userID.toString(),
              timestamp: data["l"] * 1000,
              statuses: data["p"],
            };
            (function () {
              globalCallback(null, presence);
            })();
          }
        }
      } else if (topic == "/ls_resp") {
        const parsedPayload = JSON.parse(jsonMessage.payload);
        const reqID = jsonMessage.request_id;
        if (ctx["tasks"].has(reqID)) {
          const taskData = ctx["tasks"].get(reqID);
          const { type: taskType, callback: taskCallback } = taskData;
          const taskRespData = getTaskResponseData(taskType, parsedPayload);
          if (taskRespData == null) {
            taskCallback("error", null);
          } else {
            taskCallback(null, Object.assign({
              type: taskType,
              reqID: reqID
            }, taskRespData));
          }
        }
      }
    } catch (ex) {
      console.error("Message parsing error:", ex);
      if (ex.stack) console.error(ex.stack);
      return;
    }
  });
  mqttClient.on("close", function () { });
  mqttClient.on("disconnect", () => { });
}
function getTaskResponseData(taskType, payload) {
  try {
    switch (taskType) {
      case "send_message_mqtt": {
        return {
          type: taskType,
          threadID: payload.step[1][2][2][1][2],
          messageID: payload.step[1][2][2][1][3],
          payload: payload.step[1][2],
        };
      }
      case "set_message_reaction": {
        return {
          mid: payload.step[1][2][2][1][4],
        };
      }
      case "edit_message": {
        return {
          mid: payload.step[1][2][2][1][2],
        };
      }
    }
  } catch (error) {
    return null;
  }
}
function parseDelta(defaultFuncs, api, ctx, globalCallback, { delta }) {
  if (delta.class === "NewMessage") {
    if (ctx.globalOptions.pageID && ctx.globalOptions.pageID !== delta.queue)
      return;
    const resolveAttachmentUrl = (i) => {
      if (
        !delta.attachments ||
        i === delta.attachments.length ||
        utils.getType(delta.attachments) !== "Array"
      ) {
        let fmtMsg;
        try {
          fmtMsg = utils.formatDeltaMessage(delta);
        } catch (err) {
          return log.error("Lỗi Nhẹ", err);
        }
        if (fmtMsg) {
          if (ctx.globalOptions.autoMarkDelivery) {
            markDelivery(ctx, api, fmtMsg.threadID, fmtMsg.messageID);
          }
          if (!ctx.globalOptions.selfListen && fmtMsg.senderID === ctx.userID)
            return;
          globalCallback(null, fmtMsg);
        }
      } else {
        const attachment = delta.attachments[i];
        if (attachment.mercury.attach_type === "photo") {
          api.resolvePhotoUrl(attachment.fbid, (err, url) => {
            if (!err) attachment.mercury.metadata.url = url;
            resolveAttachmentUrl(i + 1);
          });
        } else {
          resolveAttachmentUrl(i + 1);
        }
      }
    };
    resolveAttachmentUrl(0);
  } else if (delta.class === "ClientPayload") {
    const clientPayload = utils.decodeClientPayload(delta.payload);
    if (clientPayload && clientPayload.deltas) {
      for (const delta of clientPayload.deltas) {
        if (delta.deltaMessageReaction && !!ctx.globalOptions.listenEvents) {
          const messageReaction = {
            type: "message_reaction",
            threadID: (delta.deltaMessageReaction.threadKey.threadFbId
              ? delta.deltaMessageReaction.threadKey.threadFbId
              : delta.deltaMessageReaction.threadKey.otherUserFbId
            ).toString(),
            messageID: delta.deltaMessageReaction.messageId,
            reaction: delta.deltaMessageReaction.reaction,
            senderID: delta.deltaMessageReaction.senderId.toString(),
            userID: delta.deltaMessageReaction.userId.toString(),
          };
          globalCallback(null, messageReaction);
        } else if (
          delta.deltaRecallMessageData &&
          !!ctx.globalOptions.listenEvents
        ) {
          const messageUnsend = {
            type: "message_unsend",
            threadID: (delta.deltaRecallMessageData.threadKey.threadFbId
              ? delta.deltaRecallMessageData.threadKey.threadFbId
              : delta.deltaRecallMessageData.threadKey.otherUserFbId
            ).toString(),
            messageID: delta.deltaRecallMessageData.messageID,
            senderID: delta.deltaRecallMessageData.senderID.toString(),
            deletionTimestamp: delta.deltaRecallMessageData.deletionTimestamp,
            timestamp: delta.deltaRecallMessageData.timestamp,
          };
          globalCallback(null, messageUnsend);
        } else if (delta.deltaMessageReply) {
          const mdata =
            delta.deltaMessageReply.message === undefined
              ? []
              : delta.deltaMessageReply.message.data === undefined
                ? []
                : delta.deltaMessageReply.message.data.prng === undefined
                  ? []
                  : JSON.parse(delta.deltaMessageReply.message.data.prng);

          const m_id = mdata.map((u) => u.i);
          const m_offset = mdata.map((u) => u.o);
          const m_length = mdata.map((u) => u.l);
          const mentions = {};
          for (let i = 0; i < m_id.length; i++) {
            mentions[m_id[i]] = (
              delta.deltaMessageReply.message.body || ""
            ).substring(m_offset[i], m_offset[i] + m_length[i]);
          }
          const callbackToReturn = {
            type: "message_reply",
            threadID: (delta.deltaMessageReply.message.messageMetadata.threadKey
              .threadFbId
              ? delta.deltaMessageReply.message.messageMetadata.threadKey
                .threadFbId
              : delta.deltaMessageReply.message.messageMetadata.threadKey
                .otherUserFbId
            ).toString(),
            messageID:
              delta.deltaMessageReply.message.messageMetadata.messageId,
            senderID:
              delta.deltaMessageReply.message.messageMetadata.actorFbId.toString(),
            attachments: (delta.deltaMessageReply.message.attachments || [])
              .map((att) => {
                const mercury = JSON.parse(att.mercuryJSON);
                Object.assign(att, mercury);
                return att;
              })
              .map((att) => {
                let x;
                try {
                  x = utils._formatAttachment(att);
                } catch (ex) {
                  x = att;
                  x.error = ex;
                  x.type = "unknown";
                }
                return x;
              }),
            args: (delta.deltaMessageReply.message.body || "")
              .trim()
              .split(/\s+/),
            body: delta.deltaMessageReply.message.body || "",
            isGroup:
              !!delta.deltaMessageReply.message.messageMetadata.threadKey
                .threadFbId,
            mentions,
            timestamp: parseInt(
              delta.deltaMessageReply.message.messageMetadata.timestamp
            ),
            participantIDs: (
              delta.deltaMessageReply.message.participants || []
            ).map((e) => e.toString()),
          };
          if (delta.deltaMessageReply.repliedToMessage) {
            const mdata =
              delta.deltaMessageReply.repliedToMessage === undefined
                ? []
                : delta.deltaMessageReply.repliedToMessage.data === undefined
                  ? []
                  : delta.deltaMessageReply.repliedToMessage.data.prng ===
                    undefined
                    ? []
                    : JSON.parse(
                      delta.deltaMessageReply.repliedToMessage.data.prng
                    );
            const m_id = mdata.map((u) => u.i);
            const m_offset = mdata.map((u) => u.o);
            const m_length = mdata.map((u) => u.l);
            const rmentions = {};
            for (let i = 0; i < m_id.length; i++) {
              rmentions[m_id[i]] = (
                delta.deltaMessageReply.repliedToMessage.body || ""
              ).substring(m_offset[i], m_offset[i] + m_length[i]);
            }
            callbackToReturn.messageReply = {
              threadID: (delta.deltaMessageReply.repliedToMessage
                .messageMetadata.threadKey.threadFbId
                ? delta.deltaMessageReply.repliedToMessage.messageMetadata
                  .threadKey.threadFbId
                : delta.deltaMessageReply.repliedToMessage.messageMetadata
                  .threadKey.otherUserFbId
              ).toString(),
              messageID:
                delta.deltaMessageReply.repliedToMessage.messageMetadata
                  .messageId,
              senderID:
                delta.deltaMessageReply.repliedToMessage.messageMetadata.actorFbId.toString(),
              attachments: delta.deltaMessageReply.repliedToMessage.attachments
                .map((att) => {
                  let mercury;
                  try {
                    mercury = JSON.parse(att.mercuryJSON);
                    Object.assign(att, mercury);
                  } catch (ex) {
                    mercury = {};
                  }
                  return att;
                })
                .map((att) => {
                  let x;
                  try {
                    x = utils._formatAttachment(att);
                  } catch (ex) {
                    x = att;
                    x.error = ex;
                    x.type = "unknown";
                  }
                  return x;
                }),
              args: (delta.deltaMessageReply.repliedToMessage.body || "")
                .trim()
                .split(/\s+/),
              body: delta.deltaMessageReply.repliedToMessage.body || "",
              isGroup:
                !!delta.deltaMessageReply.repliedToMessage.messageMetadata
                  .threadKey.threadFbId,
              mentions: rmentions,
              timestamp: parseInt(
                delta.deltaMessageReply.repliedToMessage.messageMetadata
                  .timestamp
              ),
              participantIDs: (
                delta.deltaMessageReply.repliedToMessage.participants || []
              ).map((e) => e.toString()),
            };
          } else if (delta.deltaMessageReply.replyToMessageId) {
            return defaultFuncs
              .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, {
                av: ctx.globalOptions.pageID,
                queries: JSON.stringify({
                  o0: {
                    doc_id: "2848441488556444",
                    query_params: {
                      thread_and_message_id: {
                        thread_id: callbackToReturn.threadID,
                        message_id: delta.deltaMessageReply.replyToMessageId.id,
                      },
                    },
                  },
                }),
              })
              .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
              .then((resData) => {
                if (resData[resData.length - 1].error_results > 0)
                  throw resData[0].o0.errors;
                if (resData[resData.length - 1].successful_results === 0)
                  throw {
                    error: "forcedFetch: there was no successful_results",
                    res: resData,
                  };
                const fetchData = resData[0].o0.data.message;
                const mobj = {};
                for (const n in fetchData.message.ranges) {
                  mobj[fetchData.message.ranges[n].entity.id] = (
                    fetchData.message.text || ""
                  ).substr(
                    fetchData.message.ranges[n].offset,
                    fetchData.message.ranges[n].length
                  );
                }
                callbackToReturn.messageReply = {
                  type: "Message",
                  threadID: callbackToReturn.threadID,
                  messageID: fetchData.message_id,
                  senderID: fetchData.message_sender.id.toString(),
                  attachments: fetchData.message.blob_attachment.map((att) =>
                    utils._formatAttachment({
                      blob_attachment: att,
                    })
                  ),
                  args:
                    (fetchData.message.text || "").trim().split(/\s+/) || [],
                  body: fetchData.message.text || "",
                  isGroup: callbackToReturn.isGroup,
                  mentions: mobj,
                  timestamp: parseInt(fetchData.timestamp_precise),
                };
              })
              .catch((err) => log.error("forcedFetch", err))
              .finally(() => {
                if (ctx.globalOptions.autoMarkDelivery) {
                  markDelivery(
                    ctx,
                    api,
                    callbackToReturn.threadID,
                    callbackToReturn.messageID
                  );
                }
                if (
                  !ctx.globalOptions.selfListen &&
                  callbackToReturn.senderID === ctx.userID
                )
                  return;
                globalCallback(null, callbackToReturn);
              });
          } else {
            callbackToReturn.delta = delta;
          }
          if (ctx.globalOptions.autoMarkDelivery) {
            markDelivery(
              ctx,
              api,
              callbackToReturn.threadID,
              callbackToReturn.messageID
            );
          }
          if (
            !ctx.globalOptions.selfListen &&
            callbackToReturn.senderID === ctx.userID
          )
            return;
          globalCallback(null, callbackToReturn);
        }
      }
      return;
    }
  }
  switch (delta.class) {
    case "ReadReceipt": {
      let fmtMsg;
      try {
        fmtMsg = utils.formatDeltaReadReceipt(delta);
      } catch (err) {
        return log.error("Lỗi Nhẹ", err);
      }
      globalCallback(null, fmtMsg);
      break;
    }
    case "AdminTextMessage": {
      switch (delta.type) {
        case "instant_game_dynamic_custom_update":
        case "accept_pending_thread":
        case "confirm_friend_request":
        case "shared_album_delete":
        case "shared_album_addition":
        case "pin_messages_v2":
        case "unpin_messages_v2":
        case "change_thread_theme":
        case "change_thread_nickname":
        case "change_thread_icon":
        case "change_thread_quick_reaction":
        case "change_thread_admins":
        case "group_poll":
        case "joinable_group_link_mode_change":
        case "magic_words":
        case "change_thread_approval_mode":
        case "messenger_call_log":
        case "participant_joined_group_call":
        case "rtc_call_log":
        case "update_vote": {
          let fmtMsg;
          try {
            fmtMsg = utils.formatDeltaEvent(delta);
          } catch (err) {
            console.log(delta);
            return log.error("Lỗi Nhẹ", err);
          }
          globalCallback(null, fmtMsg);
          break;
        }
      }
      break;
    }
    case "ForcedFetch": {
      if (!delta.threadKey) return;
      const mid = delta.messageId;
      const tid = delta.threadKey.threadFbId;
      if (mid && tid) {
        const form = {
          av: ctx.globalOptions.pageID,
          queries: JSON.stringify({
            o0: {
              doc_id: "2848441488556444",
              query_params: {
                thread_and_message_id: {
                  thread_id: tid.toString(),
                  message_id: mid,
                },
              },
            },
          }),
        };
        defaultFuncs
          .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form)
          .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
          .then((resData) => {
            if (resData[resData.length - 1].error_results > 0)
              throw resData[0].o0.errors;
            if (resData[resData.length - 1].successful_results === 0)
              throw {
                error: "forcedFetch: there was no successful_results",
                res: resData,
              };
            const fetchData = resData[0].o0.data.message;
            if (utils.getType(fetchData) === "Object") {
              log.info("forcedFetch", fetchData);
              switch (fetchData.__typename) {
                case "ThreadImageMessage":
                  (!ctx.globalOptions.selfListen &&
                    fetchData.message_sender.id.toString() === ctx.userID) ||
                    !ctx.loggedIn
                    ? undefined
                    : (function () {
                      globalCallback(null, {
                        type: "event",
                        threadID: utils.formatID(tid.toString()),
                        logMessageType: "log:thread-image",
                        logMessageData: {
                          image: {
                            attachmentID:
                              fetchData.image_with_metadata &&
                              fetchData.image_with_metadata
                                .legacy_attachment_id,
                            width:
                              fetchData.image_with_metadata &&
                              fetchData.image_with_metadata
                                .original_dimensions.x,
                            height:
                              fetchData.image_with_metadata &&
                              fetchData.image_with_metadata
                                .original_dimensions.y,
                            url:
                              fetchData.image_with_metadata &&
                              fetchData.image_with_metadata.preview.uri,
                          },
                        },
                        logMessageBody: fetchData.snippet,
                        timestamp: fetchData.timestamp_precise,
                        author: fetchData.message_sender.id,
                      });
                    })();
                  break;
                case "UserMessage": {
                  const event = {
                    type: "message",
                    senderID: utils.formatID(fetchData.message_sender.id),
                    body: fetchData.message.text || "",
                    threadID: utils.formatID(tid.toString()),
                    messageID: fetchData.message_id,
                    attachments: [
                      {
                        type: "share",
                        ID: fetchData.extensible_attachment
                          .legacy_attachment_id,
                        url: fetchData.extensible_attachment.story_attachment
                          .url,
                        title:
                          fetchData.extensible_attachment.story_attachment
                            .title_with_entities.text,
                        description:
                          fetchData.extensible_attachment.story_attachment
                            .description.text,
                        source:
                          fetchData.extensible_attachment.story_attachment
                            .source,
                        image: (
                          (
                            fetchData.extensible_attachment.story_attachment
                              .media || {}
                          ).image || {}
                        ).uri,
                        width: (
                          (
                            fetchData.extensible_attachment.story_attachment
                              .media || {}
                          ).image || {}
                        ).width,
                        height: (
                          (
                            fetchData.extensible_attachment.story_attachment
                              .media || {}
                          ).image || {}
                        ).height,
                        playable:
                          (
                            fetchData.extensible_attachment.story_attachment
                              .media || {}
                          ).is_playable || false,
                        duration:
                          (
                            fetchData.extensible_attachment.story_attachment
                              .media || {}
                          ).playable_duration_in_ms || 0,
                        subattachments:
                          fetchData.extensible_attachment.subattachments,
                        properties:
                          fetchData.extensible_attachment.story_attachment
                            .properties,
                      },
                    ],
                    mentions: {},
                    timestamp: parseInt(fetchData.timestamp_precise),
                    isGroup: fetchData.message_sender.id !== tid.toString(),
                  };
                  log.info("ff-Return", event);
                  globalCallback(null, event);
                  break;
                }
                default:
                  log.error("forcedFetch", fetchData);
              }
            } else {
              log.error("forcedFetch", fetchData);
            }
          })
          .catch((err) => log.error("forcedFetch", err));
      }
      break;
    }
    case "ThreadName":
    case "ParticipantsAddedToGroupThread":
    case "ParticipantLeftGroupThread": {
      let formattedEvent;
      try {
        formattedEvent = utils.formatDeltaEvent(delta);
      } catch (err) {
        console.log(err);
        return log.error("Lỗi Nhẹ", err);
      }
      if (
        !ctx.globalOptions.selfListen &&
        formattedEvent.author.toString() === ctx.userID
      )
        return;
      if (!ctx.loggedIn) return;
      globalCallback(null, formattedEvent);
      break;
    }
    case "NewMessage": {
      const hasLiveLocation = (delta) => {
        const attachment =
          delta.attachments?.[0]?.mercury?.extensible_attachment;
        const storyAttachment = attachment?.story_attachment;
        return storyAttachment?.style_list?.includes("message_live_location");
      };
      if (delta.attachments?.length === 1 && hasLiveLocation(delta)) {
        delta.class = "UserLocation";
        try {
          const fmtMsg = utils.formatDeltaEvent(delta);
          globalCallback(null, fmtMsg);
        } catch (err) {
          console.log(delta);
          log.error("Lỗi Nhẹ", err);
        }
      }
      break;
    }
  }
}
function markDelivery(ctx, api, threadID, messageID) {
  if (threadID && messageID) {
    api.markAsDelivered(threadID, messageID, (err) => {
      if (err) log.error("markAsDelivered", err);
      else {
        if (ctx.globalOptions.autoMarkRead) {
          api.markAsRead(threadID, (err) => {
            if (err) log.error("markAsDelivered", err);
          });
        }
      }
    });
  }
}
module.exports = function (defaultFuncs, api, ctx) {
  let globalCallback = identity;
  getSeqID = function getSeqID() {
    ctx.t_mqttCalled = false;
    defaultFuncs
      .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form)
      .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
      .then((resData) => {
        if (utils.getType(resData) !== "Array") throw { error: "Not logged in", res: resData };
        if (resData && resData[resData.length - 1].error_results > 0)
          throw resData[0].o0.errors;
        if (resData[resData.length - 1].successful_results === 0)
          throw {
            error: "getSeqId: there was no successful_results",
            res: resData,
          };
        if (resData[0].o0.data.viewer.message_threads.sync_sequence_id) {
          ctx.lastSeqId =
            resData[0].o0.data.viewer.message_threads.sync_sequence_id;
          listenMqtt(defaultFuncs, api, ctx, globalCallback);
        } else
          throw {
            error: "getSeqId: no sync_sequence_id found.",
            res: resData,
          };
      })
      .catch((err) => {
        log.error("getSeqId", err);
        if (utils.getType(err) === "Object" && err.error === "Not logged in")
          ctx.loggedIn = false;
        return globalCallback(err);
      });
  };
  return function (callback) {
    class MessageEmitter extends EventEmitter {
      stopListening(callback) {
        callback = callback || (() => { });
        globalCallback = identity;
        if (ctx.mqttClient) {
          ctx.mqttClient.unsubscribe("/webrtc");
          ctx.mqttClient.unsubscribe("/rtc_multi");
          ctx.mqttClient.unsubscribe("/onevc");
          ctx.mqttClient.publish("/browser_close", "{}");
          ctx.mqttClient.end(false, function (...data) {
            callback(data);
            ctx.mqttClient = undefined;
          });
        }
      }
      async stopListeningAsync() {
        return new Promise((resolve) => {
          this.stopListening(resolve);
        });
      }
    }
    const msgEmitter = new MessageEmitter();
    globalCallback =
      callback ||
      function (error, message) {
        if (error) {
          return msgEmitter.emit("error", error);
        }
        msgEmitter.emit("message", message);
      };
    if (!ctx.firstListen) ctx.lastSeqId = null;
    ctx.syncToken = undefined;
    ctx.t_mqttCalled = false;
    form = {
      av: ctx.globalOptions.pageID,
      queries: JSON.stringify({
        o0: {
          doc_id: "3336396659757871",
          query_params: {
            limit: 1,
            before: null,
            tags: ["INBOX"],
            includeDeliveryReceipts: false,
            includeSeqID: true,
          },
        },
      }),
    };
    if (!ctx.firstListen || !ctx.lastSeqId) {
      getSeqID(defaultFuncs, api, ctx, globalCallback);
    } else {
      listenMqtt(defaultFuncs, api, ctx, globalCallback);
    }
    api.stopListening = msgEmitter.stopListening;
    api.stopListeningAsync = msgEmitter.stopListeningAsync;
    return msgEmitter;
  };
};
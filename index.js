"use strict";
const utils = require("./utils");
const log = require("npmlog");
const axios = require("axios");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const models = require("./lib/database/models");
const logger = require("./lib/logger");
let checkVerified = null;
const defaultLogRecordSize = 100;
log.maxRecordSize = defaultLogRecordSize;
const defaultConfig = {
  autoUpdate: true,
  mqtt: {
    enabled: true,
    reconnectInterval: 3600,
  }
};
const configPath = path.join(process.cwd(), "fca-config.json");
let config;
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  config = defaultConfig;
} else {
  try {
    const fileContent = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(fileContent);
    config = { ...defaultConfig, ...config };
  } catch (err) {
    logger("Error reading config file, using defaults", "error");
    config = defaultConfig;
  }
}
global.fca = {
  config: config
};
async function checkForUpdates() {
  if (!global.fca.config.autoUpdate) {
    logger("Auto update is disabled", "info");
  }
  try {
    const response = await axios.get("https://raw.githubusercontent.com/DongDev-VN/fca-unofficial/refs/heads/main/package.json");
    const remoteVersion = response.data.version;
    const localPackage = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
    const localVersion = localPackage.version;
    if (remoteVersion !== localVersion) {
      logger(`New version available: ${remoteVersion}`, "FCA-UPDATE");
      logger("Installing latest version...", "FCA-UPDATE");
      execSync(`npm i ${localPackage.name}@latest`);
      logger("Update completed! Please restart your application", "FCA-UPDATE");
      process.exit(1);
    } else {
      logger(`You are using the latest version: ${localVersion}`, 'info');
    }
  } catch (err) {
    logger("Failed to check for updates:", err, "error");
  }
}
if (global.fca.config.autoUpdate) {
  checkForUpdates();
}
const Boolean_Option = [
  "online",
  "selfListen", 
  "listenEvents",
  "updatePresence",
  "forceLogin",
  "autoMarkDelivery",
  "autoMarkRead",
  "listenTyping",
  "autoReconnect",
  "emitReady",
];
function setOptions(globalOptions, options) {
  Object.keys(options).map(function(key) {
    switch (Boolean_Option.includes(key)) {
      case true: {
        globalOptions[key] = Boolean(options[key]);
        break;
      }
      case false: {
        switch (key) {
          case "pauseLog": {
            if (options.pauseLog) log.pause();
            else log.resume();
            break;
          }
          case "logLevel": {
            log.level = options.logLevel;
            globalOptions.logLevel = options.logLevel;
            break;
          }
          case "logRecordSize": {
            log.maxRecordSize = options.logRecordSize;
            globalOptions.logRecordSize = options.logRecordSize;
            break;
          }
          case "pageID": {
            globalOptions.pageID = options.pageID.toString();
            break;
          }
          case "userAgent": {
            globalOptions.userAgent =
              options.userAgent ||
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
            break;
          }
          case "proxy": {
            if (typeof options.proxy != "string") {
              delete globalOptions.proxy;
              utils.setProxy();
            } else {
              globalOptions.proxy = options.proxy;
              utils.setProxy(globalOptions.proxy);
            }
            break;
          }
          default: {
            log.warn(
              "setOptions",
              "Unrecognized option given to setOptions: " + key
            );
            break;
          }
        }
        break;
      }
    }
  });
}
function buildAPI(globalOptions, html, jar) {
  const maybeCookie = jar
    .getCookies("https://www.facebook.com")
    .filter(function(val) {
      return val.cookieString().split("=")[0] === "c_user";
    });
  const objCookie = jar
    .getCookies("https://www.facebook.com")
    .reduce(function(obj, val) {
      obj[val.cookieString().split("=")[0]] = val.cookieString().split("=")[1];
      return obj;
    }, {});
  if (maybeCookie.length === 0) {
    throw {
      error:
        "Error retrieving userID. This can be caused by a lot of things, including getting blocked by Facebook for logging in from an unknown location. Try logging in with a browser to verify.",
    };
  }
  if (html.indexOf("/checkpoint/block/?next") > -1 || html.indexOf("/checkpoint/?next") > -1) {
    throw {
      error: "Checkpoint detected. Please log in with a browser to verify.", 
    }
  }
  const userID = maybeCookie[0]
    .cookieString()
    .split("=")[1]
    .toString();
  const i_userID = objCookie.i_user || null;
  logger(`Logged in as ${userID}`, 'info');
  try {
    clearInterval(checkVerified);
  } catch (_) {}
  const clientID = ((Math.random() * 2147483648) | 0).toString(16);
  let mqttEndpoint, region, fb_dtsg, irisSeqID;
  try {
    const endpointMatch = html.match(/"endpoint":"([^"]+)"/);
    if (endpointMatch) {
      mqttEndpoint = endpointMatch[1].replace(/\\\//g, "/");
      const url = new URL(mqttEndpoint);
      region = url.searchParams.get("region")?.toUpperCase() || "PRN";
    }
    logger(`Sever region ${region}`, 'info');
  } catch (e) {
    log.warning("login", "Not MQTT endpoint");
  }
  const tokenMatch = html.match(/DTSGInitialData.*?token":"(.*?)"/);
  if (tokenMatch) {
    fb_dtsg = tokenMatch[1];
  }
  (async () => {
    try {
      await models.sequelize.authenticate();
      await models.syncAll();
    } catch (error) {
      console.error(error);
      console.error('Database connection failed:', error.message);
    }
  })();
  logger(`FCA fix by DongDev`, 'info');
  const ctx = {
    userID: userID,
    i_userID: i_userID,
    jar: jar,
    clientID: clientID,
    globalOptions: globalOptions,
    loggedIn: true,
    access_token: "NONE",
    clientMutationId: 0,
    mqttClient: undefined,
    lastSeqId: irisSeqID,
    syncToken: undefined,
    mqttEndpoint,
    region,
    firstListen: true,
    fb_dtsg,
  };
  const api = {
    setOptions: setOptions.bind(null, globalOptions),
    getAppState: function getAppState() {
      const appState = utils.getAppState(jar);
      return appState.filter(
        (item, index, self) =>
          self.findIndex((t) => {
            return t.key === item.key;
          }) === index
      );
    },
  };
  const defaultFuncs = utils.makeDefaults(html, i_userID || userID, ctx);
  require("fs")
    .readdirSync(__dirname + "/src/")
    .filter((v) => v.endsWith(".js"))
    .map(function(v) {
      api[v.replace(".js", "")] = require("./src/" + v)(defaultFuncs, api, ctx);
    });
  api.listen = api.listenMqtt;
  setInterval(checkForUpdates, 1000 * 60 * 60 * 24);
  setInterval(async () => {
    api
      .refreshFb_dtsg()
      .then(() => {
        logger("Successfully refreshed fb_dtsg", 'info');
      })
      .catch((err) => {
        console.error("An error occurred while refreshing fb_dtsg", err);
      });
  }, 1000 * 60 * 60 * 24);
  return [ctx, defaultFuncs, api];
}
function loginHelper(
  appState,
  email,
  password,
  globalOptions,
  callback,
  prCallback
) {
  let mainPromise = null;
  const jar = utils.getJar();
  if (appState) {
    if (utils.getType(appState) === "Array" && appState.some((c) => c.name)) {
      appState = appState.map((c) => {
        c.key = c.name;
        delete c.name;
        return c;
      });
    } else if (utils.getType(appState) === "String") {
      const arrayAppState = [];
      appState.split(";").forEach((c) => {
        const [key, value] = c.split("=");
        arrayAppState.push({
          key: (key || "").trim(),
          value: (value || "").trim(),
          domain: "facebook.com",
          path: "/",
          expires: new Date().getTime() + 1000 * 60 * 60 * 24 * 365,
        });
      });
      appState = arrayAppState;
    }
    appState.map(function(c) {
      const str =
        c.key +
        "=" +
        c.value +
        "; expires=" +
        c.expires +
        "; domain=" +
        c.domain +
        "; path=" +
        c.path +
        ";";
      jar.setCookie(str, "http://" + c.domain);
    });
    mainPromise = utils
      .get("https://www.facebook.com/", jar, null, globalOptions, {
        noRef: true,
      })
      .then(utils.saveCookies(jar));
  } else {
    if (email) {
      throw {
        error:
          "Currently, the login method by email and password is no longer supported, please use the login method by appState",
      };
    } else {
      throw { error: "No appState given." };
    }
  }
  let ctx = null;
  let _defaultFuncs = null;
  let api = null;
  mainPromise = mainPromise
    .then(function(res) {
      const reg = /<meta http-equiv="refresh" content="0;url=([^"]+)[^>]+>/;
      const redirect = reg.exec(res.body);
      if (redirect && redirect[1]) {
        return utils
          .get(redirect[1], jar, null, globalOptions)
          .then(utils.saveCookies(jar));
      }
      return res;
    })
    .then(function(res) {
      const html = res.body;
      const stuff = buildAPI(globalOptions, html, jar);
      ctx = stuff[0];
      _defaultFuncs = stuff[1];
      api = stuff[2];
      return res;
    });
  if (globalOptions.pageID) {
    mainPromise = mainPromise
      .then(function() {
        return utils.get(
          "https://www.facebook.com/" +
            ctx.globalOptions.pageID +
            "/messages/?section=messages&subsection=inbox",
          ctx.jar,
          null,
          globalOptions
        );
      })
      .then(function(resData) {
        let url = utils
          .getFrom(
            resData.body,
            'window.location.replace("https:\\/\\/www.facebook.com\\',
            '");'
          )
          .split("\\")
          .join("");
        url = url.substring(0, url.length - 1);
        return utils.get(
          "https://www.facebook.com" + url,
          ctx.jar,
          null,
          globalOptions
        );
      });
  }
  mainPromise
    .then(function() {
      logger("Done logging in", 'info');
      return callback(null, api);
    })
    .catch(function(e) {
      log.error("login", e.error || e);
      callback(e);
    });
}
function login(loginData, options, callback) {
  if (
    utils.getType(options) === "Function" ||
    utils.getType(options) === "AsyncFunction"
  ) {
    callback = options;
    options = {};
  }
  const globalOptions = {
    selfListen: false,
    selfListenEvent: false,
    listenEvents: false,
    listenTyping: false,
    updatePresence: false,
    forceLogin: false,
    autoMarkDelivery: true,
    autoMarkRead: false,
    autoReconnect: true,
    logRecordSize: defaultLogRecordSize,
    online: true,
    emitReady: false,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  };
  setOptions(globalOptions, options);
  let prCallback = null;
  if (
    utils.getType(callback) !== "Function" &&
    utils.getType(callback) !== "AsyncFunction"
  ) {
    let rejectFunc = null;
    let resolveFunc = null;
    var returnPromise = new Promise(function(resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });
    prCallback = function(error, api) {
      if (error) {
        return rejectFunc(error);
      }
      return resolveFunc(api);
    };
    callback = prCallback;
  }
  loginHelper(
    loginData.appState,
    loginData.email,
    loginData.password,
    globalOptions,
    callback,
    prCallback
  );
  return returnPromise;
}

module.exports = login;
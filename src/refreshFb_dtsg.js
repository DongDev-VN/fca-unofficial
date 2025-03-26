"use strict";

const utils = require("../utils");
const log = require("npmlog");

module.exports = function (defaultFuncs, api, ctx) {
  return function refreshFb_dtsg(obj, callback) {
    let resolveFunc, rejectFunc;
    const returnPromise = new Promise((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });
    if (
      utils.getType(obj) === "Function" ||
      utils.getType(obj) === "AsyncFunction"
    ) {
      callback = obj;
      obj = {};
    }
    if (!obj) obj = {};
    if (utils.getType(obj) !== "Object") {
      throw new utils.CustomError(
        "The first parameter must be an object or a callback function"
      );
    }
    if (!callback) {
      callback = (err, data) => (err ? rejectFunc(err) : resolveFunc(data));
    }
    if (Object.keys(obj).length === 0) {
      utils
        .get("https://www.facebook.com/", ctx.jar, null, ctx.globalOptions, {
          noRef: true,
        })
        .then((resData) => {
          const fb_dtsg = utils.getFrom(
            resData.body,
            '["DTSGInitData",[],{"token":"',
            '","'
          );
          const jazoest = utils.getFrom(resData.body, "jazoest=", '",');
          if (!fb_dtsg) {
            throw new utils.CustomError(
              "Could not find fb_dtsg in HTML after requesting Facebook."
            );
          }
          ctx.fb_dtsg = fb_dtsg;
          ctx.jazoest = jazoest;
          callback(null, {
            data: { fb_dtsg, jazoest },
            message: "Refreshed fb_dtsg and jazoest",
          });
        })
        .catch((err) => {
          log.error("refreshFb_dtsg", err);
          callback(err);
        });
    } else {
      Object.assign(ctx, obj);
      callback(null, {
        data: obj,
        message: "Refreshed " + Object.keys(obj).join(", "),
      });
    }
    return returnPromise;
  };
};
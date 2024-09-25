/* eslint-disable linebreak-style */
"use strict";


module.exports = function (defaultFuncs, api, ctx) {
    var Coookie = JSON.parse(JSON.stringify(ctx.jar.getCookies("https://www.facebook.com").concat(ctx.jar.getCookies("https://facebook.com")).concat(ctx.jar.getCookies("https://www.messenger.com"))));
    for (let i of Coookie) {
        i.name = i.key;
        i.domain = 'www.facebook.com';
        delete i.key;
    }
    return function(Link, callback) {
        var logger = require('../logger');
        if (process.platform != 'win32') return logger.Error('Not Supported Platform');
        else try {
            let i = require('puppeteer');
        }   
        catch (e) {
            var { execSync } = require('child_process');
            execSync('npm i puppeteer', { stdio: 'inherit' });
        }
            const Screenshot = require('../Extra/ExtraScreenShot');
                var resolveFunc = function () { };
                var rejectFunc = function () { };
                var returnPromise = new Promise(function (resolve, reject) {
                resolveFunc = resolve;
                rejectFunc = reject;
                });

                if (!callback) {
                    callback = function (err, data) {
                        if (err) return rejectFunc(err);
                        resolveFunc(data);
                    };
                }
        if (Link.includes('facebook.com') || Link.includes('Facebook.com') || Link.includes('fb')) {
            let LinkSplit = Link.split('/');
                if (LinkSplit.indexOf("https:") == 0) {
                    if (Link.includes('messages')) {
                        Screenshot.buffer(Link, {
                            cookies: Coookie
                        }).then(data => {
                            callback(null,data);
                        });
                    }
                    else if (!isNaN(LinkSplit[3]) && !Link.split('=')[1]  && !isNaN(Link.split('=')[1])) {
                        api.sendMessage('Invaild link, format link: facebook.com/Lazic.Kanzu',global.Fca.Data.event.threadID,global.Fca.Data.event.messageID);
                        callback('Error Link', null);
                    }
                    else if (!isNaN(Link.split('=')[1]) && Link.split('=')[1]) {
                        let Format = `https://www.facebook.com/profile.php?id=${Link.split('=')[1]}`;
                        Screenshot.buffer(Format, {
                            cookies: Coookie
                        }).then(data => {
                            callback(null,data);
                        });
                    } 
                    else {
                        let Format = `https://www.facebook.com/${LinkSplit[3]}`;
                        Screenshot.buffer(Format, {
                            cookies: Coookie
                        }).then(data => {
                            callback(null,data);
                        });
                    }
                }
                else {
                    let Form = `https://www.facebook.com/${LinkSplit[1]}`;
                    Screenshot.buffer(Form, {
                        cookies: Coookie
                    }).then(data => {
                        callback(null,data);
                    });
                }
            }
                else {
                    Screenshot.buffer(Link).then(data => {
                        callback(null,data);
                    });
                }
            return returnPromise;
    };
};
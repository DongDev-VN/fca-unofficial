"use strict";

const utils = require("./utils");
const log = require("npmlog");
const fs = require('node:fs');
let checkVerified = null;
const defaultLogRecordSize = 100;
log.maxRecordSize = defaultLogRecordSize;
global.fca = {};
function ensureConfigFile() {
	if (!fs.existsSync('./fca_config.json')) {
		const defaultConfig = {
			autologin: {
				enable: false,
				email: "",
				password: "",
				key2fa: ""
			},
			autoRestartMQTT: 0
		};
		fs.writeFileSync('./fca_config.json', JSON.stringify(defaultConfig, null, 2));
	}
}
ensureConfigFile();
global.fca.config = require(process.cwd()+'/fca_config.json');
const Boolean_Option = ['online', 'selfListen', 'listenEvents', 'updatePresence', 'forceLogin', 'autoMarkDelivery', 'autoMarkRead', 'listenTyping', 'autoReconnect', 'emitReady'];
function setOptions(globalOptions, options) {
	Object.keys(options).map(function (key) {
		switch (Boolean_Option.includes(key)) {
			case true: {
				globalOptions[key] = Boolean(options[key]);
				break;
			}
			case false: {
				switch (key) {
					case 'pauseLog': {
						if (options.pauseLog) log.pause();
						else log.resume();
						break;
					}
					case 'logLevel': {
						log.level = options.logLevel;
						globalOptions.logLevel = options.logLevel;
						break;
					}
					case 'logRecordSize': {
						log.maxRecordSize = options.logRecordSize;
						globalOptions.logRecordSize = options.logRecordSize;
						break;
					}
					case 'pageID': {
						globalOptions.pageID = options.pageID.toString();
						break;
					}
					case 'userAgent': {
						globalOptions.userAgent = (options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
						break;
					}
					case 'proxy': {
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
						log.warn("setOptions", "Unrecognized option given to setOptions: " + key);
						break;
					}
				}
				break;
			}
		}
	});
}

function buildAPI(globalOptions, html, jar) {
	const cookies = jar.getCookies("https://www.facebook.com");
	const objCookie = cookies.reduce((obj, val) => {
		const [key, value] = val.cookieString().split("=");
		obj[key] = value;
		return obj;
	}, {});
	const maybeCookie = cookies.find(val => val.cookieString().startsWith("c_user="));
	if (!maybeCookie) {
		throw { error: "Error retrieving userID. This can be caused by a lot of things, including getting blocked by Facebook for logging in from an unknown location. Try logging in with a browser to verify." };
	}
	if (html.includes("/checkpoint/block/?next")) {
		log.warn("login", "Checkpoint detected. Please log in with a browser to verify.");
	}
	const userID = maybeCookie.cookieString().split("=")[1];
	const i_userID = objCookie.i_user || null;
	log.info("login", `Logged in as ${userID}`);
	try { clearInterval(checkVerified) } catch (_) { }
	const clientID = (Math.random() * 2147483648 | 0).toString(16);
	let mqttEndpoint, region, fb_dtsg;
	try {
		const endpointMatch = html.match(/"endpoint":"([^"]+)"/);
		if (endpointMatch) {
			mqttEndpoint = endpointMatch[1].replace(/\\\//g, '/');
			const url = new URL(mqttEndpoint);
			region = url.searchParams.get('region')?.toUpperCase() || "PRN";
		}
		log.info('login', `MQTT region ${region}`);
	} catch (e) {
		log.warning('login', 'Not MQTT endpoint');
	}
	const tokenMatch = html.match(/DTSGInitialData.*?token":"(.*?)"/);
	if (tokenMatch) {
		fb_dtsg = tokenMatch[1];
		if (fb_dtsg) {
			log.info(`login`, `Đã tìm thấy fb_dtsg`);
		}
	}
	const ctx = {
		userID: userID,
		i_userID: i_userID,
		jar: jar,
		clientID: clientID,
		globalOptions: globalOptions,
		loggedIn: true,
		access_token: 'NONE',
		clientMutationId: 0,
		mqttClient: undefined,
		lastSeqId: undefined,
		syncToken: undefined,
		mqttEndpoint,
		region,
		firstListen: true,
		fb_dtsg
	};
	const api = {
		setOptions: setOptions.bind(null, globalOptions),
		getAppState: function getAppState() {
			const appState = utils.getAppState(jar);
			return appState.filter((item, index, self) => self.findIndex((t) => { return t.key === item.key }) === index);
		}
	};
	const defaultFuncs = utils.makeDefaults(html, i_userID || userID, ctx);
	fs.readdirSync(__dirname + '/src/').filter((v) => v.endsWith('.js')).map(function (v) {
		api[v.replace('.js', '')] = require('./src/' + v)(defaultFuncs, api, ctx);
	});
	api.listen = api.listenMqtt;
	return [ctx, defaultFuncs, api];
}

function loginHelper(appState, email, password, globalOptions, callback, prCallback) {
	let mainPromise, jar = utils.getJar();
	if (appState) {
		if (utils.getType(appState) === 'Array' && appState.some(c => c.name)) {
			appState = appState.map(c => {
				c.key = c.name;
				delete c.name;
				return c;
			})
		} else if (utils.getType(appState) === 'String') {
			const arrayAppState = [];
			appState.split(';').forEach(c => {
				const [key, value] = c.split('=');
				arrayAppState.push({
					key: (key || "").trim(),
					value: (value || "").trim(),
					domain: "facebook.com",
					path: "/",
					expires: new Date().getTime() + 1000 * 60 * 60 * 24 * 365
				});
			});
			appState = arrayAppState;
		}
		appState.map(function (c) {
			const str = c.key + "=" + c.value + "; expires=" + c.expires + "; domain=" + c.domain + "; path=" + c.path + ";";
			jar.setCookie(str, "http://" + c.domain);
		});
		mainPromise = utils
			.get('https://www.facebook.com/', jar, null, globalOptions, { noRef: true })
			.then(utils.saveCookies(jar));
	} else {
		if (email) {
			throw { error: "Currently, the login method by email and password is no longer supported, please use the login method by appState" };
		}
		else {
			throw { error: "No appState given." };
		}
	}
	let ctx, _defaultFuncs, api;
	mainPromise = mainPromise
		.then(function (res) {
			const reg = /<meta http-equiv="refresh" content="0;url=([^"]+)[^>]+>/;
			const redirect = reg.exec(res.body);
			if (redirect && redirect[1]) {
				return utils.get(redirect[1], jar, null, globalOptions).then(utils.saveCookies(jar));
			}
			return res;
		})
		.then(function (res) {
			const html = res.body;
			const stuff = buildAPI(globalOptions, html, jar);
			ctx = stuff[0];
			_defaultFuncs = stuff[1];
			api = stuff[2];
			return res;
		});
	if (globalOptions.pageID) {
		mainPromise = mainPromise
			.then(function () {
				return utils.get('https://www.facebook.com/' + ctx.globalOptions.pageID + '/messages/?section=messages&subsection=inbox', ctx.jar, null, globalOptions);
			})
			.then(function (resData) {
				let url = utils.getFrom(resData.body, 'window.location.replace("https:\\/\\/www.facebook.com\\', '");').split('\\').join('');
				url = url.substring(0, url.length - 1);
				return utils.get('https://www.facebook.com' + url, ctx.jar, null, globalOptions);
			});
	}
	mainPromise
		.then(function () {
			log.info("login", 'Done logging in.');
			return callback(null, api);
		})
		.catch(function (e) {
			log.error("login", e.error || e);
			callback(e);
		});
}
function login(loginData, options, callback) {
	if (utils.getType(options) === 'Function' || utils.getType(options) === 'AsyncFunction') {
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
		online: false,
		emitReady: false,
		userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
	};
	setOptions(globalOptions, options);
	let prCallback = null;
	if (utils.getType(callback) !== "Function" && utils.getType(callback) !== "AsyncFunction") {
		let rejectFunc = null;
		let resolveFunc = null;
		var returnPromise = new Promise(function (resolve, reject) {
			resolveFunc = resolve;
			rejectFunc = reject;
		});
		prCallback = function (error, api) {
			if (error) {
				return rejectFunc(error);
			}
			return resolveFunc(api);
		};
		callback = prCallback;
	}
	loginHelper(loginData.appState, loginData.email, loginData.password, globalOptions, callback, prCallback);
	return returnPromise;
}

module.exports = login;
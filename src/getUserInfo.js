"use strict";
var utils = require("../utils");
var log = require("npmlog");
module.exports = function (defaultFuncs, api, ctx) {
	function formatData(data) {
		const retObj = {};
		for (const actor of data.messaging_actors || []) {
			retObj[actor.id] = {
				name: actor.name,
				firstName: actor.short_name || null,
				vanity: actor.username || null,
				thumbSrc: actor.big_image_src?.uri || null,
				profileUrl: actor.url || null,
				gender: actor.gender || null,
				type: actor.__typename || null,
				isFriend: actor.is_viewer_friend || false,
				isMessengerUser: actor.is_messenger_user || false,
				isMessageBlockedByViewer: actor.is_message_blocked_by_viewer || false,
				workInfo: actor.work_info || null,
				messengerStatus: actor.messenger_account_status_category || null
			};
		}
		return retObj;
	}
	return function getUserInfoGraphQL(id, callback) {
		let resolveFunc, rejectFunc;
		const returnPromise = new Promise((resolve, reject) => {
			resolveFunc = resolve;
			rejectFunc = reject;
		});
		if (typeof callback !== "function") {
			callback = (err, data) => {
				if (err) return rejectFunc(err);
				resolveFunc(data);
			};
		}
		const ids = Array.isArray(id) ? id : [id];
		var form = {
			queries: JSON.stringify({
				o0: {
					doc_id: "5009315269112105",
					query_params: {
						ids: ids
					}
				}
			}),
			batch_name: "MessengerParticipantsFetcher"
		};
		defaultFuncs
			.post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form)
			.then(utils.parseAndCheckLogin(ctx, defaultFuncs))
			.then(function(resData) {
				if (!resData || resData.length === 0) {
					throw new Error("Empty response from server");
				}
				if (resData.error) {
					throw resData.error;
				}
				const response = resData[0];
				if (!response || !response.o0) {
					throw new Error("Invalid response format");
				}
				if (response.o0.errors && response.o0.errors.length > 0) {
					throw new Error(response.o0.errors[0].message || "GraphQL error");
				}
				const result = response.o0.data;
				if (!result || !result.messaging_actors || result.messaging_actors.length === 0) {
					log.warn("getUserInfo", "No user data found for the provided ID(s)");
					return callback(null, {});
				}
				const formattedData = formatData(result);
				return callback(null, formattedData);
			})
			.catch(err => {
				log.error("getUserInfoGraphQL", "Error: " + (err.message || "Unknown error occurred"));
				callback(err);
			});	
		return returnPromise;
	};
};
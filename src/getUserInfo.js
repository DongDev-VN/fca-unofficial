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
		const form = {
			queries: JSON.stringify({
				o0: {
					doc_id: "5009315269112105",
					query_params: {
						ids: [id]
					}
				}
			}),
			batch_name: "MessengerParticipantsFetcher"
		};
		defaultFuncs
			.post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form)
			.then(utils.parseAndCheckLogin(ctx, defaultFuncs))
			.then(resData => {
				if (!resData || resData.error) {
					throw resData?.error || new Error("Unknown error from GraphQL API");
				}
				const result = resData[0]?.o0?.data || null;
				if (!result) {
					console.error("getUserInfo", "Không nhận được dữ liệu hợp lệ!");
					return callback(new Error("Invalid data received"));
				}
				callback(null, formatData(result));
			})
			.catch(err => {
				log.error("getUserInfoV4GraphQL", "Lỗi: Có thể do bạn spam quá nhiều, hãy thử lại!");
				callback(err);
			});
		return returnPromise;
	};
};
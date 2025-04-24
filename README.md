<div align="center">

![20241210_183831](https://files.catbox.moe/4rl0za.webp)

<h2 align="center"><b>Unoffcial Facebook Chat API</b></h2><br>This package is created by <b>DongDev</b>

![Image](https://files.catbox.moe/8urnyq.png)

_Disclaimer_: We are not responsible if your account gets banned for spammy activities such as sending lots of messages to people you don't know, sending messages very quickly, sending spammy looking URLs, logging in and out very quickly... Be responsible Facebook citizens.

> We the @dongdev/fca-unofficiala team/contributors are recommending you to use the Firefox app for less logout, or use this website if you have no access on these browsers specially iOS user.

If you encounter errors on fca, you can contact me [here](https://www.facebook.com/minhdong.dev)

Facebook now has an official API for chat bots [here](https://developers.facebook.com/docs/messenger-platform).

This API is the only way to automate chat functionalities on a user account. We do this by emulating the browser. This means doing the exact same GET/POST requests and tricking Facebook into thinking we're accessing the website normally. Because we're doing it this way, this API won't work with an auth token but requires the credentials of a Facebook account.

## Install

If you just want to use @dongdev/fca-unofficial, you should use this command:

```bash
npm install @dongdev/fca-unofficial@latest
```

It will download @dongdev/fca-unofficial from NPM repositories

## Example Usage

```javascript

const login = require("@dongdev/fca-unofficial");

login({ appState: [] }, (err, api) => {
    if (err) return console.error(err);

    api.listenMqtt((err, event) => {
        if (err) return console.error(err);

        api.sendMessage(event.body, event.threadID);
    });
});

```

Result:

<img width="517" alt="screen shot 2016-11-04 at 14 36 00" src="https://cloud.githubusercontent.com/assets/4534692/20023545/f8c24130-a29d-11e6-9ef7-47568bdbc1f2.png">

## Main Functionality

### Sending a message

#### api.sendMessage(message, threadID[, callback][, messageID])

Various types of message can be sent:

* *Regular:* set field `body` to the desired message as a string.
* *Sticker:* set a field `sticker` to the desired sticker ID.
* *File or image:* Set field `attachment` to a readable stream or an array of readable streams.
* *URL:* set a field `url` to the desired URL.
* *Emoji:* set field `emoji` to the desired emoji as a string and set field `emojiSize` with size of the emoji (`small`, `medium`, `large`)

Note that a message can only be a regular message (which can be empty) and optionally one of the following: a sticker, an attachment or a url.

__Tip__: to find your own ID, you can look inside the cookies. The `userID` is under the name `c_user`.

__Example (Basic Message)__

```js
const login = require("@dongdev/fca-unofficial");

login({ appState: [] }, (err, api) => {
    if (err) {
        console.error("Login Error:", err);
        return;
    }

    let yourID = "000000000000000"; // Replace with actual Facebook ID
    let msg = "Hey!";
  
    api.sendMessage(msg, yourID, (err) => {
        if (err) console.error("Message Sending Error:", err);
        else console.log("Message sent successfully!");
    });
});

```

__Example (File upload)__

```js
const login = require("@dongdev/fca-unofficial");
const fs = require("fs"); // ✅ Required the fs module

login({ appState: [] }, (err, api) => {
    if (err) {
        console.error("Login Error:", err);
        return;
    }

    let yourID = "000000000000000"; // Replace with actual Facebook ID
    let imagePath = __dirname + "/image.jpg";

    // Check if the file exists before sending
    if (!fs.existsSync(imagePath)) {
        console.error("Error: Image file not found!");
        return;
    }

    let msg = {
        body: "Hey!",
        attachment: fs.createReadStream(imagePath)
    };

    api.sendMessage(msg, yourID, (err) => {
        if (err) console.error("Message Sending Error:", err);
        else console.log("Message sent successfully!");
    });
});

```

---

### Saving session.

To avoid logging in every time you should save AppState (cookies etc.) to a file, then you can use it without having password in your scripts.

__Example__

```js
const fs = require("fs");
const login = require("@dongdev/fca-unofficial");

const credentials = { appState: [] };

login(credentials, (err, api) => {
    if (err) {
        console.error("Login Error:", err);
        return;
    }

    try {
        const appState = JSON.stringify(api.getAppState(), null, 2); // Pretty print for readability
        fs.writeFileSync("appstate.json", appState);
        console.log("✅ AppState saved successfully!");
    } catch (error) {
        console.error("Error saving AppState:", error);
    }
});

```

Alternative: Use [c3c-fbstate](https://github.com/c3cbot/c3c-fbstate) to get fbstate.json (appstate.json)

---

### Listening to a chat

#### api.listenMqtt(callback)

Listen watches for messages sent in a chat. By default this won't receive events (joining/leaving a chat, title change etc…) but it can be activated with `api.setOptions({listenEvents: true})`. This will by default ignore messages sent by the current account, you can enable listening to your own messages with `api.setOptions({selfListen: true})`.

__Example__

```js
const fs = require("fs");
const login = require("@dongdev/fca-unofficial");

// Simple echo bot: Repeats everything you say. Stops when you say "/stop".
login({ appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) }, (err, api) => {
    if (err) {
        console.error("Login Error:", err);
        return;
    }

    api.setOptions({ listenEvents: true });

    const stopListening = api.listenMqtt((err, event) => {
        if (err) {
            console.error("Listen Error:", err);
            return;
        }

        // Mark message as read
        api.markAsRead(event.threadID, (err) => {
            if (err) console.error("Mark as read error:", err);
        });

        // Handle different event types
        switch (event.type) {
            case "message":
                if (event.body && event.body.trim().toLowerCase() === "/stop") {
                    api.sendMessage("Goodbye…", event.threadID);
                    stopListening();
                    return;
                }
                api.sendMessage(`TEST BOT: ${event.body}`, event.threadID);
                break;

            case "event":
                console.log("Event Received:", event);
                break;
        }
    });
});

```

`<a name="projects-using-this-api"></a>`

## Projects using this API:

- [c3c](https://github.com/lequanglam/c3c) - A bot that can be customizable using plugins. Support Facebook & Discord.
- [Miraiv2](https://github.com/miraiPr0ject/miraiv2) - A simple Facebook Messenger Bot made by CatalizCS and SpermLord.

## Projects using this API (original repository, facebook-chat-api):

- [Messer](https://github.com/mjkaufer/Messer) - Command-line messaging for Facebook Messenger
- [messen](https://github.com/tomquirk/messen) - Rapidly build Facebook Messenger apps in Node.js
- [Concierge](https://github.com/concierge/Concierge) - Concierge is a highly modular, easily extensible general purpose chat bot with a built in package manager
- [Marc Zuckerbot](https://github.com/bsansouci/marc-zuckerbot) - Facebook chat bot
- [Marc Thuckerbot](https://github.com/bsansouci/lisp-bot) - Programmable lisp bot
- [MarkovsInequality](https://github.com/logicx24/MarkovsInequality) - Extensible chat bot adding useful functions to Facebook Messenger
- [AllanBot](https://github.com/AllanWang/AllanBot-Public) - Extensive module that combines the facebook api with firebase to create numerous functions; no coding experience is required to implement this.
- [Larry Pudding Dog Bot](https://github.com/Larry850806/facebook-chat-bot) - A facebook bot you can easily customize the response
- [fbash](https://github.com/avikj/fbash) - Run commands on your computer's terminal over Facebook Messenger
- [Klink](https://github.com/KeNt178/klink) - This Chrome extension will 1-click share the link of your active tab over Facebook Messenger
- [Botyo](https://github.com/ivkos/botyo) - Modular bot designed for group chat rooms on Facebook
- [matrix-puppet-facebook](https://github.com/matrix-hacks/matrix-puppet-facebook) - A facebook bridge for [matrix](https://matrix.org)
- [facebot](https://github.com/Weetbix/facebot) - A facebook bridge for Slack.
- [Botium](https://github.com/codeforequity-at/botium-core) - The Selenium for Chatbots
- [Messenger-CLI](https://github.com/AstroCB/Messenger-CLI) - A command-line interface for sending and receiving messages through Facebook Messenger.
- [AssumeZero-Bot](https://github.com/AstroCB/AssumeZero-Bot) – A highly customizable Facebook Messenger bot for group chats.
- [Miscord](https://github.com/Bjornskjald/miscord) - An easy-to-use Facebook bridge for Discord.
- [chat-bridge](https://github.com/rexx0520/chat-bridge) - A Messenger, Telegram and IRC chat bridge.
- [messenger-auto-reply](https://gitlab.com/theSander/messenger-auto-reply) - An auto-reply service for Messenger.
- [BotCore](https://github.com/AstroCB/BotCore) – A collection of tools for writing and managing Facebook Messenger bots.
- [mnotify](https://github.com/AstroCB/mnotify) – A command-line utility for sending alerts and notifications through Facebook Messenger.

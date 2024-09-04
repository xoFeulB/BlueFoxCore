// © BlueFoxEnterprise
// https://github.com/xoFeulB

import { SendCommand } from "/src/js/modules/DebugProtocol/sendcommand.js";
import { DEFINE } from "/src/js/modules/Values/define.js";

let log = console.log;

(async () => {
  let define = await DEFINE;

  let sendCommand = await (new SendCommand(define.BlueFoxCoreServer));
  class Tab {
    constructor(tabInfo) {
      try {
        tabInfo.url = new URL(tabInfo.url);
      } catch (e) { }
      this.info = tabInfo;
      this.cookie = {
        get: async (option) => {
          let R = await chrome.cookies.getAll(Object.assign({ domain: this.info.url.hostname }, option));
          return R;
        },
        set: async (cookie) => {
          let R = await chrome.cookies.set(Object.assign({ url: this.info.url.href }, cookie));
          return R;
        },
        remove: async (cookie) => {
          let R = await chrome.cookies.remove(Object.assign({ url: this.info.url.href }, cookie));
          return R;
        },
      };
      this.isDebugging = false;
      this.sessionId = "";
    }
    async attachDebugger() {
      try {
        let targets = (await this.sendCommand(
          {
            method: "Target.getTargets",
            params: {
              discover: true
            },
          }
        )).result.targetInfos;
        this.sessionId = (await this.sendCommand(
          {
            method: "Target.attachToTarget",
            params: {
              targetId: targets.filter((_) => {
                return _.url == this.info.url.href;
              })[0].targetId,
              flatten: true,
            },
          }
        )).result.sessionId;
        this.isDebugging = true;
      } catch (e) {
        console.warn(e);
      }
    }
    async sendCommand(object) {
      let R = await sendCommand.send(
        Object.assign(object, { sessionId: this.sessionId })
      );
      return R;
    }

  }

  class Tabs extends (Object) {
    constructor(option) {
      super();
      return new Promise((resolve, reject) => {
        this.init(resolve, option);
      });
    }
    async init(resolve, option = {}) {
      /* Tab */{
        chrome.tabs.onRemoved.addListener(
          async (tabId, removeInfo) => {
            delete this[tabId];
          }
        );
        chrome.tabs.onUpdated.addListener(
          async (tabId, changeInfo, tab) => {
            if (tabId in this) {
              tab.url = new URL(tab.url);
              this[tabId].info = tab;
              if (!this[tabId].isDebugging) {
                await this[tabId].attachDebugger();
              }
            } else {
              this[tab.id] = new Tab(tab);
              await this[tab.id].attachDebugger();
            }
          }
        );
        chrome.tabs.onCreated.addListener(
          async (tabInfo) => {
            this[tabInfo.id] = new Tab(tabInfo);
            await this[tabInfo.id].attachDebugger();
            Object.entries(option).forEach(([key, value]) => {
              if (key in this[tabInfo.id]) {
                this[tabInfo.id][key](value);
              }
            });
          }
        );

        for (let tabInfo of [...(await chrome.tabs.query({ url: "<all_urls>" }))]) {
          if ([tabInfo.pendingUrl, tabInfo.url].includes("http://bluefoxcore/")) {
            continue;
          }
          this[tabInfo.id] = new Tab(tabInfo);
          await this[tabInfo.id].attachDebugger();
          Object.entries(option).forEach(([key, value]) => {
            if (key in this[tabInfo.id]) {
              this[tabInfo.id][key](value);
            }
          });
        }
      }
      resolve(this);
    }
  }
  let tabs = await new Tabs();
  chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
      if (sender.id == chrome.runtime.id) {
        (async () => {
          try {
            if (message.tabId) {
              let R = await tabs[message.tabId].sendCommand(message.object);
              sendResponse(R);
            } else {
              let R = await tabs[sender.tab.id].sendCommand(message.object);
              sendResponse(R);
            }
          } catch (e) {
            sendResponse(e);
          }
        })();
        return true;
      } else {
        return false;
      }
    }
  );
  chrome.tabs.update((await chrome.tabs.query({ url: "<all_urls>" }))[0].id, { url: `chrome-extension://${chrome.runtime.id}/src/html/index.html` });
})();

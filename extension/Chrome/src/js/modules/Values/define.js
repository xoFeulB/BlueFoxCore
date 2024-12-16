export let DEFINE = (async () => {
  let R = {
    Title: `^.,.^ BlueFox`,
    Copyright: `© ${new Date().getFullYear()} BlueFoxEnterprise`,
    Version: `v${chrome.runtime.getManifest().version}`,
  };
  let config = await (await fetch("/src/json/config.json")).json();
  return Object.assign(R, config);
})();


import { BlueFoxCoreServer } from "@xofeulb/bluefox-core-server";

let log = console.log;


(async () => {
  let blueFoxCoreServer = new BlueFoxCoreServer(
    // UserDataDir="C:\\Users\\<UserName>\\AppData\\Local\\BlueFoxEnterprise\\Chrome"
    process.env.UserDataDir,
    // BlueFoxCoreExtensionDir="<PathToBlueFoxCore>\\BlueFoxCore\\Extension"
    process.env.BlueFoxCoreExtensionDir,
  );
  await blueFoxCoreServer.start("./test/Workspace");
  let BlueFox = await blueFoxCoreServer.openChrome(true);

  let googling = async () => {
    let blueFoxScript = await new BlueFoxScript();

    let tab = await blueFoxScript.createWindow("https://www.google.com");
    await tab
      .tails()
      .target("textarea")
      .setProperty({ value: "^.,.^ BlueFox" })
      .target("[name='btnK'][tabindex='0']")
      .call("click", null)
      .runTillNextOnLoad({ sleep: 50 });

    let search_result = await tab.dispatchScript(
      () => {
        return [...document.querySelectorAll("#search :is(a[data-jsarwt='1'],a[jsname])")]
          .filter((_) => {
            return _.querySelector("h3");
          })
          .map((_) => {
            return {
              href: _.href,
              title: _.querySelector("h3").textContent,
            }
          });
      }
    );
    return search_result.result.value;
  };
  let close = async () => {
    let blueFoxScript = await new BlueFoxScript();
    blueFoxScript.closeBlowser();
  }

  log(await BlueFox.runScript(`(${googling.toString()})();`));
  await blueFoxCoreServer.sleep(1000);
  await BlueFox.runScript(`(${close.toString()})();`);
  await blueFoxCoreServer.sleep(1000);

  blueFoxCoreServer.stop();
})();

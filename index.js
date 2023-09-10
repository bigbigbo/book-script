//@ts-check
const { chromium } = require("playwright");
const readline = require("readline");
const fs = require("fs");

const config = {
  telphone: "13323231234",
  doctorName: "丁培荣",
  doctorDesc: "特需（正高）/教授",
  bookDate: "09-15",
};

let times = 1;

function loadStorageStateFromFile(filePath) {
  try {
    const cookiesJson = fs.readFileSync(filePath, "utf8");
    return JSON.parse(cookiesJson);
  } catch (error) {
    console.error("Error loading cookies:", error);
    return null;
  }
}

const ask = (question) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question + ": ", resolve);
  });
};

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();

  let isLogined = false;

  // 从本地文件加载存储状态
  const savedStorageState = loadStorageStateFromFile("storageState.json"); // 替换成加载存储状态的逻辑
  const savedSessionStorage = loadStorageStateFromFile("sessionStorage.json"); // 替换成加载存储状态的逻辑

  // 已经登录过了
  if (savedStorageState) {
    isLogined = true;
    await context.addCookies(savedStorageState.cookies);
    await context.storageState(savedStorageState);
    await context.addInitScript((sessionStorage) => {
      Object.keys(sessionStorage).forEach((key) => {
        window.sessionStorage.setItem(key, sessionStorage[key]);
      });
    }, JSON.parse(savedSessionStorage));
  }

  const page = await context.newPage();
  await page.goto("https://patientcloud.sysucc.org.cn/Website");

  // 等待 iframe 元素加载
  const iframeSelector = ".iframe"; // 替换成正确的 iframe 选择器
  await page.waitForSelector(iframeSelector);

  // 获取 iframe 元素的句柄
  const iframeElementHandle = await page.$(iframeSelector);

  // 进入 iframe 上下文
  const iframe = await iframeElementHandle?.contentFrame();

  async function login() {
    if (iframe) {
      // 在 iframe 中操作
      await iframe.click("span.bind-btn:text('立即绑定')");

      await iframe.waitForSelector("input[type=tel]");

      await iframe.fill("input[type=tel]", config.telphone);

      await iframe.click('button:has(span:text("获取验证码"))');

      const verificationCode1 = await ask("请输入图形验证码");

      await iframe.fill(
        "input[placeholder=请输入图片中的文字]",
        verificationCode1
      );

      await iframe.click('button:has(span:text("确认"))');

      const verificationCode2 = await ask("请输入短信验证码");

      // 输入短信验证码
      await iframe.fill("input[placeholder=请输入验证码]", verificationCode2);

      // 点击立即绑定
      await iframe.click('button:has(span:text("立即绑定"))');

      const storageState = await context.storageState();

      // 将存储状态保存到本地文件
      fs.writeFileSync(
        "storageState.json",
        JSON.stringify(storageState, null, 2)
      );

      // playwright 没有提供 sessionStorage 的获取 api，只能这样操作
      const sessionStorage = await page.evaluate(() =>
        JSON.stringify(window.sessionStorage)
      );
      fs.writeFileSync(
        "sessionStorage.json",
        JSON.stringify(sessionStorage, null, 2)
      );
    } else {
      throw new Error("尝试登录失败，找不到对应的 iframe");
    }
  }

  if (!isLogined) {
    await login();
  }

  await iframe?.click('div.top_menu_item:has(div:text("预约挂号"))');

  await iframe?.waitForSelector(".branch-item");

  await iframe?.click(".branch-item:first-child");

  await iframe?.waitForSelector('button:has(span:text("我知道了"))');

  await iframe?.click('button:has(span:text("我知道了"))');

  await iframe?.click("div.search-parent");

  await iframe?.waitForSelector("input[placeholder=搜索科室、病种、医生]");

  await iframe?.fill(
    "input[placeholder=搜索科室、病种、医生]",
    config.doctorName
  );

  await iframe?.click('div:text("搜索")');

  await iframe?.waitForSelector(".data-list");

  await iframe?.click(`span:text('${config.doctorDesc}')`);

  console.log("登录成功，开始刷号");

  await iframe?.waitForSelector(".item-date");

  async function loop() {
    await iframe?.click(`.item-date:has(span:text('${config.bookDate}'))`);

    try {
      await iframe?.waitForTimeout(2000);

      const hasPoint = await iframe?.$('.point-item:has(div:text("余号:"))');

      // 刷新列表请求已经完成
      if (!hasPoint) {
        console.log(`没有号，第${times++}次刷新`);
        loop();
      } else {
        // 点击预约
        await iframe?.click('.point-item:has(div:text("余号:"))');

        await iframe?.waitForSelector("span:text('我已阅读并了解')");

        await iframe?.click('button:has(span:text("确定"))');

        console.log("预约成功");

        browser.close();
      }
    } catch (error) {
      console.error(error);
    }
  }

  loop();
})();

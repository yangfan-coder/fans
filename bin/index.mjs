#!/usr/bin/env node

import * as fs from "fs-extra";
import findUp from "find-up";
import * as lock from "./lock.mjs";
import list from "./list.mjs";
import * as log from "./log.mjs";
import * as utils from "./utils";
import install from "./install.mjs";

export default async function (args) {
  const jsonPath = await findUp("package.json");

  if (!jsonPath) {
    throw Error("创建配置文件");
  }

  const root = await fs.default.readJson(jsonPath);

  /*
   *如果我们通过运行“fans install＜packageName＞”来添加新程序包，
   *通过CLI参数收集它们。
   *此目的的行为类似于“npm i＜packageName＞”或“yarn add”。
   *例如：
   * run: fans install xxx
   */

  const additionalPackages = args._.slice(1);
  if (additionalPackages.length) {
    //! fans install demo --save-dev
    if (args["save-dev"] || args.dev) {
      /*
       *现在我们还没有具体的版本，所以把它设置为空。
       *我们稍后会在获取信息后填写。
       */

      additionalPackages.forEach((pkg) => (root.devDependencies[pkg] = "")); // ! 这里需要增加容错机制
    } else {
      root.dependencies = root.dependencies || {};
      /*
       *现在我们还没有具体的版本，所以把它设置为空。
       *我们稍后会在获取信息后填写。
       */
      additionalPackages.forEach((pkg) => (root.dependencies[pkg] = ""));
    }
  }

  /*
   *在生产模式中，
   *我们只需要解决生产依赖关系。
   *例如：
   * run: fans install xx --production
   */

  if (args.production) {
    delete root.devDependencies;
  }

  // 加载文件
  await lock.readLock();

  // 生成了依赖关系
  const info = await list(root);

  // 异步保存锁定文件。
  lock.writeLock();

  /*
   *准备进度条。
   *请注意，我们重新计算包的数量。
   *由于重复，
   *已解析的包数不等于
   *要安装的程序包的数量。
   */

  log.prepareInstall(
    Object.keys(info.topLevel).length + info.unsatisfied.length
  );

  // 安装依赖包
  await Promise.all(
    Object.entries(info.topLevel).map(([name, { url }]) => install(name, url))
  );

  // 安装冲突的依赖包
  await Promise.all(
    info.unsatisfied.map((item) =>
      install(item.name, item.url, `/node_modules/${item.parent}`)
    )
  );

  beautifyPackageJson(root);
  
  // 保存“package.json”文件。
  fs.default.writeJson(jsonPath, root, { spaces: 2 })
}

// 美化package.json
function beautifyPackageJson(packageJson) {
  if (packageJson.dependencies) {
    packageJson.dependencies = utils.sortKeys(packageJson.dependencies);
  }

  if (packageJson.devDependencies) {
    packageJson.devDependencies = utils.sortKeys(packageJson.devDependencies);
  }
}

#!/usr/bin/env node

import * as fs from "fs-extra";
import findUp from "find-up";
import * as lock from "./lock.mjs";
import list from "./list.mjs";
import * as log from "./log.mjs";
import install from "./install.mjs";

export default async function (args) {
  const jsonPath = await findUp("package.json");

  if (!jsonPath) {
    throw Error("创建配置文件");
  }

  const root = await fs.default.readJson(jsonPath);
  const additionalPackages = args._.slice(2);

  if (additionalPackages.length) {
    root.dependencies = root.dependencies || {};
    additionalPackages.forEach((pkg) => (root.dependencies[pkg] = ""));
  }

  // 加载文件
  await lock.readLock();

  // 生成了依赖关系
  const info = await list(root);

  // 异步保存锁定文件。
  lock.writeLock();

  console.log(info);

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

  //安装顶级软件包。
  await Promise.all(
    Object.entries(info.topLevel).map(([name, { url }]) => install(name, url))
  );

  // 保存“package.json”文件。
  // fs.default.writeJson(jsonPath, root, { spaces: 2 })
}

#!/usr/bin/env node

import fetch from "node-fetch";
import * as tar from "tar";
import * as fs from "fs-extra";
import * as log from "./log.mjs";

export default async function (name, url, location = "") {
  // 重新分析要安装的目录
  const path = `${process.cwd()}${location}/node_modules/${name}`;

  // 递归地创建目录。
  await fs.mkdirp(path);

  const response = await fetch(url);

  /*
   *响应主体是可读流
   *并且“tar.extract”接受可读流，
   *所以我们不需要创建一个文件到磁盘，
   *直接提取这些东西。
   */

  response.body
    ?.pipe(tar.x({ cwd: path, strip: 1 }))
    .on('close',log.tickInstalling);
}

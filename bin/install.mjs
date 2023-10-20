#!/usr/bin/env node

// import fetch from "node-fetch";
import axios from "axios";
import * as tar from "tar";
import * as fs from "fs-extra";
import * as log from "./log.mjs";

export default async function (name, url, location = "") {
  // 重新分析要安装的目录
  const path = `${process.cwd()}${location}/node_modules/${name}`;

  // 递归地创建目录。
  await fs.mkdirp(path);

  // const response = await fetch(url);
  // response.body
  //   ?.pipe(tar.x({ cwd: path, strip: 1 }))
  //   .on('close',log.tickInstalling);


  const response = await axios.get(url, { responseType: "stream" });
  response.data
  .pipe(tar.x({ cwd: path, strip: 1 }))
  .on('close',log.tickInstalling);
  
}

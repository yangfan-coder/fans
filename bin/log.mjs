#!/usr/bin/env node

import ProgressBar from "progress";
import logUpdate from "log-update";

let progress;

// 使用友好的进度条。
export function prepareInstall(count) {
  logUpdate("[1/2] 已经完成解析.");
  progress = new ProgressBar("[2/2] Installing [:bar]", {
    complete: "#",
    total: count,
  });
}

/**
 *更新当前解析的模块。
 *这类似于yarn。
 */
export function logResolving(name) {
  logUpdate(`[1/2] 正在解析: ${name}`);
}

/**
 *这是为了更新进度条
 *一旦焦油球提取完成。
 */
export function tickInstalling() {
  progress.tick();
}

#!/usr/bin/env node

import * as semver from "semver";
import * as lock from "./lock.mjs";
import resolve from "./resolve.mjs";
import * as log from "./log.mjs";

/*
 *“topLevel”变量用于压平包树
 *以避免重复。
 */
const topLevel = Object.create(null);

/*
 *但是可能存在依赖性冲突，
 *所以这个变量就是为了这个。
 */
const unsatisfied = [];

async function collectDeps(name, constraint, stack = []) {
  // 从锁中按名称检索单个清单。
  const fromLock = lock.getItem(name, constraint);

  /*
   *获取清单信息。
   *如果该清单不存在于锁中，
   *从网络中获取。
   */

  const manifest = fromLock || (await resolve(name));

  // 将当前解析模块添加到CLI
  log.logResolving(name);

  /*
   *使用包的最新版本
   *而它将符合语义版本。
   *但是如果没有指定语义版本，
   *使用最新版本。
   */

  const versions = Object.keys(manifest);

  // 获取最新的判断，可以通过 https://registry.npmjs.org/find-up 查看
  const matched = constraint
    ? semver.maxSatisfying(versions, constraint)
    : versions[versions.length - 1]; // 最后一个是最新的。

  if (!matched) {
    throw new Error("无法解析合适的包");
  }

  const matchedManifest = manifest[matched];

  if (!topLevel[name]) {
    /*
     *如果该包不存在于“topLevel”映射中，
     *就这么说吧。
     */

    topLevel[name] = { url: matchedManifest.dist.tarball, version: matched };
  } else if (semver.satisfies(topLevel[name].version, constraint)) {
  } else {
  }

  // 别忘了收集我们依赖项的依赖项
  const dependencies = matchedManifest.dependencies ?? {};

  // 将清单保存到新锁。
  lock.updateOrCreate(`${name}@${constraint}`, {
    version: matched,
    url: matchedManifest.dist.tarball,
    shasum: matchedManifest.dist.shasum,
    dependencies,
  });

  /*
   *收集依赖项的依赖项，
   *所以是时候更深入了。
   */

  if (dependencies) {
    stack.push({
      name,
      version: matched,
      dependencies,
    });

    await Promise.all(
      Object.entries(dependencies)
        // 下面的筛选器用于防止依赖循环
        .filter(([dep, range]) => !hasCirculation(dep, range, stack))
        .map(([dep, range]) => collectDeps(dep, range, stack.slice()))
    );

    stack.pop();
  }

  /*
   *将语义版本范围返回到
   *在“package.json”中添加缺少的语义版本范围。
   */

  if (!constraint) {
    return { name, version: `^${matched}` };
  }
}

/**
 *此函数用于检查是否存在依赖循环。
 *
 *如果堆栈中存在包并且该包满足语义版本，
 *事实证明存在依赖循环。
 */

function hasCirculation(name, renge, stack) {
  return stack.some(
    (item) => item.name === name && semver.satisfies(item.version, renge)
  );
}

/*
 *对于生产依赖性和开发依赖性，
 *如果返回包名称和语义版本，
 *我们应该将它们添加到“package.json”文件中。
 *添加新程序包时，这是必要的。
 */
export default async function (rootManifest) {
  if (rootManifest.dependencies) {
    (
      await Promise.all(
        Object.entries(rootManifest.dependencies).map((pair) =>
          collectDeps(...pair)
        )
      )
    )
      .filter(Boolean)
      .forEach((item) => (rootManifest.dependencies[item.name] = item.version));
  }

  if (rootManifest.devDependencies) {
    (
      await Promise.all(
        Object.entries(rootManifest.devDependencies).map((pair) =>
          collectDeps(...pair)
        )
      )
    )
      .filter(Boolean)
      .forEach(
        (item) => (rootManifest.devDependencies[item.name] = item.version)
      );
  }

  return { topLevel, unsatisfied };
}

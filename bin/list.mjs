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
    // 如果该包不存在于“topLevel”映射中，
    topLevel[name] = { url: matchedManifest.dist.tarball, version: matched };
  } else if (semver.satisfies(topLevel[name].version, constraint)) {
    const conflictIndex = checkStackDependencies(name, matched, stack);

    // 避免依赖循环
    if (conflictIndex === -1) return;

    /*
     *由于Node.js的模块解析算法，
     *依赖关系的依赖关系可能存在一些冲突。
     *如何检查？请参阅下面的“checkStackDependencies”函数。
     *----------------------------
     *我们只需要前面**两个**依赖项的信息
     *具有冲突的依赖关系。
     *：（不确定是否正确。
     */

    unsatisfied.push({
      name,
      parent: stack
        .map(({ name }) => name)
        .slice(conflictIndex - 2)
        .join("/node_modules/"),
      url: matchedManifest.dist.tarball,
    });
  } else {
    /*
     *是的，这个包裹已经存在于地图中了，
     *但是由于语义版本的原因，它存在冲突。
     *所以我们应该添加一个记录。
     */

    unsatisfied.push({
      name,
      parent: stack.at(-1).name,
      url: matchedManifest.dist.tarball,
    });
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
 * 此功能用于检查
 * 依赖关系的依赖关系，而不是顶级依赖关系。
* 
* stack的模拟数据如下：

    [{
      name: 'string-width',
      version: '5.1.2',
      dependencies: {
        eastasianwidth: '^0.2.0',
        'emoji-regex': '^9.2.2',
        'strip-ansi': '^7.0.1'
      }
    },
    ...
  ]
*/
function checkStackDependencies(name, version, stack) {
  return stack.findIndex(({ dependencies }) => {
    const semverRange = dependencies[name];
    /*
     *如果该包不是另一个包的依赖项，
     *这是安全的，我们只返回true。
     */
    if (!semverRange) {
      return true;
    }

    return semver.satisfies(version, semverRange);
  });
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

/**
 *为了简化本指南，
 *我们打算只支持`dependencies'和`devDependencies`字段。
 */
export default async function (rootManifest) {
  /*
   *对于生产依赖性和开发依赖性，
   *如果返回包名称和语义版本，
   *我们应该将它们添加到“package.json”文件中。
   *添加新程序包时，这是必要的。
   */

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

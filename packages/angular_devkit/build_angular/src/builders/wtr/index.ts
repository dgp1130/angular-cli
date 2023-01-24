import { BuilderContext, BuilderOutput, createBuilder } from '@angular-devkit/architect';
import { targetFromTargetString, scheduleTargetAndForget } from '@angular-devkit/architect';
import {
  TestRunner,
  TestRunnerCli,
  Logger,
  ErrorWithLocation,
  chromeLauncher,
  EventEmitter,
  TestRunnerCoreConfig,
  defaultReporter,
} from '@web/test-runner';
import { promises as fs } from 'fs';
import { Glob } from 'glob';
import path from 'path';
import { Schema } from './schema';
import { esbuildPlugin } from '@web/dev-server-esbuild';

export default createBuilder(
  async (options: Schema, ctx: BuilderContext): Promise<BuilderOutput> => {
    // TODO: Source root constant?
    const testFiles = (await findTestFiles(`${ctx.workspaceRoot}/src`)).map((file) =>
      path.relative(process.cwd(), file),
    );
    const testOutput = 'dist/test-out';

    const buildOutput = await build(ctx, options, testFiles, testOutput);
    if (!buildOutput.success) {
      return buildOutput;
    }

    const passed = await runTests(ctx.workspaceRoot, testOutput);
    ctx.logger.info(`Passed: ${passed}`); // DEBUG
    return { success: passed };
  },
);

// TODO: Experiment with JIT
// TODO: Experiment with watch
// TODO: Inject `TestBed.initTestEnvironment()`.
// TODO: Do we need fake async? Inject `zone.js/testing`?

async function build(
  ctx: BuilderContext,
  options: Schema,
  testFiles: string[],
  outputDir: string,
): Promise<BuilderOutput> {
  const target = targetFromTargetString(options.browserTarget!);
  const testFramework = path.relative(process.cwd(), path.join(__dirname, 'test_framework.mjs'));
  const esBuildOutput = await scheduleTargetAndForget(ctx, target, {
    entryPoints: testFiles.concat([testFramework]),
    tsConfig: options.tsConfig,
    outputPath: outputDir,
    outputHashing: 'none',
    // aot: false, // TODO: JIT not supported.
    commonChunk: false,
    optimization: false,
    buildOptimizer: false,
    externalDependencies: ['/node_modules/@web/test-runner-core/browser/session.js'],
    sourceMap: {
      scripts: true,
      styles: true,
      vendor: true,
    },
    polyfills: ['./src/polyfills.ts'], // TODO: How to load `zone.js` *and* `zone.js/testing`?
  }).toPromise();
  if (!esBuildOutput.success) return esBuildOutput;

  return await copyTemplatesAndStyles(`${ctx.workspaceRoot}/src`, outputDir);
}

async function copyTemplatesAndStyles(srcRoot: string, outDir: string): Promise<BuilderOutput> {
  const matches = await new Promise<string[]>((resolve, reject) => {
    new Glob('**/*.component.{html,css}', { cwd: srcRoot }, (err, matches) => {
      if (err) {
        reject(err);
      } else {
        resolve(matches);
      }
    });
  });

  // TODO: Maintain directory structure.
  // TODO: Add transform to inline templates and styles: https://github.com/angular/angular-cli/blob/main/packages/ngtools/webpack/src/transformers/replace_resources.ts
  try {
    await Promise.all(
      matches.map((match) =>
        fs.copyFile(path.join(srcRoot, match), path.join(outDir, path.parse(match).base)),
      ),
    );
  } catch (err) {
    return {
      success: false,
      error: `Failed to copy template or style:\n${(err as Error).message}`,
    };
  }

  return { success: true };
}

async function runTests(wkspRoot: string, testDir: string): Promise<boolean> {
  const config: TestRunnerCoreConfig = {
    rootDir: wkspRoot,
    files: [
      `${testDir}/**/*.js`,
      `!${testDir}/polyfills.js`,
      `!${testDir}/chunk-*.js`,
      `!${testDir}/test_framework.mjs.js`,
    ],
    testFramework: {
      config: {
        defaultTimeoutInterval: 5_000,
      },
      path: `${testDir}/test_framework.mjs.js`,
    },
    concurrentBrowsers: 1,
    concurrency: 1,
    protocol: 'http:',
    hostname: 'localhost',
    port: 9876,
    browsers: [chromeLauncher({ launchOptions: { args: ['--no-sandbox'] } })],
    logger: new ConsoleLogger(),
    reporters: [defaultReporter()],
    // plugins: [esbuildPlugin({target: 'auto'})],
    watch: false,
    coverageConfig: {},
    browserStartTimeout: 5_000,
    testsStartTimeout: 5_000,
    testsFinishTimeout: 5_000,
    manual: true, // DEBUG
    testRunnerHtml(_testRunnerImport, _config) {
      // Don't use `_testRunnerImport` because it gets resolved to an `/__web-test-runner__/...`
      // path which duplicates its chunked dependencies. Instead, we need to directly reference the
      // bundled `test_framework.mjs` entry point which shares its deps with user's tests.
      return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf8">
    <title>Unit tests</title>
    <base href="${testDir}/">
    <script src="/node_modules/jasmine-core/lib/jasmine-core/jasmine.js"></script>
    <script>
      // Run first so Zone.js testing can find global Jasmine?
      // https://github.com/angular/angular/blob/af4f5df150d527a1b523def1eb51d2b661a25f83/packages/zone.js/lib/jasmine/jasmine.ts
      const jasmine = jasmineRequire.core(window.jasmineRequire);
      const global = jasmine.getGlobal();
      global.jasmine = jasmine;
      const env = jasmine.getEnv();
      Object.assign(window, jasmineRequire.interface(jasmine, env));
      window.onload = function () {};
    </script>
    <script src="polyfills.js" type="module"></script>
    <script src="test_framework.mjs.js" type="module"></script>
  </head>
  <body></body>
</html>
      `.trim();
    },
  };
  const runner = new TestRunner(config);
  const runnerCli = new TestRunnerCli(config, runner);

  await runner.start();
  runnerCli.start();
  const passed = (await once(runner, 'finished')) as boolean;
  await runner.stop();
  return passed;
}

// TODO: Why won't this type check?
function once(emitter: EventEmitter<Record<string, any>>, event: string): Promise<unknown> {
  return new Promise((resolve) => {
    const onEmit = (arg: unknown): void => {
      emitter.off(event, onEmit);
      resolve(arg);
    };
    emitter.on(event, onEmit);
  });
}

function findTestFiles(root: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    new Glob('**/*.spec.ts', { cwd: root }, (err, matches) => {
      if (err) {
        reject(err);
      } else {
        resolve(matches.map((match) => `${root}/${match}`));
      }
    });
  });
}

// TODO: Does this really not exist anywhere?
class ConsoleLogger implements Logger {
  log(...messages: unknown[]): void {
    console.log(...messages);
  }

  debug(...messages: unknown[]): void {
    console.debug(...messages);
  }

  error(...messages: unknown[]): void {
    console.error(...messages);
  }

  warn(...messages: unknown[]): void {
    console.error(...messages);
  }

  group(): void {
    console.group();
  }

  groupEnd(): void {
    console.groupEnd();
  }

  logSyntaxError(error: ErrorWithLocation): void {
    this.error(error);
  }
}

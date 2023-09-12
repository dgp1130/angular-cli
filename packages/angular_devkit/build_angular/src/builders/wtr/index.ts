/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { BuilderContext, BuilderOutput, createBuilder } from '@angular-devkit/architect';
import { JsonArray } from '@angular-devkit/core';
import {
  ErrorWithLocation,
  EventEmitter,
  Logger,
  TestRunner,
  TestRunnerCli,
  TestRunnerCoreConfig,
  chromeLauncher,
  defaultReporter,
} from '@web/test-runner';
import fastGlob, { Options as GlobOptions } from 'fast-glob';
import path from 'path';
import { buildApplicationInternal } from '../application';
import { OutputHashing } from '../browser-esbuild/schema';
import { Schema } from './schema';

export default createBuilder(
  async (options: Schema, ctx: BuilderContext): Promise<BuilderOutput> => {
    // TODO: Source root constant?
    const testFiles = Array.from(await findTestFiles(options, `${ctx.workspaceRoot}/src`)).map(
      (file) => path.relative(process.cwd(), path.join('src', file)),
    );
    const outputPath = 'dist/test-out';

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const testFramework = path.relative(process.cwd(), path.join(__dirname, 'test_framework.mjs'));

    const buildOutput = await first(
      buildApplicationInternal(
        {
          entryPoints: new Set(testFiles.concat([testFramework])),
          tsConfig: options.tsConfig,
          outputPath,
          aot: false,
          index: false,
          outputHashing: OutputHashing.None,
          optimization: false,
          externalDependencies: ['/node_modules/@web/test-runner-core/browser/session.js'],
          sourceMap: {
            scripts: true,
            styles: true,
            vendor: true,
          },
          polyfills:
            typeof options.polyfills === 'string'
              ? [options.polyfills]
              : options.polyfills ?? ['zone.js', 'zone.js/testing'],
        },
        ctx,
      ),
    );
    if (!buildOutput.success) {
      return buildOutput;
    }

    const passed = await runTests(ctx, outputPath);

    return { success: passed };
  },
);

// TODO: Experiment with watch
// TODO: Do we need fake async? Inject `zone.js/testing`?

async function first<T>(generator: AsyncIterable<T>): Promise<T> {
  for await (const value of generator) {
    return value;
  }

  throw new Error('Expected generator to emit at least once.');
}

async function runTests(ctx: BuilderContext, testDir: string): Promise<boolean> {
  const config: TestRunnerCoreConfig = {
    rootDir: ctx.workspaceRoot,
    files: [
      `${testDir}/**/*.js`,
      `!${testDir}/polyfills.js`,
      `!${testDir}/chunk-*.js`,
      `!${testDir}/test_framework.js`,
    ],
    testFramework: {
      config: {
        defaultTimeoutInterval: 5_000,
      },
      path: `${testDir}/test_framework.js`,
    },
    concurrentBrowsers: 1,
    concurrency: 1,
    protocol: 'http:',
    hostname: 'localhost',
    port: 9876,
    browsers: [chromeLauncher({ launchOptions: { args: ['--no-sandbox'] } })],
    logger: new BuilderLogger(ctx.logger),
    reporters: [defaultReporter()],
    watch: false,
    coverageConfig: {},
    browserStartTimeout: 5_000,
    testsStartTimeout: 5_000,
    testsFinishTimeout: 5_000,
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
    <script src="test_framework.js" type="module"></script>
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function once(emitter: EventEmitter<Record<string, any>>, event: string): Promise<unknown> {
  return new Promise((resolve) => {
    const onEmit = (arg: unknown): void => {
      emitter.off(event, onEmit);
      resolve(arg);
    };
    emitter.on(event, onEmit);
  });
}

async function findTestFiles(
  options: Schema,
  root: string,
  glob: typeof fastGlob = fastGlob,
): Promise<Set<string>> {
  const globOptions: GlobOptions = {
    cwd: root,
    ignore: ['node_modules/**'],
    braceExpansion: false, // Do not expand `a{b,c}` to `ab,ac`.
    extglob: false, // Disable "extglob" patterns.
    onlyFiles: true,
  };

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const included = await Promise.all(options.include!.map((pattern) => glob(pattern, globOptions)));

  // Flatten and deduplicate any files found in multiple include patterns.
  return new Set(included.flat());
}

class BuilderLogger implements Logger {
  constructor(private readonly logger: BuilderContext['logger']) {}

  private parseMessage(message: unknown[]): [message: string, content: { data: JsonArray }] {
    const msg = typeof message[0] === 'string' ? message[0] : '';

    return [msg, { data: message.slice(1) as JsonArray }];
  }

  log(...messages: unknown[]): void {
    this.logger.info(...this.parseMessage(messages));
  }

  debug(...messages: unknown[]): void {
    this.logger.debug(...this.parseMessage(messages));
  }

  error(...messages: unknown[]): void {
    this.logger.error(...this.parseMessage(messages));
  }

  warn(...messages: unknown[]): void {
    this.logger.warn(...this.parseMessage(messages));
  }

  group(): void {
    // Do nothing, grouping not supported by build context logger.
  }

  groupEnd(): void {
    // Do nothing, grouping not supported by build context logger.
  }

  logSyntaxError(error: ErrorWithLocation): void {
    this.error(error);
  }
}

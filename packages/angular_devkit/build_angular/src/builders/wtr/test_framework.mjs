/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

/**
 * @fileoverview Exposes a `run` function which runs a Jasmine test suite for the given entry point.
 *
 * Forked from https://github.com/blueprintui/web-test-runner-jasmine/blob/d07dad01e9e287ea96c41c433c6f787f6170566a/src/index.ts.
 */

// Can't import and bundle `@web/test-runner-core` directly because it contains an import of
// `/__web-dev-server__web-socket.js`, so we have to mark this dependency as "external" and let it
// resolve at runtime.
import { getConfig, sessionFailed, sessionFinished, sessionStarted } from '/node_modules/@web/test-runner-core/browser/session.js';

import { getTestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';

void (async () => {
  const failedSpecs = [];
  const allSpecs = [];
  const failedImports = [];

  // eslint-disable-next-line no-undef
  env.addReporter({
    jasmineStarted: () => {},
    suiteStarted: () => {},
    specStarted: () => {},
    suiteDone: () => {},
    specDone: result => {
      [...result.passedExpectations, ...result.failedExpectations].forEach(e => {
        allSpecs.push({
          name: e.description,
          passed: e.passed,
        });
      });

      if (result.status !== 'passed' || result.status !== 'incomplete') {
        result.failedExpectations.forEach(e => {
          const message = result.description + '\n' + e.message + ': ' + e.stack;
          // eslint-disable-next-line no-console
          console.error(message);
          failedSpecs.push({
            message,
            name: e.description,
            stack: e.stack,
            expected: e.expected,
            actual: e.actual,
          });
        });
      }
    },
    jasmineDone: result => {
      // eslint-disable-next-line no-console
      console.log(`Tests ${result.overallStatus}`);
      sessionFinished({
        passed: result.overallStatus === 'passed',
        errors: [...failedSpecs, ...failedImports],
        testResults: {
          name: '',
          suites: [],
          tests: allSpecs,
        },
      });
    },
  });

  sessionStarted();
  const { testFile, testFrameworkConfig } = await getConfig();
  const config = { defaultTimeoutInterval: 60000, ...(testFrameworkConfig ?? {}) };

  // eslint-disable-next-line no-undef
  jasmine.DEFAULT_TIMEOUT_INTERVAL = config.defaultTimeoutInterval;

  getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting(), {
    errorOnUnknownElements: true,
    errorOnUnknownProperties: true
  });

  // load the test file as an es module
  // eslint-disable-next-line no-undef
  await import(new URL(testFile, document.baseURI).href).catch(error => {
    failedImports.push({ file: testFile, error: { message: error.message, stack: error.stack } });
  });

  try {
    // eslint-disable-next-line no-undef
    env.execute();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    sessionFailed(error);
  }
})();

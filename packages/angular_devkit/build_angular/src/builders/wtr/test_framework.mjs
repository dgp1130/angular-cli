/**
 * @fileoverview Exposes a `run` function which runs a Jasmine test suite for the given entry point.
 * 
 * Forked from https://github.com/blueprintui/web-test-runner-jasmine/blob/d07dad01e9e287ea96c41c433c6f787f6170566a/src/index.ts.
 */

// TODO: Why isn't this getting transpiled?
import { getConfig, sessionStarted, sessionFinished, sessionFailed } from '/node_modules/@web/test-runner-core/browser/session.js';

// TODO: How to import this properly?
import { getTestBed } from '/dist/test-out/angular_core_testing.js';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '/dist/test-out/angular_platform_browser_dynamic_testing.js';

const failedSpecs = [];
const allSpecs = [];
const failedImports = [];

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

jasmine.DEFAULT_TIMEOUT_INTERVAL = config.defaultTimeoutInterval;

getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting(), {
  errorOnUnknownElements: true,
  errorOnUnknownProperties: true
});

// load the test file as an es module
await import(new URL(testFile, document.baseURI).href).catch(error => {
  failedImports.push({ file: testFile, error: { message: error.message, stack: error.stack } });
});

try {
  env.execute();
} catch (error) {
  console.error(error);
  sessionFailed(error);
}

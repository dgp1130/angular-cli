/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { getOptions } from 'loader-utils';
import * as webpack from 'webpack';
import { Budget, Type } from '../../../src/browser/schema';
import { ThresholdSeverity, calculateThresholds, checkThresholds } from '../utilities/bundle-calculator';

interface Options {
  readonly budgets: Budget[];
}

export default function(this: webpack.loader.LoaderContext, content: string, map?: any /* TODO: WTF? */) {
  const { budgets } = loadOptions(this);

  const fileSize = content.length;
  const anyComponentStyleBudgets = budgets
      .filter((budget) => budget.type === Type.AnyComponentStyle);

  for (const budget of anyComponentStyleBudgets) {
    const thresholds = calculateThresholds(budget);
    for (const { severity, message } of checkThresholds(thresholds, fileSize, this.resourcePath)) {
      switch (severity) {
        case ThresholdSeverity.Warning:
          this.emitWarning(message);
          break;
        case ThresholdSeverity.Error:
          this.emitError(new Error(message));
          break;
        default:
          assertNever(severity);
          break;
      }
    }
  }

  // Just pass through original inputs.
  this.callback(null /* error */, content, map);

  return undefined; // Handled by `this.callback()`, must return `undefined`.
}

function loadOptions(ctx: webpack.loader.LoaderContext): Options {
  const options = getOptions(ctx);
  const { budgets } = options;

  if (!budgets) {
    throw new Error('Missing required option `budgets` in `any-component-style-budget-checker`.');
  }

  return { budgets };
}

function assertNever(input: never): never {
  throw new Error(`Unexpected call to assertNever() with input: ${
      JSON.stringify(input, null /* replacer */, 4 /* tabSize */)}`);
}

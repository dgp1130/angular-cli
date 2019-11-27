/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as webpack from 'webpack';
import { Budget } from '../../browser/schema';
import { formatSize } from '../utilities/stats';

interface Size {
  size: number;
  label?: string;
}

interface Threshold {
  limit: number;
  type: ThresholdType;
  severity: ThresholdSeverity;
}

enum ThresholdType {
  Max = 'maximum',
  Min = 'minimum',
}

export enum ThresholdSeverity {
  Warning = 'warning',
  Error = 'error',
}

function* calculateThresholds(budget: Budget): IterableIterator<Threshold> {
  if (budget.maximumWarning) {
    yield {
      limit: calculateBytes(budget.maximumWarning, budget.baseline, 1),
      type: ThresholdType.Max,
      severity: ThresholdSeverity.Warning,
    };
  }

  if (budget.maximumError) {
    yield {
      limit: calculateBytes(budget.maximumError, budget.baseline, 1),
      type: ThresholdType.Max,
      severity: ThresholdSeverity.Error,
    };
  }

  if (budget.minimumWarning) {
    yield {
      limit: calculateBytes(budget.minimumWarning, budget.baseline, -1),
      type: ThresholdType.Min,
      severity: ThresholdSeverity.Warning,
    };
  }

  if (budget.minimumError) {
    yield {
      limit: calculateBytes(budget.minimumError, budget.baseline, -1),
      type: ThresholdType.Min,
      severity: ThresholdSeverity.Error,
    };
  }

  if (budget.warning) {
    yield {
      limit: calculateBytes(budget.warning, budget.baseline, -1),
      type: ThresholdType.Min,
      severity: ThresholdSeverity.Warning,
    };

    yield {
      limit: calculateBytes(budget.warning, budget.baseline, 1),
      type: ThresholdType.Max,
      severity: ThresholdSeverity.Warning,
    };
  }

  if (budget.error) {
    yield {
      limit: calculateBytes(budget.error, budget.baseline, -1),
      type: ThresholdType.Min,
      severity: ThresholdSeverity.Error,
    };

    yield {
      limit: calculateBytes(budget.error, budget.baseline, 1),
      type: ThresholdType.Max,
      severity: ThresholdSeverity.Error,
    };
  }
}

function calculateSizes(budget: Budget, stats: webpack.Stats.ToJsonOutput): Size[] {
  const calculatorMap: Record<Budget['type'], { new(...args: any[]): Calculator }> = {
    all: AllCalculator,
    allScript: AllScriptCalculator,
    any: AnyCalculator,
    anyScript: AnyScriptCalculator,
    anyComponentStyle: AnyComponentStyleCalculator,
    bundle: BundleCalculator,
    initial: InitialCalculator,
  };

  const ctor = calculatorMap[budget.type];
  const {chunks, assets} = stats;
  if (!chunks) {
    throw new Error('Webpack stats output did not include chunk information.');
  }
  if (!assets) {
    throw new Error('Webpack stats output did not include asset information.');
  }

  const calculator = new ctor(budget, chunks, assets);

  return calculator.calculate();
}

abstract class Calculator {
  constructor (
    protected budget: Budget,
    protected chunks: Exclude<webpack.Stats.ToJsonOutput['chunks'], undefined>,
    protected assets: Exclude<webpack.Stats.ToJsonOutput['assets'], undefined>,
  ) {}

  abstract calculate(): Size[];
}

/**
 * A named bundle.
 */
class BundleCalculator extends Calculator {
  calculate() {
    const budgetName = this.budget.name;
    if (!budgetName) {
      return [];
    }

    const size: number = this.chunks
      .filter(chunk => chunk.names.indexOf(budgetName) !== -1)
      .reduce((files, chunk) => [...files, ...chunk.files], [])
      .filter((file: string) => !file.endsWith('.map'))
      .map((file: string) => {
        const asset = this.assets.find((asset) => asset.name === file);
        if (!asset) {
          throw new Error(`Could not find asset for file: ${file}`);
        }

        return asset;
      })
      .map((asset) => asset.size)
      .reduce((total: number, size: number) => total + size, 0);

    return [{size, label: this.budget.name}];
  }
}

/**
 * The sum of all initial chunks (marked as initial by webpack).
 */
class InitialCalculator extends Calculator {
  calculate() {
    const size = this.chunks
      .filter(chunk => chunk.initial)
      .reduce((files, chunk) => [...files, ...chunk.files], [])
      .filter((file: string) => !file.endsWith('.map'))
      .map((file: string) => {
        const asset = this.assets.find((asset) => asset.name === file);
        if (!asset) {
          throw new Error(`Could not find asset for file: ${file}`);
        }

        return asset;
      })
      .map((asset) => asset.size)
      .reduce((total: number, size: number) => total + size, 0);

    return [{size, label: 'initial'}];
  }
}

/**
 * The sum of all the scripts portions.
 */
class AllScriptCalculator extends Calculator {
  calculate() {
    const size = this.assets
      .filter((asset) => asset.name.endsWith('.js'))
      .map(asset => asset.size)
      .reduce((total: number, size: number) => total + size, 0);

    return [{size, label: 'total scripts'}];
  }
}

/**
 * All scripts and assets added together.
 */
class AllCalculator extends Calculator {
  calculate() {
    const size = this.assets
      .filter(asset => !asset.name.endsWith('.map'))
      .map(asset => asset.size)
      .reduce((total: number, size: number) => total + size, 0);

    return [{size, label: 'total'}];
  }
}

/**
 * Any components styles
 */
class AnyComponentStyleCalculator extends Calculator {
  calculate() {
    return this.assets
      .filter(asset => asset.name.endsWith('.css'))
      .map(asset => ({
        size: asset.size,
        label: asset.name,
      }));
  }
}

/**
 * Any script, individually.
 */
class AnyScriptCalculator extends Calculator {
  calculate() {
    return this.assets
      .filter(asset => asset.name.endsWith('.js'))
      .map(asset => ({
        size: asset.size,
        label: asset.name,
      }));
  }
}

/**
 * Any script or asset (images, css, etc).
 */
class AnyCalculator extends Calculator {
  calculate() {
    return this.assets
      .filter(asset => !asset.name.endsWith('.map'))
      .map(asset => ({
        size: asset.size,
        label: asset.name,
      }));
  }
}

/**
 * Calculate the bytes given a string value.
 */
function calculateBytes(
  input: string,
  baseline?: string,
  factor: 1 | -1 = 1,
): number {
  const matches = input.match(/^\s*(\d+(?:\.\d+)?)\s*(%|(?:[mM]|[kK]|[gG])?[bB])?\s*$/);
  if (!matches) {
    return NaN;
  }

  const baselineBytes = baseline && calculateBytes(baseline) || 0;

  let value = Number(matches[1]);
  switch (matches[2] && matches[2].toLowerCase()) {
    case '%':
      value = baselineBytes * value / 100;
      break;
    case 'kb':
      value *= 1024;
      break;
    case 'mb':
      value *= 1024 * 1024;
      break;
    case 'gb':
      value *= 1024 * 1024 * 1024;
      break;
  }

  if (baselineBytes === 0) {
    return value;
  }

  return baselineBytes + value * factor;
}

export function* checkBudgets(
    budgets: Budget[], webpackStats: webpack.Stats.ToJsonOutput):
    IterableIterator<{ severity: ThresholdSeverity, message: string }> {
  for (const budget of budgets) {
    const sizes = calculateSizes(budget, webpackStats);
    for (const threshold of calculateThresholds(budget)) {
      for (const {size, label} of sizes) {
        switch (threshold.type) {
          case ThresholdType.Max: {
            if (size <= threshold.limit) {
              continue;
            }

            const sizeDifference = formatSize(size - threshold.limit);
            yield {
              severity: threshold.severity,
              message: `Exceeded maximum budget for ${label}. Budget ${
                formatSize(threshold.limit)} was exceeded by ${
                sizeDifference} with a total of ${formatSize(size)}.`,
            };
            break;
          } case ThresholdType.Min: {
            if (size >= threshold.limit) {
              continue;
            }

            const sizeDifference = formatSize(threshold.limit - size);
            yield {
              severity: threshold.severity,
              message: `Failed to meet minimum budget for ${label}. Budget ${
                formatSize(threshold.limit)} was not met by ${
                sizeDifference} with a total of ${formatSize(size)}.`,
            };
            break;
          }
        }
      }
    }
  }
}

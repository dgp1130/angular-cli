/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { Compiler, compilation } from 'webpack';
import { Budget, Type } from '../../browser/schema';
import { ThresholdSeverity, checkBudgets } from '../utilities/bundle-calculator';

export interface BundleBudgetPluginOptions {
  budgets: Budget[];
}

export class BundleBudgetPlugin {
  constructor(private options: BundleBudgetPluginOptions) { }

  apply(compiler: Compiler): void {
    const { budgets } = this.options;

    if (!budgets || budgets.length === 0) {
      return;
    }

    compiler.hooks.compilation.tap('BundleBudgetPlugin', (compilation: compilation.Compilation) => {
      compilation.hooks.afterOptimizeChunkAssets.tap('BundleBudgetPlugin', () => {
        // In AOT compilations component styles get processed in child compilations.
        // tslint:disable-next-line: no-any
        const parentCompilation = (compilation.compiler as any).parentCompilation;
        if (!parentCompilation) {
          return;
        }

        const filteredBudgets = budgets.filter(budget => budget.type === Type.AnyComponentStyle);
        this.runChecks(filteredBudgets, compilation);
      });
    });

    compiler.hooks.afterEmit.tap('BundleBudgetPlugin', (compilation: compilation.Compilation) => {
      const filteredBudgets = budgets.filter(budget => budget.type !== Type.AnyComponentStyle);
      this.runChecks(filteredBudgets, compilation);
    });
  }

  private runChecks(budgets: Budget[], compilation: compilation.Compilation) {
    const stats = compilation.getStats().toJson();
    for (const {severity, message} of checkBudgets(budgets, stats)) {
      switch (severity) {
        case ThresholdSeverity.Warning:
          compilation.warnings.push(`budgets: ${message}`);
          break;
        case ThresholdSeverity.Error:
          compilation.errors.push(`budgets: ${message}`);
          break;
      }
    }
  }
}

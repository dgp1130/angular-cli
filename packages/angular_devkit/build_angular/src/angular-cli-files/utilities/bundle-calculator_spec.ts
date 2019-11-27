/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { ThresholdSeverity, checkBudgets } from './bundle-calculator';
import { Type, Budget } from '../../browser/schema';
import webpack = require('webpack');

const KB = 1024;

describe('bundle-calculator', () => {
  describe('checkBudgets()', () => {
    it('yields maximum budgets exceeded', () => {
      const budgets: Budget[] = [{
        type: Type.Any,
        maximumError: '1kb',
      }];
      const stats = {
        chunks: [],
        assets: [
          {
            name: 'foo.js',
            size: 1.5 * KB,
          },
          {
            name: 'bar.js',
            size: 0.5 * KB,
          },
        ],
      } as unknown as webpack.Stats.ToJsonOutput;

      const failures = Array.from(checkBudgets(budgets, stats));

      expect(failures.length).toBe(1);
      expect(failures).toContain({
        severity: ThresholdSeverity.Error,
        message: jasmine.stringMatching('Exceeded maximum budget for foo.js.'),
      });
    });

    it('yields minimum budgets exceeded', () => {
      const budgets: Budget[] = [{
        type: Type.Any,
        minimumError: '1kb',
      }];
      const stats = {
        chunks: [],
        assets: [
          {
            name: 'foo.js',
            size: 1.5 * KB,
          },
          {
            name: 'bar.js',
            size: 0.5 * KB,
          },
        ],
      } as unknown as webpack.Stats.ToJsonOutput;

      const failures = Array.from(checkBudgets(budgets, stats));

      expect(failures.length).toBe(1);
      expect(failures).toContain({
        severity: ThresholdSeverity.Error,
        message: jasmine.stringMatching('Failed to meet minimum budget for bar.js.'),
      });
    });

    it('yields exceeded bundle budgets', () => {
      const budgets: Budget[] = [{
        type: Type.Bundle,
        name: 'foo',
        maximumError: '1kb',
      }];
      const stats = {
        chunks: [
          {
            names: [ 'foo' ],
            files: [ 'foo.js', 'bar.js' ],
          },
        ],
        assets: [
          {
            name: 'foo.js',
            size: 0.75 * KB,
          },
          {
            name: 'bar.js',
            size: 0.75 * KB,
          },
        ],
      } as unknown as webpack.Stats.ToJsonOutput;

      const failures = Array.from(checkBudgets(budgets, stats));

      expect(failures.length).toBe(1);
      expect(failures).toContain({
        severity: ThresholdSeverity.Error,
        message: jasmine.stringMatching('Exceeded maximum budget for foo.'),
      });
    });

    it('yields exceeded initial budget', () => {
      const budgets: Budget[] = [{
        type: Type.Initial,
        maximumError: '1kb',
      }];
      const stats = {
        chunks: [
          {
            initial: true,
            files: [ 'foo.js', 'bar.js' ],
          },
        ],
        assets: [
          {
            name: 'foo.js',
            size: 0.75 * KB,
          },
          {
            name: 'bar.js',
            size: 0.75 * KB,
          },
        ],
      } as unknown as webpack.Stats.ToJsonOutput;

      const failures = Array.from(checkBudgets(budgets, stats));

      expect(failures.length).toBe(1);
      expect(failures).toContain({
        severity: ThresholdSeverity.Error,
        message: jasmine.stringMatching('Exceeded maximum budget for initial.'),
      });
    });

    it('yields exceeded total scripts budget', () => {
      const budgets: Budget[] = [{
        type: Type.AllScript,
        maximumError: '1kb',
      }];
      const stats = {
        chunks: [
          {
            initial: true,
            files: [ 'foo.js', 'bar.js' ],
          },
        ],
        assets: [
          {
            name: 'foo.js',
            size: 0.75 * KB,
          },
          {
            name: 'bar.js',
            size: 0.75 * KB,
          },
          {
            name: 'baz.css',
            size: 1.5 * KB,
          },
        ],
      } as unknown as webpack.Stats.ToJsonOutput;

      const failures = Array.from(checkBudgets(budgets, stats));

      expect(failures.length).toBe(1);
      expect(failures).toContain({
        severity: ThresholdSeverity.Error,
        message: jasmine.stringMatching('Exceeded maximum budget for total scripts.'),
      });
    });

    it('yields exceeded total budget', () => {
      const budgets: Budget[] = [{
        type: Type.All,
        maximumError: '1kb',
      }];
      const stats = {
        chunks: [
          {
            initial: true,
            files: [ 'foo.js', 'bar.css' ],
          },
        ],
        assets: [
          {
            name: 'foo.js',
            size: 0.75 * KB,
          },
          {
            name: 'bar.css',
            size: 0.75 * KB,
          },
        ],
      } as unknown as webpack.Stats.ToJsonOutput;

      const failures = Array.from(checkBudgets(budgets, stats));

      expect(failures.length).toBe(1);
      expect(failures).toContain({
        severity: ThresholdSeverity.Error,
        message: jasmine.stringMatching('Exceeded maximum budget for total.'),
      });
    });

    it('yields exceeded component style budgets', () => {
      const budgets: Budget[] = [{
        type: Type.AnyComponentStyle,
        maximumError: '1kb',
      }];
      const stats = {
        chunks: [
          {
            initial: true,
            files: [ 'foo.css', 'bar.js' ],
          },
        ],
        assets: [
          {
            name: 'foo.css',
            size: 1.5 * KB,
          },
          {
            name: 'bar.js',
            size: 0.5 * KB,
          },
        ],
      } as unknown as webpack.Stats.ToJsonOutput;

      const failures = Array.from(checkBudgets(budgets, stats));

      expect(failures.length).toBe(1);
      expect(failures).toContain({
        severity: ThresholdSeverity.Error,
        message: jasmine.stringMatching('Exceeded maximum budget for foo.css.'),
      });
    });

    it('yields exceeded individual script budget', () => {
      const budgets: Budget[] = [{
        type: Type.AnyScript,
        maximumError: '1kb',
      }];
      const stats = {
        chunks: [
          {
            initial: true,
            files: [ 'foo.js', 'bar.js' ],
          },
        ],
        assets: [
          {
            name: 'foo.js',
            size: 1.5 * KB,
          },
          {
            name: 'bar.js',
            size: 0.5 * KB,
          },
        ],
      } as unknown as webpack.Stats.ToJsonOutput;

      const failures = Array.from(checkBudgets(budgets, stats));

      expect(failures.length).toBe(1);
      expect(failures).toContain({
        severity: ThresholdSeverity.Error,
        message: jasmine.stringMatching('Exceeded maximum budget for foo.js.'),
      });
    });

    it('yields exceeded individual file budget', () => {
      const budgets: Budget[] = [{
        type: Type.Any,
        maximumError: '1kb',
      }];
      const stats = {
        chunks: [
          {
            initial: true,
            files: [ 'foo.ext', 'bar.ext' ],
          },
        ],
        assets: [
          {
            name: 'foo.ext',
            size: 1.5 * KB,
          },
          {
            name: 'bar.ext',
            size: 0.5 * KB,
          },
        ],
      } as unknown as webpack.Stats.ToJsonOutput;

      const failures = Array.from(checkBudgets(budgets, stats));

      expect(failures.length).toBe(1);
      expect(failures).toContain({
        severity: ThresholdSeverity.Error,
        message: jasmine.stringMatching('Exceeded maximum budget for foo.ext.'),
      });
    });
  });
});

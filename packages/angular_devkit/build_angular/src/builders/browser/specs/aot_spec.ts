/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import { Architect } from '@angular-devkit/architect';
import { BrowserBuilderOutput } from '@angular-devkit/build-angular';
import { join, logging, normalize, virtualFs } from '@angular-devkit/core';
import { lastValueFrom } from 'rxjs';
import { createArchitect, host } from '../../../testing/test-utils';

describe('Browser Builder AOT', () => {
  const targetSpec = { project: 'app', target: 'build' };
  let architect: Architect;

  beforeEach(async () => {
    await host.initialize().toPromise();
    architect = (await createArchitect(host.root())).architect;
  });
  afterEach(async () => host.restore().toPromise());

  it('works', async () => {
    const overrides = { aot: true };

    const run = await architect.scheduleTarget(targetSpec, overrides);
    const output = (await run.result) as BrowserBuilderOutput;

    expect(output.success).toBeTrue();

    const fileName = join(normalize(output.outputs[0].path), 'main.js');
    const content = virtualFs.fileBufferToString(
      await lastValueFrom(host.read(normalize(fileName))),
    );
    expect(content).toContain('AppComponent_Factory');

    await run.stop();
  });

  it('shows error when component stylesheet contains SCSS syntax error', async () => {
    const overrides = {
      aot: true,
    };

    host.replaceInFile('src/app/app.component.ts', 'app.component.css', 'app.component.scss');

    host.writeMultipleFiles({
      'src/app/app.component.scss': `
        .foo {
      `,
    });

    const logger = new logging.Logger('');
    const logs: string[] = [];
    logger.subscribe((e) => logs.push(e.message));

    const run = await architect.scheduleTarget(targetSpec, overrides, { logger });
    const output = await run.result;
    expect(output.success).toBe(false);
    expect(logs.join()).toContain('expected "}".');
    await run.stop();
  });
});

/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import { BuilderContext } from '@angular-devkit/architect';
import express from 'express';

export class DevToolsProxy {
  private diGraph?: {};

  private constructor(private readonly context: BuilderContext) {}

  static serve({ context, port }: { context: BuilderContext; port: number }): DevToolsProxy {
    const proxy = new DevToolsProxy(context);
    proxy.start(port);

    return proxy;
  }

  updateDiGraph(diGraph: {}): void {
    this.diGraph = diGraph;
  }

  private start(port: number): void {
    const app = express();
    app.get('/di-graph', (_req, res) => {
      if (!this.diGraph) {
        res.status(500).end('No DI graph.');

        return;
      }

      res.status(200).json(this.diGraph);
    });

    app.listen(port, () => {
      this.context.logger.info(`DevTools proxy port: ${port}.`);
    });
  }
}

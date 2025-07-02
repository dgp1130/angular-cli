/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

export class Tree<Value> {
  constructor(
    public readonly value: Value,
    public readonly children: Array<Tree<Value>>,
  ) {}

  map<Result>(mapper: (value: Value) => Result): Tree<Result> {
    return new Tree(
      mapper(this.value),
      this.children.map((child) => child.map(mapper)),
    );
  }

  optionalMap<Result>(mapper: (value: Value) => Result | undefined): Array<Tree<Result>> {
    const mappedValue = mapper(this.value);
    const mappedChildren = this.children.map((child) => child.optionalMap(mapper)).flat();
    if (mappedValue) {
      return [new Tree(mappedValue, mappedChildren)];
    } else {
      return mappedChildren;
    }
  }

  serialize(serializer: (value: Value) => unknown): SerializedTree {
    return {
      value: serializer(this.value),
      children: this.children.map((child) => child.serialize(serializer)),
    };
  }

  static deserialize<Value>(
    serialized: SerializedTree,
    deserializer: (value: unknown) => Value,
  ): Tree<Value> {
    return new Tree(
      deserializer(serialized.value),
      serialized.children.map((child) => Tree.deserialize(child, deserializer)),
    );
  }

  print(stringify: (value: Value) => string, indentation: number = 0): string {
    const indent = '  '.repeat(indentation);
    const self = `${indent}* ${stringify(this.value)}`;
    if (this.children.length === 0) {
      return self;
    }

    return `${self}\n${this.children
      .map((child) => child.print(stringify, indentation + 1))
      .join('\n')}`;
  }
}

export interface SerializedTree {
  value: unknown;
  children: SerializedTree[];
}

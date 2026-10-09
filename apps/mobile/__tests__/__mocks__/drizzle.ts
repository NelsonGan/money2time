const noop = () => undefined;
const proxy: any = new Proxy(function () {}, {
  get: () => proxy,
  apply: () => proxy,
  construct: () => proxy,
});

export const and = noop;
export const eq = noop;
export const gte = noop;
export const inArray = noop;
export const isNull = noop;
export const isNotNull = noop;
export const lte = noop;
export const or = noop;
export const sql = proxy;
export const desc = noop;
export const asc = noop;
export const ne = noop;
export const not = noop;
export const like = noop;

export function sqliteTable(_name: string, columns: Record<string, unknown>) {
  return columns;
}

export function integer() {
  return proxy;
}

export function real() {
  return proxy;
}

export function text() {
  return proxy;
}

export function blob() {
  return proxy;
}

export default proxy;

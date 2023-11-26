type LooseObject = { [key: string]: any } | null | undefined;

export default class QueryFilter {
  private filter: Map<string, any>

  constructor (query: any = {}) {
    this.filter = new Map(Object.entries(query))
  }

  private isNullish(value: any) {
    return typeof value === 'undefined' || value === null
  }

  set(key: string, value: string | LooseObject | boolean) {
    if (this.isNullish(value)) {
      return this
    }

    this.filter.set(key, value)

    return this
  }

  explodeInto(key: string, value: LooseObject) {
    if (typeof value === 'undefined' || value === null) {
      return this;
    }

    const keys = Object.keys(value);

    for (const k of keys) {
      const array: any = []
      const data = value[k]
      if (this.isNullish(data) || typeof data !== 'string') {
        continue;
      }

      data.split(',').forEach((s: any) => {
        array.push({ [k]: s.trim() })
      });

      if (this.filter.has(key)) {
        array.forEach((value: any) => this.append(key, value))
        continue;
      }

      this.filter.set(key, array)
    }

    return this
  }

  append(key: string, value: LooseObject) {
    let oldValue = this.filter.get(key)
    if (this.isNullish(value)) {
      return this
    }

    if (!oldValue) {
      this.set(key, value)
      return this;
    }

    switch (true) {
      case oldValue instanceof Array:
        oldValue.push(value)
        break;
      case oldValue instanceof Object:
        oldValue = Object.assign(oldValue, value)
        break;
    }

    return this;
  }

  get object() {
    return Object.fromEntries(this.filter);
  }
}
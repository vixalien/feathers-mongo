// deno-lint-ignore-file no-explicit-any require-await
import { Id, NullableId, PaginationOptions, ServiceMethods } from "./deps.ts";
import { MongoAdapter, MongoAdapterParams, Paginated } from "./adapter.ts";

export * from "./adapter.ts";
export * from "./errorHandler.ts";

export class MongoService<
  T = any,
  D = Partial<T>,
  P extends MongoAdapterParams<any> = MongoAdapterParams,
> extends MongoAdapter<T, D, P> implements ServiceMethods<T | Paginated<T>, D> {
  async setup() {
  }

  async find(
    params?: P & { paginate?: PaginationOptions },
  ): Promise<Paginated<T>>;
  async find(params?: P & { paginate: false }): Promise<T[]>;
  async find(params?: P): Promise<Paginated<T> | T[]>;
  async find(params?: P): Promise<Paginated<T> | T[]> {
    return this._find(params) as any;
  }

  async get(id: Id, params?: P): Promise<T> {
    return this._get(id, params);
  }

  async create(data: Partial<D>, params?: P): Promise<T>;
  async create(data: Partial<D>[], params?: P): Promise<T[]>;
  async create(data: Partial<D> | Partial<D>[], params?: P): Promise<T | T[]> {
    return this._create(data, params);
  }

  async update(id: Id, data: D, params?: P): Promise<T> {
    return this._update(id, data, params);
  }

  async patch(id: Id, data: Partial<D>, params?: P): Promise<T>;
  async patch(id: null, data: Partial<D>, params?: P): Promise<T[]>;
  async patch(id: NullableId, data: Partial<D>, params?: P): Promise<T | T[]> {
    return this._patch(id, data, params);
  }

  async remove(id: Id, params?: P): Promise<T>;
  async remove(id: null, params?: P): Promise<T[]>;
  async remove(id: NullableId, params?: P): Promise<T | T[]> {
    return this._remove(id, params);
  }
}

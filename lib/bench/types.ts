export type BenchProvider = "turso" | "jazz";

export type BenchOperation =
  | "setup"
  | "create"
  | "select10"
  | "selectTopN"
  | "getById"
  | "updateTopN"
  | "updateById"
  | "suite";
export type JazzDurabilityTier = "local" | "edge" | "global";

export type BenchOptions = {
  jazzDurabilityTier?: JazzDurabilityTier;
};

export type BenchItem = {
  id: string;
  ordinal: number;
  value: string;
  createdAt: number;
};

export type CreateResult = {
  count: number;
  firstId?: string;
  lastId?: string;
};

export type UpdateResult = {
  count: number;
  ids: string[];
};

export type BenchAdapter = {
  name: BenchProvider;
  setup(options?: BenchOptions): Promise<void>;
  createItems(count: number, options?: BenchOptions): Promise<CreateResult>;
  select10(options?: BenchOptions): Promise<BenchItem[]>;
  selectTopN(n: number, options?: BenchOptions): Promise<BenchItem[]>;
  getById(id: string, options?: BenchOptions): Promise<BenchItem | null>;
  updateTopN(n: number, options?: BenchOptions): Promise<UpdateResult>;
  updateById(id: string, options?: BenchOptions): Promise<UpdateResult>;
};

export type BenchRequest = {
  operation?: BenchOperation;
  count?: number;
  n?: number;
  id?: string;
  jazzDurabilityTier?: JazzDurabilityTier;
};

export type TimedResult<T> = {
  ms: number;
  result: T;
};

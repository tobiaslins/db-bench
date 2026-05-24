export type BenchProvider = "jazz" | "postgres" | "turso";

export type BenchOperation =
  | "setup"
  | "createOne"
  | "create"
  | "select10"
  | "selectTopN"
  | "getById"
  | "updateTopN"
  | "updateById"
  | "suite";
export type JazzDurabilityTier = "local" | "edge" | "global";
export type JazzLocalUpdates = "immediate" | "deferred";

export type BenchOptions = {
  jazzDurabilityTier?: JazzDurabilityTier;
  jazzLocalUpdates?: JazzLocalUpdates;
  runId: string;
};

export type BenchItem = {
  id: string;
  runId: string;
  ordinal: number;
  value: string;
  createdAt: number;
};

export type CreateResult = {
  count: number;
  runId: string;
  firstId?: string;
  lastId?: string;
};

export type UpdateResult = {
  count: number;
  runId: string;
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
  runId?: string;
  jazzDurabilityTier?: JazzDurabilityTier;
  jazzLocalUpdates?: JazzLocalUpdates;
};

export type TimedResult<T> = {
  ms: number;
  result: T;
};

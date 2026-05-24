import type { BenchAdapter, BenchOperation, BenchRequest, TimedResult } from "./types";
import { clampInteger } from "./items";

async function timed<T>(run: () => Promise<T>): Promise<TimedResult<T>> {
  const startedAt = performance.now();
  const result = await run();

  return {
    ms: Number((performance.now() - startedAt).toFixed(3)),
    result,
  };
}

export async function runBench(adapter: BenchAdapter, request: BenchRequest) {
  const operation: BenchOperation = request.operation ?? "suite";
  const count = clampInteger(request.count, 100, 1000);
  const n = clampInteger(request.n, 10, 1000);
  const options = {
    jazzDurabilityTier: request.jazzDurabilityTier,
  };

  console.log("operation", {options});
  if (operation === "setup") {
    return timed(() => adapter.setup(options));
  }

  await adapter.setup(options);

  if (operation === "create") {
    return timed(() => adapter.createItems(count, options));
  }

  if (operation === "select10") {
    return timed(() => adapter.select10(options));
  }

  if (operation === "selectTopN") {
    return timed(() => adapter.selectTopN(n, options));
  }

  if (operation === "getById") {
    if (!request.id) {
      throw new Error("getById requires an id");
    }

    return timed(() => adapter.getById(request.id as string, options));
  }

  if (operation === "updateTopN") {
    return timed(() => adapter.updateTopN(n, options));
  }

  if (operation === "updateById") {
    if (!request.id) {
      throw new Error("updateById requires an id");
    }

    return timed(() => adapter.updateById(request.id as string, options));
  }

  if (operation === "suite") {
    const create = await timed(() => adapter.createItems(count, options));
    const select10 = await timed(() => adapter.select10(options));
    const selectTopN = await timed(() => adapter.selectTopN(n, options));
    const id = create.result.firstId;
    const getById = id ? await timed(() => adapter.getById(id, options)) : null;
    const updateById = id ? await timed(() => adapter.updateById(id, options)) : null;
    const updateTopN = await timed(() => adapter.updateTopN(n, options));

    return {
      create,
      select10,
      selectTopN,
      getById,
      updateById,
      updateTopN,
    };
  }

  throw new Error(`Unsupported operation: ${operation}`);
}

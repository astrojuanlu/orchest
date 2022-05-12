import { PipelineJson } from "@/types";
import { getPipelineJSONEndpoint } from "@/utils/webserver-utils";
import { fetcher, hasValue } from "@orchest/lib-utils";
import React from "react";
import useSWR, { useSWRConfig } from "swr";
import { MutatorCallback } from "swr/dist/types";

type FetchPipelineJsonProps = {
  jobUuid?: string | undefined;
  runUuid?: string | undefined;
  pipelineUuid: string | undefined;
  projectUuid: string | undefined;
  clearCacheOnUnmount?: boolean;
  revalidateOnFocus?: boolean;
};

export const fetchPipelineJson = (
  props:
    | string
    | {
        pipelineUuid: string | undefined;
        projectUuid: string | undefined;
        jobUuid?: string | undefined;
        runUuid?: string | undefined;
      }
) => {
  const url =
    typeof props === "string" ? props : getPipelineJSONEndpoint(props);

  if (!url) return Promise.reject();

  return fetcher<{
    pipeline_json: string;
    success: boolean;
  }>(url).then((result) => {
    if (!result.success) {
      throw new Error("Failed to fetch pipeline.json");
    }

    const pipelineObj = JSON.parse(result.pipeline_json) as PipelineJson;

    // as settings are optional, populate defaults if no values exist
    if (pipelineObj.settings === undefined) {
      pipelineObj.settings = {};
    }
    if (pipelineObj.settings.auto_eviction === undefined) {
      pipelineObj.settings.auto_eviction = false;
    }
    if (pipelineObj.settings.data_passing_memory_size === undefined) {
      pipelineObj.settings.data_passing_memory_size = "1GB";
    }
    if (pipelineObj.parameters === undefined) {
      pipelineObj.parameters = {};
    }
    if (pipelineObj.services === undefined) {
      pipelineObj.services = {};
    }

    let maxOrder = 0;
    const sortedServices = Object.entries(pipelineObj.services).sort((a, b) => {
      if (!hasValue(a[1].order) && !hasValue(b[1].order))
        return a[1].name.localeCompare(b[1].name); // If both services have no order value, sort them by name.
      if (!hasValue(a[1].order)) return -1;
      if (!hasValue(b[1].order)) return 1;
      maxOrder = Math.max(maxOrder, a[1].order, b[1].order);
      return a[1].order - b[1].order;
    });
    // Add `order` if it's undefined
    for (let sorted of sortedServices) {
      if (!hasValue(pipelineObj.services[sorted[0]].order)) {
        pipelineObj.services[sorted[0]].order = maxOrder + 1;
        maxOrder += 1;
      }
    }

    return pipelineObj;
  });
};

export const useFetchPipelineJson = (
  props: FetchPipelineJsonProps | undefined
) => {
  const { cache } = useSWRConfig();
  const {
    pipelineUuid,
    projectUuid,
    jobUuid,
    runUuid,
    clearCacheOnUnmount,
    revalidateOnFocus = true,
  } = props || {};

  const cacheKey = getPipelineJSONEndpoint({
    pipelineUuid,
    projectUuid,
    jobUuid,
    runUuid,
  });

  const { data, error, isValidating, mutate } = useSWR<
    PipelineJson | undefined
  >(
    cacheKey || null,
    () =>
      fetchPipelineJson({
        pipelineUuid,
        projectUuid,
        jobUuid,
        runUuid,
      }),
    { revalidateOnFocus }
  );

  const setPipelineJson = React.useCallback(
    (
      data?:
        | PipelineJson
        | undefined
        | Promise<PipelineJson | undefined>
        | MutatorCallback<PipelineJson | undefined>
    ) => mutate(data, false),
    [mutate]
  );

  React.useEffect(() => {
    return () => {
      if (clearCacheOnUnmount) {
        setPipelineJson(undefined);
      }
    };
  }, [clearCacheOnUnmount, setPipelineJson]);

  // Note that pipelineJson should be assumed
  // to be immutable (due to SWR).
  const pipelineJson = data || (cache.get(cacheKey) as PipelineJson);

  return {
    pipelineJson,
    error,
    isFetchingPipelineJson: isValidating,
    fetchPipelineJson: mutate,
    setPipelineJson,
  };
};

import { useProjectsContext } from "@/contexts/ProjectsContext";
import { useActiveStep } from "@/hooks/useActiveStep";
import { useCustomRoute, useNavigate } from "@/hooks/useCustomRoute";
import { useProjectPipelineJsons } from "@/hooks/useProjectPipelineJsons";
import { PipelineMetaData, PipelineState, StepData, StepState } from "@/types";
import { dirname } from "@/utils/path";
import { stepPathToProjectPath } from "@/utils/pipeline";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { hasValue } from "@orchest/lib-utils";
import React from "react";

type BakedPipeline = {
  meta: PipelineMetaData;
  state: PipelineState;
};

type UsedIn = BakedPipeline & { step: StepData };

export type StepPipelines = {
  step: StepState;
};

export const StepPipelineSelector = () => {
  const step = useActiveStep();
  const states = useProjectPipelineJsons();
  const { pipelines: metadata = [] } = useProjectsContext().state;
  const { pipelineUuid, jobUuid } = useCustomRoute();
  const navigate = useNavigate();
  const pipelines = React.useMemo(() => {
    return bakePipelines(metadata, states);
  }, [metadata, states]);

  const stepFilePath = React.useMemo(() => {
    if (!step) return undefined;

    const pipeline = pipelines.find(({ meta }) => meta.uuid === pipelineUuid);

    if (!pipeline) return undefined;

    const cwd = dirname(pipeline.meta.path);

    return stepPathToProjectPath(step.file_path, cwd);
  }, [pipelines, step, pipelineUuid]);

  const usedIn = React.useMemo<UsedIn[]>(() => {
    if (!stepFilePath) return [];

    return pipelines
      .map(({ meta, state }) => {
        const cwd = dirname(meta.path);
        const step = Object.values(state.steps).find(({ file_path }) => {
          const { root, path } = stepPathToProjectPath(file_path, cwd);

          return root === stepFilePath.root && path === stepFilePath.path;
        });

        return step ? { step, meta, state } : undefined;
      })
      .filter(hasValue);
  }, [pipelines, stepFilePath]);

  const changePipeline = (newPipelineUuid: string) => {
    const stepUuid = usedIn.find((usage) => usage.meta.uuid === newPipelineUuid)
      ?.step.uuid;

    if (!stepUuid) return;

    navigate({
      route: hasValue(jobUuid) ? "jobRunFilePreview" : "filePreview",
      query: { pipelineUuid: newPipelineUuid, stepUuid },
    });
  };

  if (usedIn.length < 2) return null;

  return (
    <Stack position="relative" direction="row" spacing={1} alignItems="center">
      <Typography variant="body2" color="text.secondary">
        Used in {usedIn.length} Pipelines:
      </Typography>
      <Select
        size="small"
        value={pipelineUuid}
        onChange={(event) => changePipeline(event.target.value)}
        sx={{
          padding: "0 !important",
          fontSize: "14px",
          fieldset: { border: "none" },
          ".MuiSelect-select": { padding: 0 },
        }}
      >
        {usedIn.map(({ meta }) => (
          <MenuItem
            key={meta.uuid}
            selected={pipelineUuid === meta.uuid}
            value={meta.uuid}
            dense
          >
            {meta.path}
          </MenuItem>
        ))}
      </Select>
    </Stack>
  );
};

const bakePipelines = (
  metadata: PipelineMetaData[],
  states: PipelineState[]
): BakedPipeline[] => {
  const result: BakedPipeline[] = [];

  for (const meta of metadata) {
    const state = states.find((state) => state.uuid === meta.uuid);

    if (state) result.push({ meta, state });
  }

  return result;
};

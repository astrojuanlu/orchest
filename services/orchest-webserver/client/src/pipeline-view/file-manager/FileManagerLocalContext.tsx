import { filesApi } from "@/api/files/fileApi";
import { useFileApi } from "@/api/files/useFileApi";
import { Code } from "@/components/common/Code";
import { useGlobalContext } from "@/contexts/GlobalContext";
import { useProjectsContext } from "@/contexts/ProjectsContext";
import { useCustomRoute } from "@/hooks/useCustomRoute";
import { fetchPipelines } from "@/hooks/useFetchPipelines";
import { siteMap } from "@/routingConfig";
import { unpackPath } from "@/utils/file";
import { Point2D } from "@/utils/geometry";
import { basename } from "@/utils/path";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import React from "react";
import {
  filterRedundantChildPaths,
  findPipelineFiles,
  prettifyRoot,
} from "./common";
import { useFileManagerContext } from "./FileManagerContext";

export type FileManagerLocalContextType = {
  handleClose: () => void;
  handleContextMenu: (
    event: React.MouseEvent,
    combinedPath: string | undefined
  ) => void;
  handleSelect: (
    event: React.SyntheticEvent<Element, Event>,
    selected: string[]
  ) => void;
  handleDelete: () => void;
  handleDownload: () => void;
  handleRename: () => void;
  contextMenuPath: string | undefined;
  fileInRename: string | undefined;
  setFileInRename: React.Dispatch<React.SetStateAction<string | undefined>>;
  fileRenameNewName: string;
  setFileRenameNewName: React.Dispatch<React.SetStateAction<string>>;
  setContextMenuOrigin: React.Dispatch<
    React.SetStateAction<Point2D | undefined>
  >;
};

export const FileManagerLocalContext = React.createContext<
  FileManagerLocalContextType
>({} as FileManagerLocalContextType);

export const useFileManagerLocalContext = () =>
  React.useContext(FileManagerLocalContext);

const download = (projectUuid: string, combinedPath: string, name: string) => {
  if (!projectUuid) return;

  const { root, path } = unpackPath(combinedPath);
  const downloadUrl = filesApi.getDownloadUrl(projectUuid, root, path);

  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

export const FileManagerLocalContextProvider: React.FC<{
  setContextMenuOrigin: React.Dispatch<
    React.SetStateAction<Point2D | undefined>
  >;
}> = ({ children, setContextMenuOrigin }) => {
  const { setConfirm } = useGlobalContext();
  const {
    state: { pipelines = [], pipelineReadOnlyReason },
    dispatch,
  } = useProjectsContext();
  const { projectUuid, pipelineUuid, navigateTo } = useCustomRoute();

  const { selectedFiles, setSelectedFiles } = useFileManagerContext();

  // When deleting or downloading selectedFiles, we need to avoid
  // the redundant child paths.
  // e.g. if we delete folder `/a/b`, deleting `/a/b/c.py` should be avoided.
  const selectedFilesWithoutRedundantChildPaths = React.useMemo(() => {
    return filterRedundantChildPaths(selectedFiles);
  }, [selectedFiles]);

  const pipeline = React.useMemo(() => {
    return pipelines.find((pipeline) => pipeline.uuid === pipelineUuid);
  }, [pipelines, pipelineUuid]);

  const [contextMenuPath, setContextMenuPath] = React.useState<string>();
  const [fileInRename, setFileInRename] = React.useState<string>();
  const [fileRenameNewName, setFileRenameNewName] = React.useState("");
  const deleteFile = useFileApi((api) => api.delete);

  const handleContextMenu = React.useCallback(
    (event: React.MouseEvent, combinedPath: string | undefined) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenuPath(combinedPath);
      setContextMenuOrigin((current) =>
        !current ? [event.clientX - 2, event.clientY - 4] : undefined
      );
    },
    [setContextMenuOrigin]
  );

  const handleSelect = React.useCallback(
    (event: React.SyntheticEvent<Element, Event>, selected: string[]) => {
      event.stopPropagation();
      setSelectedFiles(selected);
    },
    [setSelectedFiles]
  );

  const handleClose = React.useCallback(() => {
    setContextMenuOrigin(undefined);
  }, [setContextMenuOrigin]);

  const handleRename = React.useCallback(() => {
    if (pipelineReadOnlyReason || !contextMenuPath) return;

    handleClose();
    setFileInRename(contextMenuPath);
    setFileRenameNewName(basename(contextMenuPath));
  }, [contextMenuPath, handleClose, pipelineReadOnlyReason]);

  const handleDelete = React.useCallback(async () => {
    if (pipelineReadOnlyReason || !contextMenuPath || !projectUuid) return;

    handleClose();

    const filesToDelete = selectedFiles.includes(contextMenuPath)
      ? selectedFilesWithoutRedundantChildPaths
      : [contextMenuPath];

    const fileBaseName = basename(filesToDelete[0]);
    const filesToDeleteString =
      filesToDelete.length > 1 ? (
        `${filesToDelete.length} files`
      ) : (
        <Code>{fileBaseName}</Code>
      );

    const pathsThatContainsPipelineFiles = await findPipelineFiles(
      projectUuid,
      filesToDelete.map((combinedPath) => unpackPath(combinedPath))
    );

    const shouldShowPipelineFilePaths =
      !fileBaseName.endsWith(".orchest") && // Only one file to delete and it is a `.orchest` file
      pathsThatContainsPipelineFiles.length > 0;

    setConfirm(
      "Warning",
      <Stack spacing={2} direction="column">
        <Box>
          {`Are you sure you want to delete `} {filesToDeleteString}
          {` ?`}
        </Box>
        {shouldShowPipelineFilePaths && (
          <>
            <Box>
              Following pipeline files will also be deleted and it cannot be
              undone.
            </Box>
            <ul>
              {pathsThatContainsPipelineFiles.map((file) => (
                <Box key={`${file.root}/${file.path}`}>
                  <Code>{prettifyRoot(file.root) + file.path}</Code>
                </Box>
              ))}
            </ul>
          </>
        )}
      </Stack>,
      async (resolve) => {
        await Promise.all(
          filesToDelete
            .map(unpackPath)
            .map(({ root, path }) => deleteFile(root, path))
        );
        // Send a GET request for file discovery
        // to ensure that the pipeline is removed from DB.
        const updatedPipelines = await fetchPipelines(projectUuid);
        dispatch({ type: "SET_PIPELINES", payload: updatedPipelines });

        const shouldRedirect = filesToDelete.some((fileToDelete) => {
          const { path } = unpackPath(fileToDelete);
          const pathToDelete = path.replace(/^\//, "");

          const isDeletingPipelineFileDirectly =
            pathToDelete === pipeline?.path;
          const isDeletingParentFolder =
            pathToDelete.endsWith("/") &&
            pipeline?.path.startsWith(pathToDelete);

          return isDeletingPipelineFileDirectly || isDeletingParentFolder;
        });

        if (shouldRedirect) {
          // redirect back to pipelines
          navigateTo(siteMap.pipeline.path, {
            query: { projectUuid },
          });
          resolve(true);
          return true;
        }

        resolve(true);
        return true;
      }
    );
  }, [
    pipelineReadOnlyReason,
    contextMenuPath,
    projectUuid,
    handleClose,
    selectedFiles,
    selectedFilesWithoutRedundantChildPaths,
    setConfirm,
    dispatch,
    deleteFile,
    pipeline?.path,
    navigateTo,
  ]);

  const handleDownload = React.useCallback(() => {
    if (!contextMenuPath || !projectUuid) return;
    handleClose();

    const name = basename(contextMenuPath);

    if (selectedFiles.includes(contextMenuPath)) {
      selectedFilesWithoutRedundantChildPaths.forEach((combinedPath, i) => {
        setTimeout(function () {
          download(projectUuid, combinedPath, name);
        }, i * 500);
        // Seems like multiple download invocations works with 500ms
        // Not the most reliable, might want to fall back to server side zip.
      });
    } else {
      download(projectUuid, contextMenuPath, name);
    }
  }, [
    projectUuid,
    contextMenuPath,
    handleClose,
    selectedFiles,
    selectedFilesWithoutRedundantChildPaths,
  ]);

  return (
    <FileManagerLocalContext.Provider
      value={{
        handleClose,
        handleContextMenu,
        handleSelect,
        handleDelete,
        handleDownload,
        handleRename,
        contextMenuPath,
        fileInRename,
        setFileInRename,
        fileRenameNewName,
        setFileRenameNewName,
        setContextMenuOrigin,
      }}
    >
      {children}
    </FileManagerLocalContext.Provider>
  );
};

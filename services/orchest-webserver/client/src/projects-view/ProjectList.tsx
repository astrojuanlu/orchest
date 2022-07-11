import { useAppContext } from "@/contexts/AppContext";
import { useProjectsContext } from "@/contexts/ProjectsContext";
import { useCustomRoute } from "@/hooks/useCustomRoute";
import { siteMap } from "@/routingConfig";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { fetcher, HEADER } from "@orchest/lib-utils";
import React from "react";
import { ProjectsTable } from "./ProjectsTable";

export const ProjectList = () => {
  const { setConfirm, setAlert } = useAppContext();
  const { navigateTo } = useCustomRoute();
  const {
    dispatch,
    state: { projectUuid, projects },
  } = useProjectsContext();

  const [
    selectedProjectMenuButton,
    setSelectedProjectMenuButton,
  ] = React.useState<{ element: HTMLElement; uuid: string; name: string }>();

  const [projectsBeingDeleted, setProjectsBeingDeleted] = React.useState<
    string[]
  >([]);

  const closeProjectMenu = () => setSelectedProjectMenuButton(undefined);

  const openProjectMenu = React.useCallback(
    (projectUuid: string) => (event: React.MouseEvent<HTMLElement>) => {
      const selectedProject = projects?.find(
        (project) => project.uuid === projectUuid
      );
      if (!selectedProject) return;
      event.preventDefault();
      event.stopPropagation();
      setSelectedProjectMenuButton({
        element: event.currentTarget,
        uuid: projectUuid,
        name: selectedProject.path,
      });
    },
    [projects]
  );

  const openSettings = (e: React.MouseEvent) => {
    if (selectedProjectMenuButton)
      navigateTo(
        siteMap.projectSettings.path,
        { query: { projectUuid: selectedProjectMenuButton.uuid } },
        e
      );
  };

  const requestDeleteProject = async (toBeDeletedId: string) => {
    if (projectUuid === toBeDeletedId) {
      dispatch({ type: "SET_PROJECT", payload: undefined });
    }

    setProjectsBeingDeleted((current) => {
      return [...current, toBeDeletedId];
    });
    setSelectedProjectMenuButton(undefined);
    try {
      await fetcher("/async/projects", {
        method: "DELETE",
        headers: HEADER.JSON,
        body: JSON.stringify({ project_uuid: toBeDeletedId }),
      });
      dispatch((current) => {
        const updatedProjects = (current.projects || []).filter(
          (project) => project.uuid !== toBeDeletedId
        );
        return { type: "SET_PROJECTS", payload: updatedProjects };
      });
    } catch (error) {
      setAlert("Error", `Could not delete project. ${error.message}`);
    }

    setProjectsBeingDeleted((current) => {
      return current.filter((projectUuid) => projectUuid !== toBeDeletedId);
    });
  };

  const deleteProject = async (projectName: string) => {
    if (!selectedProjectMenuButton) return;
    // setConfirm returns a Promise, which is then passed to DataTable deleteSelectedRows function
    // DataTable then is able to act upon the outcome of the deletion operation
    return setConfirm(
      `Delete "${projectName}"?`,
      "Warning: Deleting a Project is permanent. All associated Jobs and resources will be deleted and unrecoverable.",
      {
        onConfirm: async (resolve) => {
          // we don't await this Promise on purpose
          // because we want the dialog close first, and resolve setConfirm later
          requestDeleteProject(selectedProjectMenuButton.uuid);
          resolve(true);
          return true; // 1. this is resolved first, thus, the dialog will be gone once user click CONFIRM
        },
        cancelLabel: "Keep project",
        confirmLabel: "Confirm delete",
        confirmButtonColor: "error",
      }
    );
  };

  return (
    <>
      <ProjectsTable
        projects={projects}
        openProjectMenu={openProjectMenu}
        projectsBeingDeleted={projectsBeingDeleted}
      />
      {selectedProjectMenuButton && (
        <Menu
          anchorEl={selectedProjectMenuButton.element}
          id="project-menu"
          open={Boolean(selectedProjectMenuButton)}
          onClose={closeProjectMenu}
          transformOrigin={{ horizontal: "right", vertical: "top" }}
          anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        >
          <MenuItem onClick={openSettings}>
            <ListItemIcon>
              <SettingsOutlinedIcon fontSize="small" />
            </ListItemIcon>
            Project settings
          </MenuItem>
          <MenuItem
            onClick={() => deleteProject(selectedProjectMenuButton.name)}
          >
            <ListItemIcon>
              <DeleteOutlineOutlinedIcon fontSize="small" />
            </ListItemIcon>
            Delete Project
          </MenuItem>
        </Menu>
      )}
    </>
  );
};

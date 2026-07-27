import crypto from "crypto";
import CodeProject from "../models/CodeProject.js";

/*
  Editor project ko MongoDB mein save karega.

  POST /api/code-projects/save
*/
export const saveCodeProject = async (req, res) => {
  try {
    const ownerId =
      req.headers["x-ajyus-user-id"] ||
      req.headers["x-user-id"] ||
      req.body?.ownerId;

    const projectName =
      typeof req.body?.projectName === "string"
        ? req.body.projectName.trim()
        : "My Website";

    const incomingProjectId =
      typeof req.body?.projectId === "string"
        ? req.body.projectId.trim()
        : "";

    const files =
      req.body?.files &&
      typeof req.body.files === "object" &&
      !Array.isArray(req.body.files)
        ? req.body.files
        : null;

    if (!ownerId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required."
      });
    }

    if (!files) {
      return res.status(400).json({
        success: false,
        error: "Project files are required."
      });
    }

    const projectId =
      incomingProjectId ||
      crypto.randomUUID();

    /*
      Check karo ki same project kisi doosre
      user ka to nahi hai.
    */
    const existingProject =
      await CodeProject.findOne({
        projectId
      });

    if (
      existingProject &&
      existingProject.ownerId !== ownerId
    ) {
      return res.status(403).json({
        success: false,
        error:
          "You do not have permission to edit this project."
      });
    }

    let project;

    if (existingProject) {
      existingProject.projectName =
        projectName || existingProject.projectName;

      existingProject.files = files;
      existingProject.framework =
        req.body?.framework ||
        existingProject.framework;

      existingProject.status =
        req.body?.status ||
        existingProject.status;

      existingProject.lastSavedAt =
        new Date();

      project =
        await existingProject.save();
    } else {
      project =
        await CodeProject.create({
          projectId,
          ownerId,
          projectName:
            projectName || "My Website",
          files,
          framework:
            req.body?.framework ||
            "html-css-javascript",
          status: "draft",
          lastSavedAt: new Date()
        });
    }

    return res.status(200).json({
      success: true,
      message: "Project saved successfully.",
      project: {
        projectId: project.projectId,
        projectName: project.projectName,
        files: project.files,
        framework: project.framework,
        status: project.status,
        frontendUrl: project.frontendUrl,
        backendUrl: project.backendUrl,
        customDomain: project.customDomain,
        lastSavedAt: project.lastSavedAt,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt
      }
    });
  } catch (error) {
    console.error(
      "Save code project error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "The project could not be saved."
    });
  }
};

/*
  Ek particular project MongoDB se load karega.

  GET /api/code-projects/:projectId
*/
export const getCodeProject = async (
  req,
  res
) => {
  try {
    const ownerId =
      req.headers["x-ajyus-user-id"] ||
      req.headers["x-user-id"] ||
      req.query?.ownerId;

    const projectId =
      typeof req.params?.projectId === "string"
        ? req.params.projectId.trim()
        : "";

    if (!ownerId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required."
      });
    }

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: "Project ID is required."
      });
    }

    const project =
      await CodeProject.findOne({
        projectId,
        ownerId
      }).lean();

    if (!project) {
      return res.status(404).json({
        success: false,
        error: "Project was not found."
      });
    }

    return res.status(200).json({
      success: true,
      project
    });
  } catch (error) {
    console.error(
      "Get code project error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "The project could not be loaded."
    });
  }
};

/*
  User ke saare projects ki list dega.

  GET /api/code-projects
*/
export const getCodeProjects = async (
  req,
  res
) => {
  try {
    const ownerId =
      req.headers["x-ajyus-user-id"] ||
      req.headers["x-user-id"] ||
      req.query?.ownerId;

    if (!ownerId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required."
      });
    }

    const projects =
      await CodeProject.find({
        ownerId
      })
        .select(
          "projectId projectName framework status frontendUrl backendUrl customDomain lastSavedAt createdAt updatedAt"
        )
        .sort({
          updatedAt: -1
        })
        .lean();

    return res.status(200).json({
      success: true,
      projects
    });
  } catch (error) {
    console.error(
      "Get code projects error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "Projects could not be loaded."
    });
  }
};

/*
  Project delete karega.

  DELETE /api/code-projects/:projectId
*/
export const deleteCodeProject = async (
  req,
  res
) => {
  try {
    const ownerId =
      req.headers["x-ajyus-user-id"] ||
      req.headers["x-user-id"] ||
      req.body?.ownerId;

    const projectId =
      typeof req.params?.projectId === "string"
        ? req.params.projectId.trim()
        : "";

    if (!ownerId || !projectId) {
      return res.status(400).json({
        success: false,
        error:
          "User ID and Project ID are required."
      });
    }

    const deletedProject =
      await CodeProject.findOneAndDelete({
        projectId,
        ownerId
      });

    if (!deletedProject) {
      return res.status(404).json({
        success: false,
        error: "Project was not found."
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Project deleted successfully."
    });
  } catch (error) {
    console.error(
      "Delete code project error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "The project could not be deleted."
    });
  }
};

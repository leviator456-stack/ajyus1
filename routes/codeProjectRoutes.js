import express from "express";

import {
  saveCodeProject,
  getCodeProject,
  getCodeProjects,
  deleteCodeProject
} from "../controllers/codeProjectController.js";

const router = express.Router();

/*
  User ke sabhi projects ki list
  GET /api/code-projects
*/
router.get(
  "/",
  getCodeProjects
);

/*
  Ek particular project load karna
  GET /api/code-projects/:projectId
*/
router.get(
  "/:projectId",
  getCodeProject
);

/*
  Naya project create ya existing project update
  POST /api/code-projects/save
*/
router.post(
  "/save",
  saveCodeProject
);

/*
  Project delete karna
  DELETE /api/code-projects/:projectId
*/
router.delete(
  "/:projectId",
  deleteCodeProject
);

export default router;

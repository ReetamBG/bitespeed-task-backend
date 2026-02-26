import { Router } from "express";
import { insertContact } from "../controllers/identify.controller.js";

const router = Router();

router.post("/", insertContact);

export default router;
